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
    previous: 'Fyrri',
    next: 'Næsta',
    imageOf: 'Mynd {index} af {total}',
    open: 'Opna mynd',
  },
  dialog: {
    close: 'Loka glugga',
  },
  rating: {
    outOf: '{value} af {max}',
  },
  price: {
    was: 'Áður',
    now: 'Nú',
  },
  carousel: {
    previous: 'Fyrri',
    next: 'Næsta',
    slideOf: 'Skyggna {index} af {total}',
  },
} satisfies Messages;
