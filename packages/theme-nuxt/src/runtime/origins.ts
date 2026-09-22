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
