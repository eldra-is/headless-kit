import eldra from '../../../dist/module.mjs';

export default defineNuxtConfig({
  modules: [eldra],
  ssr: true,
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
    studioOrigins: ['https://acme.eldracms.com', 'https://*.local.eldra.app:3000'],
    customPages: [
      {
        path: '/articles/code-owned',
        title: 'Code-owned article',
        description: 'A native Nuxt route that wins over the CMS template.',
      },
    ],
  },
});
