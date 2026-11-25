import {
  addImports,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';
import { livePatterns, notPrerenderedPages } from './livePatterns';

export interface ModuleOptions {
  /** Serve only what the build wrote and answer 404 for the rest. Default `true`. */
  builtPagesOnly: boolean;
  /**
   * More paths the server renders on request, as route patterns (`/preview/**`). Server routes and
   * pages marked `prerender: false` in `routeRules` are found without being listed.
   */
  live: string[];
}

interface NitroLike {
  scannedHandlers: { route?: string; middleware?: boolean }[];
  options: {
    handlers: { route?: string; middleware?: boolean }[];
    routeRules: Record<string, { prerender?: boolean }>;
  };
  hooks: {
    hook(name: 'prerender:route', callback: (route: PrerenderRoute) => void): void;
    hook(name: 'prerender:done', callback: () => void): void;
  };
}

interface PrerenderRoute {
  error?: unknown;
  contentType?: string;
}

interface NuxtRouteOptions {
  routeRules?: RouteRules;
  nitro?: { routeRules?: RouteRules; preset?: string };
}

type RouteRules = Record<string, { prerender?: boolean }>;

const VIRTUAL = '#eldra-built-pages';

const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@eldrajs/nuxt',
    configKey: 'eldraNuxt',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: { builtPagesOnly: true, live: [] },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    addImports([{ name: 'isUnbuiltPage', from: resolver.resolve('./runtime/unbuilt') }]);
    addServerImports([
      { name: 'fetchBuiltFile', from: resolver.resolve('./runtime/server/utils') },
    ]);
    if (!options.builtPagesOnly) return;
    const logger = useLogger('@eldrajs/nuxt');
    const preset = String(
      process.env.NITRO_PRESET || (nuxt.options as NuxtRouteOptions).nitro?.preset || ''
    );
    if (!/^cloudflare/.test(preset)) {
      logger.info(
        `Built pages only is for Cloudflare presets; "${preset || 'none set'}" renders as before.`
      );
      return;
    }
    const state: { nitro?: NitroLike; pages: number } = { pages: 0 };
    // Nitro's hooks are typed by nitropack, which this package does not depend on.
    const hook = nuxt.hook as unknown as (name: string, callback: (arg: never) => void) => void;

    addRouteMiddleware(
      { name: 'eldra-built-pages', path: resolver.resolve('./runtime/middleware'), global: true },
      { prepend: true }
    );
    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware'),
    });

    nuxt.hook('modules:done', () => {
      const nuxtOptions = nuxt.options as unknown as NuxtRouteOptions;
      const pub = nuxt.options.runtimeConfig.public as Record<string, unknown>;
      pub.eldraBuiltPages = {
        live: [
          ...options.live,
          ...notPrerenderedPages(nuxtOptions.routeRules, nuxtOptions.nitro?.routeRules),
        ],
      };
    });

    hook('nitro:config', (config: { virtual?: Record<string, () => string> }) => {
      config.virtual ??= {};
      // Read when the server is bundled: after prerendering for the deployed build, so `enabled`
      // is true only when pages were written ahead of time.
      config.virtual[VIRTUAL] = () =>
        `export default ${JSON.stringify({
          enabled: state.pages > 0,
          live: state.nitro
            ? livePatterns({
                handlers: [...state.nitro.scannedHandlers, ...state.nitro.options.handlers],
                routeRules: [state.nitro.options.routeRules],
                extra: options.live,
              })
            : options.live,
        })}`;
    });

    hook('nitro:init', (nitro: NitroLike) => {
      state.nitro = nitro;
      nitro.hooks.hook('prerender:route', (route) => {
        if (!route.error && route.contentType?.startsWith('text/html')) state.pages++;
      });
      nitro.hooks.hook('prerender:done', () => {
        if (state.pages === 0)
          logger.warn('No page was prerendered: every page is rendered on request.');
        else logger.info(`${state.pages} built pages; any other page path answers 404.`);
      });
    });

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolver.resolve('./runtime/virtual.d.ts') });
    });
  },
});

export default module;
