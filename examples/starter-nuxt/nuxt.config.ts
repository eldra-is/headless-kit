import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

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
    prerender: { crawlLinks: false, failOnError: false, routes: ['/404'] },
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
  // The Studio preview bridge is embedded only by the local Studio instance.
  // Keep this an exact origin: it is also emitted into the Pages CSP header.
  eldra: {
    studioOrigins: [process.env.ELDRA_STUDIO_ORIGIN ?? 'https://localhost:4311'],
    // See app/assets/main.css and scripts/sync-theme-colors.mjs: the Tailwind
    // adapter's own `virtual:eldra/tailwind-theme.css` entry cannot be
    // resolved from an `@import` inside a Vite-processed CSS file (the
    // Tailwind v4 Vite plugin uses its own CSS resolver, not Vite's
    // resolveId chain), and a second CSS entry's `@theme` block is not
    // merged into the Tailwind root defined by the first — both verified
    // with a real `nuxi generate` (see task-1-report.md). Fall back to
    // `@import 'tailwindcss'` directly in main.css with a generated color
    // `@theme static` block instead.
    tailwind: false,
  },
  typescript: {
    tsConfig: {
      // Storybook config/stories run outside the Nuxt build (no auto-imports,
      // a different Vite plugin set — see .storybook/main.ts) and import
      // `virtual:eldra/*` ids `nuxi typecheck` has no ambient types for.
      // Type-checked separately by tsconfig.storybook.json (`pnpm
      // typecheck:storybook`, chained from `pnpm typecheck`).
      exclude: ['../.storybook/**', '../stories/**'],
    },
  },
});
