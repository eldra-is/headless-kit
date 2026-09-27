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
  announcement: {
    region: 'Announcement',
    dismiss: 'Dismiss announcement',
    hintLabel: 'Add a short message',
    hintHelp: 'For example, a shipping offer or a store update.',
  },
  footer: {
    title: 'Site footer',
    nav: 'Footer',
    emailLabel: 'Email address',
    newsletterAriaLabel: 'Newsletter sign-up',
    subscribe: 'Subscribe',
    subscribing: 'Subscribing…',
    emailInvalid: 'Enter a valid email address.',
    emailError: 'Something went wrong. Try again.',
    subscribed: "You're on the list.",
    localeLabel: 'Country and language',
    localeSearchPlaceholder: 'Search countries',
    currencyLabel: 'Currency',
    social: {
      instagram: 'Instagram',
      facebook: 'Facebook',
      pinterest: 'Pinterest',
      tiktok: 'TikTok',
      youtube: 'YouTube',
    },
    socialLinkName: '{brand} on {network}',
    localeOptions: {
      usEnglish: 'United States · English',
      caEnglish: 'Canada · English',
      caFrench: 'Canada · Français',
    },
    currencyOptions: {
      usd: 'USD $',
      cad: 'CAD $',
      eur: 'EUR €',
    },
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
