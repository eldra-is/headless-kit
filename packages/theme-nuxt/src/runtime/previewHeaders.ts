/**
 * The stable preview hosts the platform serves a deployment on (`site-deploy-worker`): one per
 * environment, `<org>.<suffix>`. A deployment is one static artifact, served on the preview host
 * and (later) the live domain alike, so what keeps a preview from being indexed has to be a rule
 * about the **host**, not a build flag: a Cloudflare Pages `_headers` rule whose URL pattern names
 * the preview hosts, which sends `X-Robots-Tag: noindex` there and nowhere else.
 */
export const DEFAULT_PREVIEW_HOST_PATTERNS: readonly string[] = [
  'https://:org.previews.eldra.dev/*',
  'https://:org.previews-staging.eldra.dev/*',
  'https://:org.previews-dev.eldra.dev/*',
];

export const PREVIEW_HEADERS_BEGIN = '# BEGIN eldra preview host noindex (generated)';
export const PREVIEW_HEADERS_END = '# END eldra preview host noindex';

/** The `_headers` block that marks every page of the given hosts `noindex`; `''` for no hosts. */
export function previewHostHeadersBlock(patterns: readonly string[]): string {
  const clean = patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern !== '');
  if (clean.length === 0) return '';
  const rules = clean.map((pattern) => `${pattern}\n  X-Robots-Tag: noindex, nofollow`);
  return [PREVIEW_HEADERS_BEGIN, ...rules, PREVIEW_HEADERS_END].join('\n');
}

/** `headers` with any block this module wrote earlier removed, so a regeneration never stacks one. */
export function stripPreviewHostHeaders(headers: string): string {
  const pattern = new RegExp(
    `${escape(PREVIEW_HEADERS_BEGIN)}[\\s\\S]*?${escape(PREVIEW_HEADERS_END)}\\s*`,
    'g'
  );
  return headers.replace(pattern, '');
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
