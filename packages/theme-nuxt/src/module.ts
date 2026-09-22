import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addImports, addPlugin, addVitePlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import {
  buildDynamicRoutePath,
  createEldraClient,
  EldraClientError,
  parseDynamicRoutePattern,
  resolvePagePath,
  stripStega,
  type EldraClient,
  type EntryDoc,
} from '@eldrajs/theme-core';
import eldraTheme, {
  type DeclaredThemeCodePage,
  type ManifestRoute,
} from '@eldrajs/vite-plugin-theme';
import type { LayoutBreakpoints } from '@eldrajs/theme-core/layout';

export interface ModuleOptions {
  gatewayUrl: string;
  orgId: string;
  studioOrigins: string[];
  pageSchema: string;
  routeTemplateSchema: string;
  locale?: string;
  routes?: ManifestRoute[];
  customPages?: DeclaredThemeCodePage[];
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
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const studioOrigins = validateStudioOrigins(options.studioOrigins);

    addVitePlugin(
      eldraTheme({
        framework: 'nuxt',
        routes: options.routes,
        customPages: options.customPages,
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
      locale: options.locale ?? null,
    };

    addPlugin(resolver.resolve('./runtime/plugin'));
    addImports([
      { name: 'useEldraPage', from: resolver.resolve('./runtime/composables/useEldraPage') },
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
      const [pages, templates] = await Promise.all([
        listAllEntries(client, options.pageSchema, options.locale),
        listRouteTemplateEntries(client, options.routeTemplateSchema, options.locale),
      ]);
      const generated = new Set<string>();
      for (const page of pages) {
        const path = resolvePagePath(page, pages);
        generated.add(path);
        ctx.routes.add(path);
      }
      const codeOwned = new Set((options.customPages ?? []).map((page) => page.path));
      const entriesBySchema = new Map<string, Promise<EntryDoc[]>>();
      for (const template of templates) {
        const pattern = routeString(template.data.routePattern);
        const schemaApiId = routeString(template.data.schemaApiId);
        const slugField = routeString(template.data.slugField);
        const parsed = parseDynamicRoutePattern(pattern);
        if (parsed === null || parsed.paramName !== slugField || schemaApiId === '') {
          throw new Error(`@eldrajs/theme-nuxt: invalid published route template ${template.id}`);
        }
        let entriesPromise = entriesBySchema.get(schemaApiId);
        if (entriesPromise === undefined) {
          entriesPromise = listAllEntries(client, schemaApiId, options.locale);
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

async function listAllEntries(
  client: EldraClient,
  schemaApiId: string,
  locale?: string
): Promise<EntryDoc[]> {
  const entries: EntryDoc[] = [];
  let page = 1;
  for (;;) {
    const response = await client.getEntries(schemaApiId, {
      page,
      pageSize: 100,
      depth: 0,
      locale,
    });
    entries.push(...response.data);
    if (!response.meta.hasNext) return entries;
    page += 1;
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
