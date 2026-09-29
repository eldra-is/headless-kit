/**
 * Converts configured CSP-style origins to the exact parent origin required by
 * the bridge contract. Wildcards are used only to authorize document.referrer;
 * createThemeBridge still receives an exact URL origin and never posts to `*`.
 */
export function resolveBridgeOrigins(configured: string[], referrer: string): string[] {
  let referrerOrigin: string | null = null;
  try {
    referrerOrigin = referrer === '' ? null : new URL(referrer).origin;
  } catch {
    referrerOrigin = null;
  }

  const exact = configured.filter((origin) => !origin.includes('*'));
  if (referrerOrigin === null) return exact;
  if (configured.some((pattern) => originMatches(pattern, referrerOrigin))) {
    return [...new Set([...exact, referrerOrigin])];
  }
  return exact;
}

function originMatches(pattern: string, origin: string): boolean {
  if (!pattern.includes('*')) return pattern === origin;
  const match = /^(https:|http:)\/\/\*\.([^/:]+)(?::(\d+))?$/.exec(pattern);
  if (match === null) return false;
  const candidate = new URL(origin);
  const expectedPort = match[3] ?? '';
  const suffix = match[2]!;
  return (
    candidate.protocol === match[1] &&
    candidate.port === expectedPort &&
    candidate.hostname.endsWith(`.${suffix}`) &&
    candidate.hostname !== suffix
  );
}

/**
 * Whether this document could be a Studio preview frame **at all** — framed, by an origin the
 * site's `studioOrigins` allow.
 *
 * `EldraContext.preview.active` is the answer once the bridge has said hello, and everything that
 * reacts to editing waits for it. This is the question one tick earlier, and it exists because one
 * decision cannot wait: a static build answers an unknown route as "not found" straight out of the
 * build manifest, and it must never do that to Studio, where the route being previewed is a draft
 * the build has never seen. Framed by anything else — another site, a stranger's page — the bridge
 * will never activate, so the ordinary static answer is the right one.
 */
export function isStudioPreviewFrame(configured: string[]): boolean {
  if (!import.meta.client) return false;
  if (window.parent === window) return false;
  return resolveBridgeOrigins(configured, document.referrer).length > 0;
}
