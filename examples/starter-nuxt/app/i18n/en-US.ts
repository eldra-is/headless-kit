import type { Messages } from './messages';

export const enUS = {
  notFound: {
    eyebrow: '404',
    title: 'Page not found',
    body: "The page you're looking for doesn't exist or has moved.",
    back: 'Back to home',
  },
  loading: 'Loading…',
  error: 'Something went wrong',
  nav: {
    menu: 'Menu',
    close: 'Close',
    skipToContent: 'Skip to content',
    primary: 'Primary navigation',
  },
  gallery: {
    previous: 'Previous',
    next: 'Next',
    imageOf: 'Image {index} of {total}',
    open: 'Open image',
  },
  dialog: {
    close: 'Close dialog',
  },
  carousel: {
    previous: 'Previous',
    next: 'Next',
    slideOf: 'Slide {index} of {total}',
  },
} satisfies Messages;
