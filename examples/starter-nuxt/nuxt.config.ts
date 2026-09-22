import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  modules: ['@eldrajs/theme-nuxt'],
  ssr: true,
  css: ['~/assets/base.css'],
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
  },
});
