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
  type EntryDoc,
} from '@eldrajs/theme-core';
import { createEldraClient as createEldraCommerceClient } from '@eldrajs/sdk';
import eldraTheme, {
  type DeclaredSeed,
  type DeclaredThemeCodePage,
  type ManifestRoute,
  type ManifestTemplateRoles,
} from '@eldrajs/vite-plugin-theme';
import type { LayoutBreakpoints } from '@eldrajs/theme-core/layout';
import { catalogDocRoutes, listCatalogDocs, type CatalogRouteKind } from './runtime/catalog';
import { readStoreCommerce, type StoreCommerce } from './runtime/commerce';
import { normalizeLocale } from './runtime/locale';
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

    addVitePlugin(
      eldraTheme({
        framework: 'nuxt',
        routes: options.routes,
        customPages: options.customPages,
        templates: options.templates,
        templateRoles: options.templateRoles,
        themeDir: nuxt.options.rootDir,
        tailwind: options.tailwind,
        breakpoints: options.breakpoints,
      })
    );
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
    };

    addPlugin(resolver.resolve('./runtime/plugin'));
    addImports([
      { name: 'useEldraPage', from: resolver.resolve('./runtime/composables/useEldraPage') },
      // The route key a theme's catch-all page gives `<NuxtPage>`; see `./runtime/routePath`.
      { name: 'eldraRouteKey', from: resolver.resolve('./runtime/routePath') },
      { name: 'useEldra', from: '@eldrajs/theme-vue' },
      { name: 'useEldraEntry', from: '@eldrajs/theme-vue' },
      { name: 'useEldraPreview', from: '@eldrajs/theme-vue' },
    ]);

    nuxt.hook('prerender:routes', async (ctx) => {
      if (options.gatewayUrl === '' || options.orgId === '') {
        console.warn('[eldra] ELDRA_GATEWAY_URL / ELDRA_ORG_ID not set — prerendering "/" only');
        ctx.routes.add('/');
        return;
      }

      const client = createEldraClient({ gatewayUrl: options.gatewayUrl, orgId: options.orgId });
      const locale = normalizeLocale(options.locale);
      const [pages, templates] = await Promise.all([
        listAllEntries(client, options.pageSchema, locale),
        listRouteTemplateEntries(client, options.routeTemplateSchema, locale),
      ]);
      const generated = new Set<string>();
      for (const page of pages) {
        const path = resolvePagePath(page, pages);
        generated.add(path);
        ctx.routes.add(path);
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
          let catalogPromise = catalogByKind.get(catalogKind);
          if (catalogPromise === undefined) {
            catalogPromise = listCatalogDocs(client, catalogKind, locale);
            catalogByKind.set(catalogKind, catalogPromise);
          }
          for (const path of catalogDocRoutes(await catalogPromise, pattern)) {
            if (codeOwned.has(path)) continue;
            if (generated.has(path)) {
              console.warn(`[eldra] skipped ${path}: another route already generates this path`);
              continue;
            }
            generated.add(path);
            ctx.routes.add(path);
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
          ctx.routes.add(path);
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

    // The store's currency, once per build — see `./runtime/commerce.ts` for why it is read here
    // and not in the browser, and why a failure is a warning rather than a failed build. Awaited
    // last, after every registration above, so one gateway round trip cannot change what this
    // module installs; the value lands on the runtime-config object written earlier, which Nitro
    // does not read until the build itself starts.
    //
    // There is no client when the site has no gateway credentials — the same site the
    // `prerender:routes` hook below warns about and prerenders "/" for.
    const commerceClient =
      options.gatewayUrl === '' || options.orgId === ''
        ? null
        : createEldraCommerceClient({ apiBaseUrl: options.gatewayUrl, orgId: options.orgId });
    (nuxt.options.runtimeConfig.public.eldra as { commerce: StoreCommerce | null }).commerce =
      await readStoreCommerce(commerceClient);
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
