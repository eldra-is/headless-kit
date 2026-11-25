import { isPagePath } from '../paths';

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export type BuiltDecision =
  | { kind: 'built'; response: Response }
  | { kind: 'live' }
  | { kind: 'unbuilt-page' }
  | { kind: 'not-found' }
  | { kind: 'method-not-allowed' };

export interface BuiltRequest {
  method: string;
  url: URL;
  headers: Headers;
  assets: AssetsBinding;
  isLive: (path: string) => boolean;
}

const READS = new Set(['GET', 'HEAD']);

/** The built file's response, `null` when the build has none, `undefined` when the store failed. */
export async function fetchBuilt(
  assets: AssetsBinding,
  url: URL,
  init: { method: string; headers: Headers }
): Promise<Response | null | undefined> {
  const response = await assets
    .fetch(new Request(url, { method: init.method, headers: init.headers }))
    .catch(() => undefined);
  if (!response) return undefined;
  return response.status === 404 ? null : response;
}

/** The built file if there is one; else the site's own routes; else 404 or 405, before any render. */
export async function decideBuilt(request: BuiltRequest): Promise<BuiltDecision> {
  const { method, url, headers, assets, isLive } = request;
  if (READS.has(method)) {
    const built = await fetchBuilt(assets, url, { method, headers });
    // The asset store could not be asked: let the site answer rather than turn a real page away.
    if (built === undefined) return { kind: 'live' };
    if (built) return { kind: 'built', response: built };
  }
  if (isLive(url.pathname)) return { kind: 'live' };
  if (!READS.has(method)) return { kind: 'method-not-allowed' };
  return isPagePath(url.pathname) ? { kind: 'unbuilt-page' } : { kind: 'not-found' };
}
