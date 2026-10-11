/**
 * One rule for every locale this module forwards to the gateway: a blank or
 * whitespace-only locale is no locale at all.
 *
 * A site that configures none still carries `""` — `runtimeConfig.public`
 * serialises an absent option as an empty string, and `ELDRA_LOCALE=` does the
 * same — and an empty `?locale=` is not the same request as no `locale` at all:
 * the gateway parses the parameter it was given and answers 400 for a locale it
 * cannot resolve. So normalise once, at every boundary a locale enters
 * (the composable, route resolution, the catalog reads, the module's prerender
 * pass), and let `undefined` mean "the site's default locale".
 */
export function normalizeLocale(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The `locale` slice of a gateway query, normalised: an object with the key, or
 * an empty one. Spread it rather than assigning `locale: undefined`, so a
 * request without a locale carries no `locale` key at all.
 */
export function localeQuery(value: string | null | undefined): { locale?: string } {
  const locale = normalizeLocale(value);
  return locale === undefined ? {} : { locale };
}
