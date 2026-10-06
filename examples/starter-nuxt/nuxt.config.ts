import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { starterSeeds, starterTemplateRoles } from './app/templates';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  modules: ['@eldrajs/theme-nuxt'],
  ssr: true,
  css: ['~/assets/main.css'],
  vite: {
    // Registers Tailwind v4's own Vite transform; @eldrajs/theme-nuxt only
    // emits `virtual:eldra/tailwind-theme.css` (its `@import "tailwindcss"`
    // entry) when `eldra.tailwind` is true below — it does not add the
    // Tailwind Vite plugin itself, so every consumer must.
    plugins: [tailwindcss()],
  },
  nitro: {
    // `200.html` itself is Nitro's own built-in SPA-fallback output for the
    // static preset; it needs no config key here (nitro's PrerenderOptions
    // type has no `fallback` property — a prior `fallback: '200.html'` here
    // was inert and only surfaced once `nuxi typecheck` started running).
    //
    // `/404` is the only path named by hand. `/cart`, `/search` and `/wishlist`
    // used to be listed here too, because they were code routes under
    // `app/pages/` and nothing gateway-driven knew about them; they are CMS
    // pages now (`pages/*.page.json` seeds them — see `app/templates.ts`), so
    // `@eldrajs/theme-nuxt`'s `prerender:routes` hook lists every published
    // page's own path and writes `cart/index.html`, `search/index.html` and
    // `wishlist/index.html` from the documents themselves. Naming them here as
    // well would prerender a path the gateway may have no page for and bake the
    // not-found shell into the artifact under a name a visitor can reach.
    //
    // One file still serves every `?q=` and every visitor's wishlist: the query
    // is client-side state the search block reads after hydration, and a saved
    // list lives in the shopper's own browser (`blocks/search/Block.vue`,
    // `blocks/wishlist/Block.vue`).
    //
    // **`failOnError`, for the same reason the list above names nothing.** A route the gateway
    // could not be asked about is answered 500 by the theme rather than 200
    // (`@eldrajs/theme-nuxt`'s `useEldraPage`), so Nitro writes no file for it and names it in the
    // prerender log — which is already enough to stop a not-found shell being baked over a
    // collection that exists. Failing the build as well is what stops the *other* half: an
    // artifact that is simply missing a product or a collection page, deployed because the
    // generate still exited 0. A transient gateway failure is then a build to re-run, not a dead
    // link a shopper finds. A build with no gateway credentials at all is exempt from the 500 *and*
    // from the error — such a route resolves to the empty route and renders the static shell, which
    // is the whole point of a scaffold build (`@eldrajs/theme-nuxt`'s `hasCredentials`).
    //
    // What this is exposed to is about **twice** the route count: with `crawlLinks: false` Nitro
    // still queues each rendered page's own `_payload.json` from the `x-nitro-prerender` header,
    // and rendering that resolves the route against the gateway a second time. Lower
    // `prerender.concurrency` before reaching for `failOnError: false` if a gateway turns out to be
    // load-sensitive rather than broken.
    prerender: {
      crawlLinks: false,
      failOnError: true,
      routes: ['/404'],
    },
    hooks: {
      // Nitro always emits `404.html` itself as a blank SPA-fallback shell
      // for static hosts (identical to `200.html`, no server-fetched data —
      // it never routes through the app). Adding `/404` to prerender.routes
      // (above) makes Nitro *also* render that path through the real Vue
      // Router, which matches our catch-all page and writes its output to
      // `404/index.html` (Nitro's convention for extension-less routes).
      // Static hosts request the literal `404.html`, so once prerendering
      // finishes, copy the real not-found page over the blank shell.
      'prerender:done': () => {
        const publicDir = join(rootDir, '.output', 'public');
        const notFoundPage = join(publicDir, '404', 'index.html');
        const fallbackShell = join(publicDir, '404.html');
        if (existsSync(notFoundPage)) copyFileSync(notFoundPage, fallbackShell);
      },
    },
  },
  // The Studio preview bridge is embedded only by the Studio instance(s) named here.
  // Keep these exact origins: they are also emitted into the Pages CSP header. More than one
  // (comma-separated in `ELDRA_STUDIO_ORIGIN`) lets one build serve a Studio whose origin is
  // changing — the old and the new origin both allowed until the old one is retired.
  eldra: {
    studioOrigins: (process.env.ELDRA_STUDIO_ORIGIN ?? 'https://localhost:4311')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    // See app/assets/main.css: the Tailwind adapter's own
    // `virtual:eldra/tailwind-theme.css` entry cannot be resolved from an
    // `@import` inside a Vite-processed CSS file (the Tailwind v4 Vite plugin
    // uses its own CSS resolver, not Vite's resolveId chain), and a second CSS
    // entry's `@theme` block is not merged into the Tailwind root defined by
    // the first — both verified with a real `nuxi generate` run.
    // main.css is `@import 'tailwindcss'` followed by
    // `@import '@eldrajs/ui/tailwind.css'` instead, which that same resolver
    // finds in node_modules like any other package file, and which carries the
    // whole `--color-<role>: var(--eldra-color-<role>)` mapping — so no colour
    // block is generated into the theme any more.
    tailwind: false,
    // What Core seeds a site with on its first deploy, built from
    // `pages/*.page.json` — see `app/templates.ts`, and `docs/starter-kit.md`
    // ("Seeded templates and pages"). Two kinds in one list: the product,
    // collection and home route templates, and the `/cart`, `/wishlist` and
    // `/search` **pages**, each with the one block it exists for marked
    // `required` so an author cannot delete it.
    //
    // Every seed's blocks are the fixture's blocks minus `navigation`/`footer`:
    // those two are the `header`/`footer` roles below, which Core resolves to
    // the site's own reusable components so every seeded page shares one
    // header and one footer.
    templates: starterSeeds(),
    templateRoles: starterTemplateRoles(),
  },
  typescript: {
    tsConfig: {
      // Nuxt's generated tsconfig has no generic "every .d.ts under rootDir"
      // include (its `../*.d.ts` only reaches files directly at the theme
      // root, not `.eldra/block-types.d.ts` nested one level down) — add it
      // explicitly so the block-types generator's global ambient
      // `EldraBlockData`/`EldraBlockEntry`/`EldraMedia` (see
      // packages/vite-plugin-theme/src/blockTypes.ts) reach `nuxi typecheck`.
      include: ['../.eldra/**/*.d.ts'],
      // Storybook config/stories run outside the Nuxt build (no auto-imports,
      // a different Vite plugin set — see .storybook/main.ts) and import
      // `virtual:eldra/*` ids `nuxi typecheck` has no ambient types for.
      // Type-checked separately by tsconfig.storybook.json (`pnpm
      // typecheck:storybook`, chained from `pnpm typecheck`).
      exclude: ['../.storybook/**', '../stories/**'],
    },
  },
});
