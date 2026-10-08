import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addImports, addPlugin, addVitePlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import {
  buildDynamicRoutePath,
  catalogRouteTarget,
  createEldraClient,
  EldraClientError,
  parseDynamicRoutePattern,
  resolvePagePath,
  stripStega,
  type CatalogDoc,
  type EldraClient,
  type EldraRetryOptions,
  type EntryDoc,
} from '@eldrajs/theme-core';
import { createEldraClient as createEldraCommerceClient } from '@eldrajs/sdk';
import eldraTheme, {
  type DeclaredSeed,
  type DeclaredThemeCodePage,
  type EldraThemeOptions,
  type ManifestRoute,
  type ManifestTemplateRoles,
} from '@eldrajs/vite-plugin-theme';
import type { LayoutBreakpoints } from '@eldrajs/theme-core/layout';
import { catalogDocRoutes, listCatalogDocs, type CatalogRouteKind } from './runtime/catalog';
import { readStoreCommerce, type StoreCommerce } from './runtime/commerce';
import { normalizeLocale } from './runtime/locale';
import {
  localePathFor,
  readStoreLocales,
  resolveLocaleRouting,
  type EldraLocaleRouting,
  type StoreLocales,
} from './runtime/locales';
import { readThemeMessages, resolveSiteMessages } from './runtime/messages';
import { listAllEntries } from './runtime/resolveRoute';

export interface ModuleOptions {
  gatewayUrl: string;
  orgId: string;
  studioOrigins: string[];
  pageSchema: string;
  routeTemplateSchema: string;
  locale?: string;
  routes?: ManifestRoute[];
  customPages?: DeclaredThemeCodePage[];
  /** What to seed a site with on its first deploy: route templates (at most 8)
   * and static pages (`{ page: { slug }, title, blocks }`, at most 16) in one
   * list. A seed is ignored once the site has a template for its route pattern,
   * or a page with its slug, so nothing a merchant has edited is overwritten by
   * a later deploy. */
  templates?: DeclaredSeed[];
  /** The block data behind the `header`/`footer` roles the declared
   * `templates` layouts may reference. See that package's changelog for the
   * validation rules. */
  templateRoles?: ManifestTemplateRoles;
  tailwind?: boolean;
  /** The theme's own tablet/normal layout breakpoints (min-width px), so
   * Studio's UI can react to the theme's actual ranges (its side panels
   * overlay the preview at `tablet + 100`px) instead of a value the theme
   * may not share. Resolved and validated in @eldrajs/theme-core
   * (resolveLayoutBreakpoints) — an invalid pair falls back to the defaults
   * (768/1024) with a console warning rather than failing the build.
   * Reaches both the layout stylesheet and `theme:ready` via the theme
   * manifest (`virtual:eldra/manifest`), the one resolved value every
   * consumer reads. */
  breakpoints?: LayoutBreakpoints;
  /**
   * How hard every gateway read tries again when the gateway says "not now" —
   * a `429` from its rate limit, a `503` while it restarts, a dropped
   * connection. Defaults to five attempts with exponential backoff and jitter,
   * honouring `Retry-After`; `{ attempts: 0 }` turns it off.
   *
   * It is what keeps a static build of a large site alive: a `nuxi generate`
   * is thousands of reads from one address, which is enough to meet a
   * per-minute rate limit, and with `nitro.prerender.failOnError` set (as it
   * should be) one refusal ends the build. Reaches **both** transports — this
   * module's own prerender reads and the theme's at request time
   * (`@eldrajs/theme-core`), and the platform read behind `commerce`/`locales`
   * (`@eldrajs/sdk`) — and is carried in the public runtime config, so a
   * storefront building its own commerce client reads the same policy.
   */
  retry?: EldraRetryOptions;
}

/** The slice of Nitro's runtime context this module reads from `nitro:init`. */
interface NitroInitContext {
  hooks: { hook: (name: 'prerender:done', callback: () => void) => void };
  options: { output: { publicDir: string } };
}

const eldraModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@eldrajs/theme-nuxt',
    configKey: 'eldra',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    gatewayUrl: process.env.ELDRA_GATEWAY_URL ?? '',
    orgId: process.env.ELDRA_ORG_ID ?? '',
    locale: process.env.ELDRA_LOCALE ?? undefined,
    // A preview bridge must be explicitly scoped by the consuming theme.
    // Never supply a broad fallback origin.
    studioOrigins: [],
    pageSchema: 'page',
    routeTemplateSchema: 'route-template',
    tailwind: false,
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const studioOrigins = validateStudioOrigins(options.studioOrigins);

    // A named, mutable object — not an inline literal — because `resolveMessages` below is set
    // only after this module's own platform read settles, near the end of `setup()`. `eldraTheme`
    // closes over this exact object, so Vite's hooks (which all run after `setup()` resolves) see
    // whatever is on it by the time they run, not a snapshot taken here.
    const themeOptions: EldraThemeOptions = {
      framework: 'nuxt',
      routes: options.routes,
      customPages: options.customPages,
      templates: options.templates,
      templateRoles: options.templateRoles,
      themeDir: nuxt.options.rootDir,
      tailwind: options.tailwind,
      breakpoints: options.breakpoints,
    };
    addVitePlugin(eldraTheme(themeOptions));
    if (options.tailwind === true) {
      nuxt.options.css.push('virtual:eldra/tailwind-theme.css');
    }

    const existingRuntimeConfig = nuxt.options.runtimeConfig.public.eldra as
      | Partial<ModuleOptions>
      | undefined;
    // Do not deep-merge this object: defu concatenates configured origin arrays
    // with module defaults, which would silently re-authorize a default wildcard.
    nuxt.options.runtimeConfig.public.eldra = {
      ...existingRuntimeConfig,
      gatewayUrl: options.gatewayUrl,
      orgId: options.orgId,
      studioOrigins: [...studioOrigins],
      pageSchema: options.pageSchema,
      routeTemplateSchema: options.routeTemplateSchema,
      // Normalised here too, so a blank `ELDRA_LOCALE` or `eldra.locale`
      // reaches the client as "no locale" rather than an empty `?locale=`.
      locale: normalizeLocale(options.locale) ?? null,
      // What the store sells in, filled in below once the platform has
      // answered. Written here as well so the key exists for anything that
      // reads this object during another module's own `setup`.
      commerce: null as StoreCommerce | null,
      // Which locales the site serves, filled in below from the same platform read. Written here
      // first for the same reason: the key has to exist before another module's `setup` can look
      // for it. See `./runtime/locales.ts`.
      locales: null as StoreLocales | null,
      // `null`, not `undefined`: the key has to survive the payload so a
      // storefront's own client (`examples/starter-nuxt`'s storefront plugin)
      // reads the same policy the module's reads use.
      retry: options.retry ?? null,
    };

    addPlugin(resolver.resolve('./runtime/plugin'));
    addImports([
      { name: 'useEldraPage', from: resolver.resolve('./runtime/composables/useEldraPage') },
      // The route key a theme's catch-all page gives `<NuxtPage>`; see `./runtime/routePath`.
      { name: 'eldraRouteKey', from: resolver.resolve('./runtime/routePath') },
      { name: 'useEldra', from: '@eldrajs/theme-vue' },
      // The active content locale and the path helpers around it. Re-exported from theme-vue
      // rather than defined here: the state lives on the theme context so a **block** can read it
      // through one `inject` with no Nuxt around it (a Storybook story, a unit mount), and this
      // module is what fills it from the route.
      { name: 'useEldraLocale', from: '@eldrajs/theme-vue' },
      { name: 'useEldraEntry', from: '@eldrajs/theme-vue' },
      { name: 'useEldraPreview', from: '@eldrajs/theme-vue' },
    ]);

    /**
     * How this site's paths and locales line up (`./runtime/locales.ts`). Resolved from the
     * platform's answer at the end of this `setup`, and read by the `prerender:routes` hook below
     * — which Nuxt calls once the build starts, long after that `await` has settled. Until then it
     * is the no-locales shape, which is also the final one for an organisation that configures
     * none and the behaviour every site had before prefixes existed.
     */
    let localeRouting: EldraLocaleRouting = resolveLocaleRouting(null, options.locale);

    nuxt.hook('prerender:routes', async (ctx) => {
      if (options.gatewayUrl === '' || options.orgId === '') {
        console.warn('[eldra] ELDRA_GATEWAY_URL / ELDRA_ORG_ID not set — prerendering "/" only');
        ctx.routes.add('/');
        return;
      }

      const client = createEldraClient({
        gatewayUrl: options.gatewayUrl,
        orgId: options.orgId,
        retry: options.retry,
      });
      // The *reading* locale, which is the override and nothing else: path segments are not
      // translated in v1, so one pass over the default locale's documents produces the path list
      // for every locale and `addRoute` below fans each path out. Reading the page list once per
      // locale would only re-read the same slugs — Core's localized `slug` map is deliberately
      // consulted for the default locale alone.
      const locale = normalizeLocale(options.locale);
      const [pages, templates] = await Promise.all([
        listAllEntries(client, options.pageSchema, locale),
        listRouteTemplateEntries(client, options.routeTemplateSchema, locale),
      ]);
      const generated = new Set<string>();
      /**
       * One content path, prerendered once per locale: unprefixed for the locale served at `/`,
       * and once more under every other supported locale's prefix. In the **same** pass that
       * discovered the path, so a locale can never be a build behind the pages it serves.
       */
      const addRoute = (path: string): void => {
        ctx.routes.add(path);
        for (const prefixed of localeRouting.prefixed) {
          ctx.routes.add(localePathFor(path, prefixed, localeRouting));
        }
      };
      for (const page of pages) {
        const path = resolvePagePath(page, pages);
        generated.add(path);
        addRoute(path);
      }
      const codeOwned = new Set((options.customPages ?? []).map((page) => page.path));
      const entriesBySchema = new Map<string, Promise<EntryDoc[]>>();
      const catalogByKind = new Map<CatalogRouteKind, Promise<CatalogDoc[]>>();
      for (const template of templates) {
        const pattern = routeString(template.data.routePattern);
        const schemaApiId = routeString(template.data.schemaApiId);
        const slugField = routeString(template.data.slugField);
        const parsed = parseDynamicRoutePattern(pattern);
        if (parsed === null || parsed.paramName !== slugField || schemaApiId === '') {
          throw new Error(`@eldrajs/theme-nuxt: invalid published route template ${template.id}`);
        }
        const catalogKind = catalogRouteTarget(schemaApiId);
        if (catalogKind !== null) {
          // NOTE: the two branches below disagree on purpose about a path two
          // templates both generate — the catalog branch warns and skips it,
          // the CMS branch throws. Which one a collision hits therefore
          // depends on the order `templates` arrives in: a CMS template
          // reaching a path a catalog template already added fails the build,
          // while the reverse only warns. That asymmetry is deliberate (a
          // merchant's catalog slug must not break a deploy, a theme's own
          // duplicate route must), not an oversight.
          // Catalog records are merchant data the theme does not control, so a
          // single unusable or colliding slug is skipped with a warning naming
          // it — never a failed build for every other product on the site.
          // A category template generates one route per **canonical path**
          // (`/categories/<root>/<child>`), which is the only path its route
          // answers — see `catalogDocRoutes`.
          let catalogPromise = catalogByKind.get(catalogKind);
          if (catalogPromise === undefined) {
            catalogPromise = listCatalogDocs(client, catalogKind, locale);
            catalogByKind.set(catalogKind, catalogPromise);
          }
          for (const path of catalogDocRoutes(catalogKind, await catalogPromise, pattern)) {
            if (codeOwned.has(path)) continue;
            if (generated.has(path)) {
              console.warn(`[eldra] skipped ${path}: another route already generates this path`);
              continue;
            }
            generated.add(path);
            addRoute(path);
          }
          continue;
        }
        let entriesPromise = entriesBySchema.get(schemaApiId);
        if (entriesPromise === undefined) {
          entriesPromise = listAllEntries(client, schemaApiId, locale);
          entriesBySchema.set(schemaApiId, entriesPromise);
        }
        for (const entry of await entriesPromise) {
          const path = buildDynamicRoutePath(pattern, entry.data[slugField]);
          if (path === null) {
            throw new Error(`@eldrajs/theme-nuxt: invalid route slug for template ${template.id}`);
          }
          if (codeOwned.has(path)) continue;
          if (generated.has(path)) {
            throw new Error(
              `@eldrajs/theme-nuxt: duplicate generated route ${JSON.stringify(path)}`
            );
          }
          generated.add(path);
          addRoute(path);
        }
      }
    });

    // Nitro's own `nitro:init` hook is real — Nuxt calls it internally — but
    // this version of @nuxt/schema does not declare it on NuxtHooks, so
    // `nuxt.hook` cannot infer a callback type for it. Type only the shape
    // this module actually uses and cast the registration, rather than take
    // a dependency on nitropack's types for one hook.
    (nuxt.hooks.hook as (name: 'nitro:init', callback: (nitro: NitroInitContext) => void) => void)(
      'nitro:init',
      (nitro) => {
        nitro.hooks.hook('prerender:done', () => {
          const publicDir = nitro.options.output.publicDir;
          mkdirSync(publicDir, { recursive: true });
          copyGeneratedManifest(nuxt.options.rootDir, publicDir);
          const target = join(publicDir, '_headers');
          // Re-generation can retain the prior static output. Replace a previous
          // Eldra frame-ancestors value instead of leaving a second, stale policy.
          const existing = existsSync(target)
            ? readFileSync(target, 'utf8')
                .replace(/^\s*Content-Security-Policy:\s*frame-ancestors[^\r\n]*(?:\r?\n|$)/gim, '')
                .trimEnd() + '\n\n'
            : '';
          const ancestors = ["'self'", ...studioOrigins].join(' ');
          writeFileSync(
            target,
            `${existing}/*\n  Content-Security-Policy: frame-ancestors ${ancestors}\n`
          );
        });
      }
    );

    nuxt.options.app.head.meta = [
      ...(nuxt.options.app.head.meta ?? []),
      { name: 'eldra-theme-version', content: themeVersion(nuxt.options.rootDir) },
      { name: 'eldra-sdk-version', content: packageVersion(resolver.resolve('../package.json')) },
    ];

    // The store's currency and the organisation's locales, once per build — see
    // `./runtime/commerce.ts` for why they are read here and not in the browser, and why a failure
    // is a warning rather than a failed build. Awaited last, after every registration above, so one
    // gateway round trip cannot change what this module installs; the values land on the
    // runtime-config object written earlier, which Nitro does not read until the build itself
    // starts, and on `localeRouting`, which the prerender hook does not read until then either.
    //
    // There is no client when the site has no gateway credentials — the same site the
    // `prerender:routes` hook above warns about and prerenders "/" for.
    //
    // Three reads of one document, deliberately. Each is independently fail-soft — a currency the
    // gateway will not give up must not cost the site its locales, nor the other way round, nor
    // either of them the theme's own texts — and one shared, memoised read would make any one
    // failure all three. It is three requests at build time, once.
    const platformClient =
      options.gatewayUrl === '' || options.orgId === ''
        ? null
        : createEldraCommerceClient({
            apiBaseUrl: options.gatewayUrl,
            orgId: options.orgId,
            retry: options.retry,
          });
    const [commerce, locales, themeMessages] = await Promise.all([
      readStoreCommerce(platformClient),
      readStoreLocales(platformClient),
      readThemeMessages(platformClient),
    ]);
    const runtimeEldra = nuxt.options.runtimeConfig.public.eldra as {
      commerce: StoreCommerce | null;
      locales: StoreLocales | null;
    };
    runtimeEldra.commerce = commerce;
    runtimeEldra.locales = locales;
    localeRouting = resolveLocaleRouting(locales, options.locale);
    // Merge over the manifest's own messages (resolved over `locales` — the organisation's own
    // locales, falling back to the theme's own when they are unknown) only now that both reads
    // have settled; see `themeOptions`'s own declaration for why mutating it here still reaches
    // the plugin's `virtual:eldra/messages` content.
    themeOptions.resolveMessages = (manifestMessages) =>
      resolveSiteMessages(manifestMessages, themeMessages, locales);
  },
});

export default eldraModule;

async function listRouteTemplateEntries(
  client: EldraClient,
  schemaApiId: string,
  locale?: string
): Promise<EntryDoc[]> {
  try {
    return await listAllEntries(client, schemaApiId, locale);
  } catch (error) {
    // Sites created before dynamic pages do not have this system schema until
    // their first I11 manifest ingest. Treat that upgrade-only state as an
    // empty catalog so generation can produce the artifact that repairs it.
    if (error instanceof EldraClientError && error.status === 404) return [];
    throw error;
  }
}

function routeString(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
}

function validateStudioOrigins(origins: string[]): string[] {
  if (origins.length === 0) throw new Error('@eldrajs/theme-nuxt: studioOrigins must not be empty');
  return origins.map((origin) => {
    if (/^https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?$/i.test(origin)) return origin;
    if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) return origin;
    throw new Error(`@eldrajs/theme-nuxt: invalid Studio origin "${origin}"`);
  });
}

function themeVersion(rootDir: string): string {
  return packageVersion(join(rootDir, 'package.json'));
}

function packageVersion(path: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function copyGeneratedManifest(rootDir: string, publicDir: string): void {
  const sourceDir = join(rootDir, '.eldra');
  const sourceManifest = join(sourceDir, 'manifest.json');
  if (!existsSync(sourceManifest)) {
    throw new Error('@eldrajs/theme-nuxt: generated .eldra/manifest.json is missing');
  }
  const targetDir = join(publicDir, '.eldra');
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(sourceManifest, join(targetDir, 'manifest.json'));
  const previews = join(sourceDir, 'previews');
  if (existsSync(previews)) cpSync(previews, join(targetDir, 'previews'), { recursive: true });
}
