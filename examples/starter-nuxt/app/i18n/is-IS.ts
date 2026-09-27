import type { Messages } from './messages';

export const isIS = {
  notFound: {
    eyebrow: '404',
    title: 'Síða fannst ekki',
    body: 'Síðan sem þú leitar að er ekki til eða hefur verið færð.',
    back: 'Til baka á forsíðu',
  },
  loading: 'Hleð…',
  error: 'Eitthvað fór úrskeiðis',
  nav: {
    menu: 'Valmynd',
    close: 'Loka',
    skipToContent: 'Fara í efni',
    primary: 'Aðalvalmynd',
  },
  gallery: {
    viewer: 'Myndaskoðari',
  },
  testimonials: {
    carousel: 'Umsagnir viðskiptavina',
  },
  breadcrumbs: {
    hintLabel: 'Leiðarslóðin fyllist út sjálfkrafa.',
    hintHelp: 'Hún birtist þegar þessi síða er undir annarri síðu.',
  },
  storefront: {
    loading: 'Hleð…',
    error: 'Ekki tókst að sækja þetta núna.',
    orderStatus: {
      processing: 'Í vinnslu',
      shipped: 'Sent',
      delivered: 'Afhent',
      delayed: 'Seinkun',
      cancelled: 'Hætt við',
    },
    orderSteps: {
      ordered: 'Pantað',
      packed: 'Pakkað',
      shipped: 'Sent',
      delivered: 'Afhent',
    },
  },
} satisfies Messages;
