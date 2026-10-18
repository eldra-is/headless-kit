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
    // Form keys whose definitions the build bakes into the runtime config (fail-soft per key).
    forms: ['contact', 'newsletter'],
    // Lets a test switch the structured-data kinds off (`breadcrumb,website`, or `all`).
    structuredData: process.env.ELDRA_TEST_LD_DISABLE
      ? {
          disable:
            process.env.ELDRA_TEST_LD_DISABLE === 'all'
              ? true
              : (process.env.ELDRA_TEST_LD_DISABLE.split(',') as Array<'breadcrumb' | 'website'>),
        }
      : undefined,
    // Lets a test lower the sitemap's per-file URL limit to see the index split.
    sitemap: process.env.ELDRA_TEST_SITEMAP_MAX_URLS
      ? { maxUrls: Number(process.env.ELDRA_TEST_SITEMAP_MAX_URLS) }
      : undefined,
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
