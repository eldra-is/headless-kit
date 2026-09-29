import { getAppManifest } from 'nuxt/app';
import { canonicalRoutePath } from './routePath';

/**
 * The routes this build already answered — Nuxt's own app manifest, read once.
 *
 * A generated site ships the list of paths it prerendered
 * (`/_nuxt/builds/meta/<buildId>.json`, `{ prerendered: ["/", "/404", "/products/ash-glaze-mug",
 * …] }`; `experimental.appManifest`, on by default). Nuxt uses it to decide whether a route has a
 * `_payload.json` worth fetching, and it answers two questions the theme was asking the gateway
 * instead:
 *
 *  1. **Is this route in the build?** Then its page, template and entry are in the payload Nuxt
 *     has already fetched by the time the page component exists — resolving it again is a round
 *     trip for an answer in hand, and a loading state over a page that could have rendered at once.
 *  2. **Is it not?** Then it does not exist, and listing every page and every route template
 *     through the gateway only arrives at the same "no" five requests later. A route published
 *     since the build is not in the artifact either way — a publish triggers a rebuild, which is
 *     what makes the build the authority.
 *
 * Both answers hold **only for a static artifact in a browser**, which is why this is deliberately
 * narrow about when it answers at all:
 *
 *  * The server (`nuxi generate`'s own prerender included) always resolves through the gateway —
 *    it is the run that *produces* the list.
 *  * `nuxi dev` ships a manifest whose `prerendered` is empty, and so does an SSR deployment
 *    (`nuxt build` + a Node server), where every route is rendered on demand and none is in the
 *    build. An empty list therefore means "this build prerendered nothing", never "this route does
 *    not exist", and both fall back to dynamic resolution.
 *  * `getAppManifest()` throws outright when the manifest is disabled, and its fetch can fail;
 *    either way the honest answer is "no list", not "no routes".
 *
 * Paths are stored canonicalised (`routePath.ts`) and looked up the same way, which is also the
 * spelling the manifest itself uses — Nuxt strips a trailing slash before its own lookup
 * (`nuxt/dist/app/composables/payload.js`, `_isPrerenderedInManifest`).
 */
let known: ReadonlySet<string> | null = null;
let lookup: Promise<ReadonlySet<string> | null> | null = null;

/**
 * The prerendered route set once it is known, **without waiting** — `null` until the manifest has
 * been read, and `null` forever on a build that has no usable one.
 *
 * This is the accessor a synchronous decision uses (`useEldraPage`'s `getCachedData`, which Nuxt
 * calls with no chance to await). `prime()` from a plugin and Nuxt's own payload plugin both put
 * the answer here long before the first client navigation; anything that still finds it missing
 * falls through to the asynchronous `prerenderedRoutes()`.
 */
export function knownPrerenderedRoutes(): ReadonlySet<string> | null {
  return known;
}

/** The prerendered route set, reading the manifest at most once per page load. */
export function prerenderedRoutes(): Promise<ReadonlySet<string> | null> {
  lookup ??= readManifest();
  return lookup;
}

/** Start the one manifest read now, so the first navigation has its answer synchronously. */
export function primePrerenderedRoutes(): void {
  void prerenderedRoutes();
}

async function readManifest(): Promise<ReadonlySet<string> | null> {
  if (!import.meta.client || import.meta.dev) return null;
  try {
    const manifest = await getAppManifest();
    const routes = manifest.prerendered;
    // Nothing prerendered is not a site without routes — see the module comment.
    if (!Array.isArray(routes) || routes.length === 0) return null;
    known = new Set(routes.map(canonicalRoutePath));
    return known;
  } catch {
    return null;
  }
}
