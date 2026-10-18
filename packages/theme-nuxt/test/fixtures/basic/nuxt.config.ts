import eldra from '../../../dist/module.mjs';

export default defineNuxtConfig({
  modules: [eldra],
  ssr: true,
  // The theme's own icon tag: kept with no site icons, replaced when the platform generates some.
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/theme-own-icon.svg' }] } },
  nitro: {
    prerender: {
      crawlLinks: false,
      failOnError: false,
      routes: ['/', '/articles/code-owned'],
      autoSubfolderIndex: true,
    },
  },
  eldra: {
    locale: 'is',
    studioOrigins: ['https://acme.eldracms.com', 'https://*.studio.example.test:3000'],
    customPages: [
      {
        path: '/articles/code-owned',
        title: 'Code-owned article',
        description: 'A native Nuxt route that wins over the CMS template.',
      },
    ],
  },
});
