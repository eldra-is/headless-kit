/**
 * Strips every trailing `/` from a URL (`https://x///` → `https://x`). A
 * regex equivalent (`/\/+$/`) backtracks polynomially on a long run of
 * slashes because the engine re-tries every split of the repeated group
 * before failing to match past the string's end; this walks the string once
 * from the end instead, which is linear regardless of how many slashes it
 * finds. Shared by `deploy` and `validate`, both of which take a gateway/API
 * URL from the caller (CLI flag or env var) and need it with no trailing
 * slash before joining a path onto it.
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return value.slice(0, end);
}
