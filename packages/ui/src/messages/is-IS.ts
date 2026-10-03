import type { UiMessages } from './en-US';
import { formatConjunctionList } from '../utils/listFormat';

/**
 * Icelandic takes the singular for any count ending in 1 except 11: "1 stafur", "21 stafur", but
 * "11 stafir". English is simpler — only exactly 1 is singular — so the two catalogues do not
 * share this helper.
 */
function singular(n: number): boolean {
  return n % 10 === 1 && n % 100 !== 11;
}

/** `en-US.ts`'s `reviewsWord`, shared between `rating` and `reviewCount` for the same reason. */
function reviewsWord(n: number): string {
  return singular(n) ? 'umsögn' : 'umsagnir';
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
  closeDrawer: (name: string) => `Loka ${name}`,
  closeSearch: 'Loka leit',
  cancel: 'Hætta við',
  clearSearch: 'Hreinsa leit',
  dismissNotification: 'Loka tilkynningu',
  notifications: 'Tilkynningar',
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
  previous: 'Fyrri skyggna',
  next: 'Næsta skyggna',
  pause: 'Hlé',
  play: 'Spila',
  slideOf: (position: number, total: number) => `${position} af ${total}`,
  goToSlide: (n: number) => `Fara á skyggnu ${n}`,
  slides: 'Skyggnur',
  slideInstructions:
    'Notaðu vinstri og hægri örvatakka til að fara á milli skyggna. Ýttu á Tab til að fara innan núverandi skyggnu.',
  closeLightbox: 'Loka myndaskoðara',
  previousImage: 'Fyrri mynd',
  nextImage: 'Næsta mynd',
  imageOf: (position: number, total: number) => `${position} af ${total}`,
  goToImage: (n: number) => `Fara á mynd ${n}`,
  lightboxImages: 'Myndir',
  charactersLeft: (n: number) => `${n} ${singular(n) ? 'stafur' : 'stafir'} eftir`,
  overLimit: (n: number) => `Yfir hámarkinu um ${n}`,
  soldOut: 'Uppselt',
  newBadge: 'Nýtt',
  quickAddLabel: 'Setja í körfu',
  // Word order differs from the English "Quick add {title}" — the product name sits in the
  // middle of the Icelandic sentence, not appended at the end. See `en-US.ts`'s own comment on
  // `quickAdd` for why the whole sentence is one catalogue entry rather than a label plus a
  // glued-on suffix.
  quickAdd: (title: string) => `Setja ${title} í körfu`,
  loadingProduct: 'Hleð vöru',
  swatchesAvailable: (n: number) => `Til í ${n} ${singular(n) ? 'lit' : 'litum'}`,
  noImage: 'Engin mynd',
  noImageAvailable: 'Engin mynd í boði',
  stockistSite: ' (síða söluaðila)',
  stockIn: 'Til á lager, sent út á 1–2 dögum',
  stockLow: (n: number | null) =>
    n === null ? 'Lítið til' : `Lítið til: aðeins ${n} ${singular(n) ? 'eintak' : 'eintök'} eftir`,
  stockPreorder: (date?: string) =>
    date === undefined || date === '' ? 'Forpöntun' : `Forpöntun, send út ${date}`,
  salePrice: 'Tilboðsverð',
  regularPrice: 'Fullt verð',
  from: 'Frá',
  perUnit: (per: string) => `/ ${per}`,
  updatingPrice: 'Uppfæri verð',
  updatingStock: 'Uppfæri lagerstöðu',
  // Icelandic decimals use a comma, not a period — `Rating` has no `locale` prop to format
  // through `Intl`, so the swap happens here rather than pulling in a formatter for one digit.
  rating: (value: number, count: number) =>
    `Einkunn ${value.toFixed(1).replace('.', ',')} af 5, ${count} ${reviewsWord(count)}`,
  noReviews: 'Engar umsagnir enn',
  reviewCount: (n: number) => `${n} ${reviewsWord(n)}`,
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
  searchLoading: 'Leita…',
  shortcutHint: 'Ýttu á / til að leita',
  searchMoveHint: 'til að fara á milli',
  searchOpenHint: 'til að opna',
  searchEscHint: 'til að hreinsa eða loka',
  error: 'Villa',
  tryAgain: 'Reyna aftur',
  formErrors: (n: number) =>
    singular(n) ? `Það er ${n} villa í þessu eyðublaði` : `Það eru ${n} villur í þessu eyðublaði`,
  // "N til viðbótar" ("N in addition") reads naturally at any count, so — unlike `stockLow` or
  // `charactersLeft` above — this needs no singular/plural branch of its own.
  avatarGroup: (label: string, names: string[], more: number) => {
    const items = more > 0 ? [...names, `${more} til viðbótar`] : names;
    return `${label}: ${formatConjunctionList(items, 'is-IS')}`;
  },
  learnMore: 'Skoða nánar',
  // "Leiðarslóð" (route/way trail) reads naturally as the landmark name for a breadcrumb trail —
  // there is no single settled Icelandic UI term for "breadcrumb" the way there is for, say,
  // "close" or "search".
  breadcrumbLabel: 'Leiðarslóð',
  // "þrep" (a rung/step) does not change form between one and many, so — unlike `formErrors` or
  // `resultsCount` above — this needs no singular/plural branch of its own.
  showMoreLevels: (n: number) => `Sýna ${n} þrep í viðbót`,
  pagination: 'Síðuskipting',
  previousPage: 'Fyrri síða',
  nextPage: 'Næsta síða',
  pageN: (n: number, current = false) => (current ? `Síða ${n}, núverandi síða` : `Síða ${n}`),
  pageOfTotal: (page: number, total: number) => `Síða ${page} af ${total}`,
  showingOf: (shown: number, total: number, noun: string) => `Sýni ${shown} af ${total} ${noun}`,
  loadMore: 'Hlaða meira',
};

export default isIS;
