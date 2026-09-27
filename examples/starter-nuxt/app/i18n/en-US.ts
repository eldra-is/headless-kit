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
  breadcrumbs: {
    hintLabel: 'Breadcrumbs fill in automatically.',
    hintHelp: 'They appear once this page sits under a parent page.',
  },
  storefront: {
    loading: 'Loading…',
    error: "We couldn't load this right now.",
    orderStatus: {
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      delayed: 'Delayed',
      cancelled: 'Cancelled',
    },
    orderSteps: {
      ordered: 'Ordered',
      packed: 'Packed',
      shipped: 'Shipped',
      delivered: 'Delivered',
    },
  },
} satisfies Messages;
