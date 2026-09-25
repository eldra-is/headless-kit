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
  selectPlaceholder: 'Veldu valkost',
  multiSelectPlaceholder: 'Veldu valkosti',
  noResults: 'Engar niðurstöður',
  moreSelected: (n: number) => `+${n}`,
  removeTag: (label: string) => `Fjarlægja ${label}`,
  decrease: 'Minnka',
  increase: 'Auka',
  quantity: 'Magn',
  opensInNewTab: '(opnast í nýjum flipa)',
  counter: (n: number, max: number) => `${n} af ${max}`,
  charactersLeft: (n: number) => `${n} ${singular(n) ? 'stafur' : 'stafir'} eftir`,
  soldOut: 'Uppselt',
  searchTheShop: 'Leitaðu í búðinni',
  recentSearches: 'Nýlegar leitir',
  popularSearches: 'Vinsælar leitir',
  clearRecent: 'Hreinsa nýlegar leitir',
  resultsCount: (n: number) => `${n} ${singular(n) ? 'niðurstaða' : 'niðurstöður'}`,
  viewAllResults: (n: number) =>
    singular(n) ? `Sjá ${n} niðurstöðu` : `Sjá allar ${n} niðurstöður`,
  shortcutHint: 'Ýttu á / til að leita',
  error: 'Villa',
};

export default isIS;
