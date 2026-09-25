import type { UiMessages } from './en-US';

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
  optional: 'Valfrjálst',
  required: 'Nauðsynlegt',
  search: 'Leita',
  selectPlaceholder: 'Veldu valkost',
  multiSelectPlaceholder: 'Veldu valkosti',
  noResults: 'Engar niðurstöður',
  moreSelected: (n: number) => `+${n}`,
  removeTag: (label: string) => `Fjarlægja ${label}`,
  decrease: 'Minnka',
  increase: 'Auka',
  quantity: 'Magn',
  opensInNewTab: 'Opnast í nýjum flipa',
  counter: (n: number, max: number) => `${n} af ${max}`,
  // Icelandic takes the singular for any count ending in 1 except 11
  // ("1 stafur", "21 stafur", but "11 stafir").
  charactersLeft: (n: number) =>
    `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'stafur' : 'stafir'} eftir`,
  soldOut: 'Uppselt',
  searchTheShop: 'Leitaðu í búðinni',
  recentSearches: 'Nýlegar leitir',
  popularSearches: 'Vinsælar leitir',
  clearRecent: 'Hreinsa nýlegar leitir',
  resultsCount: (n: number) => `${n} niðurstöður`,
  viewAllResults: (n: number) => `Sjá allar ${n} niðurstöður`,
  shortcutHint: 'Ýttu á / til að leita',
  error: 'Villa',
};

export default isIS;
