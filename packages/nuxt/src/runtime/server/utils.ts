import { getRequestURL, getResponseHeaders, type H3Event } from 'h3';
import { fetchBuilt, type AssetsBinding } from './built';

export function assetsOf(event: H3Event): AssetsBinding | undefined {
  return (event.context.cloudflare?.env as { ASSETS?: AssetsBinding } | undefined)?.ASSETS;
}

/** The built file's response, minus any header earlier middleware already set on the event. */
export function withEventHeaders(event: H3Event, response: Response): Response {
  const headers = new Headers(response.headers);
  // h3 sends the event's own headers with the response, so those win by being left out here.
  for (const name of Object.keys(getResponseHeaders(event))) headers.delete(name);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The file the build wrote for `path` (default: the request's own), or `null` when there is none,
 * when the asset store cannot be asked, or off Cloudflare.
 */
export async function fetchBuiltFile(event: H3Event, path?: string): Promise<Response | null> {
  const assets = assetsOf(event);
  if (!assets) return null;
  const url = getRequestURL(event);
  if (path) url.pathname = path;
  const built = await fetchBuilt(assets, url, { method: event.method, headers: event.headers });
  return built ? withEventHeaders(event, built) : null;
}
