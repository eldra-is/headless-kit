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
    viewer: 'Image viewer',
  },
  testimonials: {
    carousel: 'Customer testimonials',
  },
} satisfies Messages;
