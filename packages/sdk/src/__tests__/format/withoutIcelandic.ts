const APIS = [
  'Collator',
  'NumberFormat',
  'DateTimeFormat',
  'ListFormat',
  'RelativeTimeFormat',
  'DisplayNames',
] as const;

type Constructor = {
  new (...args: unknown[]): unknown;
  supportedLocalesOf(locales: unknown, options?: unknown): string[];
};

function strip(locales: unknown): string[] | undefined {
  if (locales === undefined) return undefined;
  const list = (Array.isArray(locales) ? locales : [locales]) as string[];
  return list.filter((tag) => !/^is(-|$)/i.test(tag));
}

/** Makes this Node behave like Chrome and Cloudflare Workers: no Icelandic data, silent English fallback. */
export function withoutIcelandic(): () => void {
  const intl = Intl as unknown as Record<string, Constructor>;
  const originals = APIS.map((name) => [name, intl[name]] as const);
  for (const [name, Original] of originals) {
    if (!Original) continue;
    const Stubbed = function (locales: unknown, options: unknown) {
      return new Original(strip(locales), options);
    } as unknown as Constructor;
    Stubbed.prototype = Original.prototype;
    Stubbed.supportedLocalesOf = (locales, options) =>
      Original.supportedLocalesOf(strip(locales) ?? [], options);
    intl[name] = Stubbed;
  }
  return () => {
    for (const [name, Original] of originals) intl[name] = Original;
  };
}
