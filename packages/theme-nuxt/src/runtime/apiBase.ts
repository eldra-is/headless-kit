/**
 * Which API base a client talks to (WS-407).
 *
 * A build has two audiences for the gateway. The **server side** (build-time reads, prerender, an
 * SSR server) talks to the origin gateway, `gatewayUrl`, with the build token. The **browser** of
 * a deployed site should talk to the edge host instead, so its requests carry the edge-signed
 * client IP and get the visitor token; that is `publicApiUrl` (`ELDRA_PUBLIC_API_URL`).
 *
 * `publicApiUrl` is optional and blank by default, and a blank one means the browser uses
 * `gatewayUrl` as it always did, so nothing changes until a site sets it.
 */
export function resolveApiBase(
  cfg: { gatewayUrl: string; publicApiUrl?: string | null },
  isClient: boolean
): string {
  if (!isClient) return cfg.gatewayUrl;
  const pub = typeof cfg.publicApiUrl === 'string' ? cfg.publicApiUrl.trim() : '';
  return pub === '' ? cfg.gatewayUrl : pub;
}
