const BUNDLED = new Set(['is', 'is-IS', 'en', 'en-US']);

/** Whether `locale` is formatted from this package's own data rather than the runtime's. */
export function usesBundledData(locale: string): boolean {
  return BUNDLED.has(Intl.getCanonicalLocales(locale)[0] ?? locale);
}

/** One cached formatter per locale and option set: construction costs far more than a format call. */
export function cached<T>(
  cache: Map<string, T>,
  locale: string,
  options: object,
  create: () => T
): T {
  const key = `${locale}|${JSON.stringify(options)}`;
  let value = cache.get(key);
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}
