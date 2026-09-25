import type { UiMessages } from './en-US';

/**
 * Icelandic takes the singular for any count ending in 1 except 11: "1 stafur", "21 stafur", but
 * "11 stafir". English is simpler — only exactly 1 is singular — so the two catalogues do not
 * share this helper.
 */
function singular(n: number): boolean {
  return n % 10 === 1 && n % 100 !== 11;
}

/**
 * The Icelandic message set, shipped as its own entry point
 * (`@eldrajs/ui/messages/is-IS`) so an English-only store never bundles it.
 *
 * ```ts
 * import { isIS } from '@eldrajs/ui/messages/is-IS';
 * app.provide(MESSAGES_KEY, isIS);
 * ```
 *
 * Typed as `UiMessages`, so a key added to `en-US.ts` is a compile error here
 * until it is translated; `parity.spec.ts` also checks arity and that no
 * string is left in English.
 */
export const isIS: UiMessages = {
  clear: 'Hreinsa',
  close: 'Loka',
  loading: 'Hleð',
  optional: 'valfrjálst',
  required: 'Nauðsynlegt',
  search: 'Leita',
  selectPlaceholder: 'Velja',
  multiSelectPlaceholder: 'Allt',
  noResults: 'Engar niðurstöður',
  noMatchesFor: (query: string) => `Engar niðurstöður fyrir „${query}“`,
  noResultsFor: (query: string) => `Engar niðurstöður fyrir „${query}“`,
  moreSelected: (n: number) => `+${n}`,
  removeTag: (label: string) => `Fjarlægja ${label}`,
  selected: 'Valið',
  selectedCount: (n: number) => `${n} valin`,
  noneSelected: 'Ekkert valið',
  done: 'Lokið',
  decrease: 'Minnka',
  increase: 'Auka',
  quantity: 'Magn',
  quantityUpdated: (n: number) => `Magn: ${n}`,
  opensInNewTab: '(opnast í nýjum flipa)',
  counter: (n: number, max: number) => `${n} af ${max}`,
  charactersLeft: (n: number) => `${n} ${singular(n) ? 'stafur' : 'stafir'} eftir`,
  overLimit: (n: number) => `Yfir hámarkinu um ${n}`,
  soldOut: 'Uppselt',
  stockIn: 'Til á lager, sent út á 1–2 dögum',
  stockLow: (n: number | null) =>
    n === null ? 'Lítið til' : `Lítið til: aðeins ${n} ${singular(n) ? 'eintak' : 'eintök'} eftir`,
  stockOut: 'Uppselt',
  stockPreorder: (date?: string) =>
    date === undefined || date === '' ? 'Forpöntun' : `Forpöntun, send út ${date}`,
  searchTheShop: 'Leitaðu í búðinni',
  searchSuggestions: 'Leitartillögur',
  searchProducts: 'Vörur',
  searchCollections: 'Vöruflokkar',
  searchJournal: 'Greinar og hjálp',
  searchAdvice: 'Athugaðu stafsetninguna eða prófaðu eitt af þessu.',
  recentSearches: 'Nýlegar leitir',
  popularSearches: 'Vinsælar leitir',
  clearRecent: 'Hreinsa nýlegar leitir',
  resultsCount: (n: number, query?: string) => {
    const count = `${n} ${singular(n) ? 'niðurstaða' : 'niðurstöður'}`;
    return query === undefined || query === '' ? count : `${count} fyrir „${query}“`;
  },
  viewAllResults: (n: number, query?: string) => {
    const count = singular(n) ? `Sjá ${n} niðurstöðu` : `Sjá allar ${n} niðurstöður`;
    return query === undefined || query === '' ? count : `${count} fyrir „${query}“`;
  },
  shortcutHint: 'Ýttu á / til að leita',
  error: 'Villa',
  formErrors: (n: number) =>
    singular(n) ? `Það er ${n} villa í þessu eyðublaði` : `Það eru ${n} villur í þessu eyðublaði`,
};

export default isIS;
