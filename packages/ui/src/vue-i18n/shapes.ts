import type { UiMessages } from '../messages/en-US';

type MessageFunction = (...args: never[]) => string;

/** The messages that take arguments: every one needs a shape below, or this file does not compile. */
export type FunctionMessageKey = {
  [K in keyof UiMessages]: UiMessages[K] extends MessageFunction ? K : never;
}[keyof UiMessages];

/**
 * How a message function maps onto vue-i18n, which has named values and plural forms but no
 * conditions.
 *
 * - `params` names each argument, in order: `createOption(query)` reads `{query}`.
 * - `count` names the argument whose number picks the plural form (`{n} result | {n} results`).
 * - `numbers` names the other numeric arguments (the rest are text).
 * - `variant` picks a key suffix for a branch that is not a count: `pageN(n, true)` reads
 *   `pageN_current`, `resultsCount(n, 'shoes')` reads `resultsCount_query`. `variants` gives the
 *   arguments that produce each one ('' is the plain key), so a message set can be converted.
 */
export interface MessageShape {
  params: readonly string[];
  count?: string;
  numbers?: readonly string[];
  variant?: (...args: unknown[]) => string | undefined;
  variants?: Readonly<Record<string, (sample: unknown[]) => unknown[]>>;
}

const text = (...params: string[]): MessageShape => ({ params });
const counted = (param = 'n'): MessageShape => ({ params: [param], count: param });
const withQuery: MessageShape = {
  params: ['n', 'query'],
  count: 'n',
  variant: (_n, query) => (query === undefined || query === '' ? undefined : 'query'),
  variants: { '': ([n]) => [n], query: (sample) => sample },
};

export const SHAPES: { readonly [K in FunctionMessageKey]: MessageShape } = {
  closeDrawer: text('name'),
  noResultsFor: text('query'),
  noMatchesFor: text('query'),
  createOption: text('query'),
  moreSelected: counted(),
  removeTag: text('label'),
  selectedCount: counted(),
  quantityUpdated: counted(),
  minimumOf: text('name'),
  maximumOf: text('name'),
  counter: { params: ['n', 'max'], numbers: ['n', 'max'] },
  slideOf: { params: ['position', 'total'], numbers: ['position', 'total'] },
  goToSlide: { params: ['n'], numbers: ['n'] },
  imageOf: { params: ['position', 'total'], numbers: ['position', 'total'] },
  goToImage: { params: ['n'], numbers: ['n'] },
  charactersLeft: counted(),
  overLimit: counted(),
  quickAdd: text('title'),
  swatchesAvailable: counted(),
  stockLow: {
    params: ['n'],
    count: 'n',
    variant: (n) => (n === null ? 'unknown' : undefined),
    variants: { '': (sample) => sample, unknown: () => [null] },
  },
  stockPreorder: {
    params: ['date'],
    variant: (date) => (date === undefined || date === '' ? undefined : 'date'),
    variants: { '': () => [], date: (sample) => sample },
  },
  perUnit: text('per'),
  rating: { params: ['value', 'count'], count: 'count', numbers: ['value'] },
  reviewCount: counted(),
  resultsCount: withQuery,
  viewAllResults: withQuery,
  formErrors: counted(),
  avatarGroup: { params: ['label', 'names', 'more'], numbers: ['more'] },
  showMoreLevels: counted(),
  navMenuOverview: text('label'),
  pageN: {
    params: ['n', 'current'],
    numbers: ['n'],
    variant: (_n, current) => (current ? 'current' : undefined),
    variants: { '': ([n]) => [n, false], current: ([n]) => [n, true] },
  },
  pageOfTotal: { params: ['page', 'total'], numbers: ['page', 'total'] },
  showingOf: { params: ['shown', 'total', 'noun'], numbers: ['shown', 'total'] },
  filterPanelRemoveFilter: text('facet', 'value'),
  filterPanelShowAll: counted(),
  filterPanelSearchLabel: text('facet'),
  filterPanelSearchPlaceholder: text('facet'),
  filterPanelValueName: { params: ['label', 'count'], count: 'count' },
  filterPanelSizeName: { params: ['system', 'label', 'count'], count: 'count' },
  filterPanelImpliedBy: text('parent'),
  filterPanelUnder: text('parent'),
  filterPanelShowResults: counted(),
  formTooShort: counted('min'),
  formTooLong: counted('max'),
};

/** The key a call reads: `pageN`, or `pageN_current` for the branch its arguments select. */
export function variantKey(key: FunctionMessageKey, args: unknown[]): string {
  const variant = SHAPES[key].variant?.(...args);
  return variant ? `${key}_${variant}` : key;
}

// A text argument is passed as a marker and a number as a sentinel no message prints otherwise; both
// become `{name}` after the literal text has been escaped.
const marker = (name: string) => `\u0001${name}\u0002`;
const SINGULAR = 1;
const PLURAL = 7;
const RATING = 8.3;

/** vue-i18n's message syntax characters, written as literals. */
function escape(literal: string): string {
  return literal.replace(/[{}@$|]/g, (char) => `{'${char}'}`);
}

function sentinelFor(name: string, index: number): number {
  return name === 'value' ? RATING : 9101 + index * 101;
}

function template(
  fn: (...args: unknown[]) => string,
  args: unknown[],
  numbers: ReadonlyMap<string, number>
): string {
  let out = fn(...args);
  for (const [name, value] of numbers) {
    const digits = value === RATING ? '8[.,]3' : String(value);
    // Not part of a longer number or a decimal; a comma or period after it is punctuation.
    out = out.replace(new RegExp(`(?<!\\d|\\d[.,])${digits}(?!\\d|[.,]\\d)`, 'g'), marker(name));
  }
  return escape(out).replace(/\u0001(\w+)\u0002/g, '{$1}');
}

/**
 * A complete message set (`enUS`, `isIS` or your own) as vue-i18n messages: plain strings, named
 * values (`{query}`), plural forms (`{n} result | {n} results`) and a suffixed key per branch
 * (`pageN_current`). Merge it under the prefix `useEldraUiI18n` reads:
 *
 * ```ts
 * i18n.global.mergeLocaleMessage('is-IS', { eldraUi: toVueI18nMessages(isIS) });
 * ```
 */
export function toVueI18nMessages(messages: UiMessages): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') {
      out[key] = escape(value);
      continue;
    }
    const fn = value as (...args: unknown[]) => string;
    const shape = SHAPES[key as FunctionMessageKey];
    if (key === 'avatarGroup') {
      out.avatarGroup = template(fn, [marker('label'), [marker('names')], 0], new Map());
      // The "N more" entry alone, as `avatarGroup` lists it after the names.
      const more = 9101;
      const withMore = fn(marker('label'), [], more);
      const item = withMore.slice(withMore.indexOf(String(more)));
      out.avatarGroup_more = template(() => item, [], new Map([['n', more]]));
      continue;
    }
    const sample = (n: number) =>
      shape.params.map((name, index) =>
        name === shape.count
          ? n
          : shape.numbers?.includes(name)
            ? sentinelFor(name, index)
            : marker(name)
      );
    const numbersAt = (n: number) =>
      new Map(
        shape.params.flatMap((name, index): [string, number][] =>
          name === shape.count
            ? [[name, n]]
            : shape.numbers?.includes(name)
              ? [[name, sentinelFor(name, index)]]
              : []
        )
      );
    for (const [variant, toArgs] of Object.entries(shape.variants ?? { '': (s: unknown[]) => s })) {
      const target = variant ? `${key}_${variant}` : key;
      if (!shape.count) {
        out[target] = template(fn, toArgs(sample(PLURAL)), numbersAt(PLURAL));
        continue;
      }
      const forms = [SINGULAR, PLURAL].map((n) => template(fn, toArgs(sample(n)), numbersAt(n)));
      out[target] = forms[0] === forms[1] ? forms[1]! : forms.join(' | ');
    }
  }
  return out;
}
