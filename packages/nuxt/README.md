# @eldrajs/nuxt

Nuxt module for Eldra storefronts that prerender their pages and run on Cloudflare Workers
(`nitro.preset: 'cloudflare_module'` with the `ASSETS` binding).

The site is what the build wrote. A request for a file the build wrote is answered from the asset
store. Anything else is answered before Nuxt renders a page or reads the Eldra API:

| Request                                                   | Answer                                              |
| --------------------------------------------------------- | --------------------------------------------------- |
| A page or file the build wrote                            | The built file (redirects and `304` included)       |
| A server route, or a page marked `prerender: false`       | Rendered on request, as before                      |
| A page path the build did not write (`/products/nope`)    | `404` with the site's `app/error.vue`, no API reads |
| Any other path (`/.env`, `/wp-login.php`, `/.git/config`) | Bare `404`, no render                               |
| A `POST`, `PUT` or other write to a path that is not live | `405`                                               |

So a crawler guessing addresses costs the API nothing, and a page published in Studio exists once
the build that publish starts has finished.

```bash
pnpm add @eldrajs/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@eldrajs/nuxt'],
  nitro: { preset: 'cloudflare_module', prerender: { routes: ['/'] } },
  routeRules: { '/coming-soon': { prerender: false } },
});
```

```jsonc
// wrangler.jsonc: the Worker runs first, so it can answer before the asset store's own 404.
"assets": { "directory": "./.output/public", "binding": "ASSETS", "run_worker_first": ["/*", "!/_nuxt/*"] }
```

## What it needs from the site

- **`app/error.vue` reads nothing from Eldra.** It is the 404 page for every unbuilt page path.
  Give it its own plain header instead of the site's, whose menu comes from Studio.
- **App plugins skip their reads on a 404.** A plugin that reads on the server checks
  `isUnbuiltPage()` (auto-imported) first:

  ```ts
  if (import.meta.server && !isUnbuiltPage()) settings.value = await loadSettings();
  ```

- **Live routes are found, not listed.** Every server route (`server/api`, `server/routes`, a
  module's) and every `routeRules` entry with `prerender: false` is rendered on request. Anything
  else rendered on request goes in `live`.

## Options (`eldraNuxt`)

| Option           | Default | Meaning                                                                       |
| ---------------- | ------- | ----------------------------------------------------------------------------- |
| `builtPagesOnly` | `true`  | `false` renders every unbuilt path on request (the Nuxt default).             |
| `live`           | `[]`    | More route patterns rendered on request without a built file (`/preview/**`). |

It changes nothing in `nuxi dev`, under a Nitro preset that is not a Cloudflare one, or on a build
that prerendered no page (an SSR-only site): the build logs why, and every page is rendered as
before. Pin the preset in `nuxt.config.ts`; an auto-detected one is not seen.

Nuxt renders an error page through an internal `/__nuxt_error` request. A visitor's own request
to that path is answered with a bare 404, since it would otherwise render on request.

## Server helper

`fetchBuiltFile(event, path?)` (auto-imported in server code) returns the built file for a path,
or `null`. Headers set on the event by earlier middleware (a password gate's `cache-control`) are
kept. Site middleware runs before this module's, so a gate stays in front of the built files.
