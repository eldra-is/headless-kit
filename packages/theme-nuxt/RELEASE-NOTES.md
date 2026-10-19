# Changelog

## [0.3.1](https://github.com/eldra-is/headless-kit/compare/theme-nuxt-v0.3.0...theme-nuxt-v0.3.1) (2026-10-19)


### Features

* **sdk:** send a read-only build token from theme builds, never the deploy token (WS-403, WS-409) ([#68](https://github.com/eldra-is/headless-kit/issues/68)) ([f5b1cfa](https://github.com/eldra-is/headless-kit/commit/f5b1cfab30f867f187346af422e865a46212cfe9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.3.1
    * @eldrajs/theme-core bumped to 0.3.1
    * @eldrajs/theme-vue bumped to 0.2.2
    * @eldrajs/vite-plugin-theme bumped to 0.3.1

## [0.3.0](https://github.com/eldra-is/headless-kit/compare/theme-nuxt-v0.2.0...theme-nuxt-v0.3.0) (2026-10-18)


### ⚠ BREAKING CHANGES

* **theme-nuxt:** a build is production unless ELDRA_BUILD_TARGET=preview (WS-387)

### Features

* **sdk:** forms API; confirm and unsubscribe POST the emailed links (WS-386) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **sdk:** number and url fields and the subscribe consent sentence on form definitions (WS-386) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **theme-core:** SEO resolver and schema.org JSON-LD builders (WS-382, WS-387) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **theme-nuxt:** a build is production unless ELDRA_BUILD_TARGET=preview (WS-387) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **theme-nuxt:** analytics tracker, baked form definitions and useStructuredData (WS-385, WS-386, WS-387) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **theme-nuxt:** useEldraSeo, sitemap.xml and robots.txt, platform redirects and preview noindex (WS-382, WS-383, WS-384) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **ui:** Breadcrumb structuredData prop (WS-387) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **vite-plugin-theme:** formSeeds manifest section (WS-386) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))
* **vite-plugin-theme:** number and url field types and the subscribe consent sentence in formSeeds (WS-386) ([252cc04](https://github.com/eldra-is/headless-kit/commit/252cc0496eaef25039685d25cc14340af255b56c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.3.0
    * @eldrajs/theme-core bumped to 0.3.0
    * @eldrajs/theme-vue bumped to 0.2.1
    * @eldrajs/vite-plugin-theme bumped to 0.3.0

## [0.2.0](https://github.com/eldra-is/headless-kit/compare/theme-nuxt-v0.1.1...theme-nuxt-v0.2.0) (2026-10-18)


### ⚠ BREAKING CHANGES

* **vite-plugin-theme:** require eldra.themeId and emit manifestVersion 2
* **theme-cli:** validate and deploy require a manifest v2 with theme.id; init scaffolds a themeId
* **theme-core:** map theme-owned block schema ids between wire and bare; registerBlockFields requires the theme id

### Features

* **theme-cli:** validate and deploy require a manifest v2 with theme.id; init scaffolds a themeId ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))
* **theme-core:** map theme-owned block schema ids between wire and bare; registerBlockFields requires the theme id ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))
* **theme-nuxt:** site icons and web manifest from the platform setting, rendered by the media worker ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))
* **vite-plugin-theme:** require eldra.themeId and emit manifestVersion 2 ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))


### Bug Fixes

* **theme-nuxt:** site icon tags replace the theme's own icon, manifest and theme-color tags ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/theme-core bumped to 0.2.0
    * @eldrajs/theme-vue bumped to 0.2.0
    * @eldrajs/vite-plugin-theme bumped to 0.2.0

## [0.1.1](https://github.com/eldra-is/headless-kit/compare/theme-nuxt-v0.1.0...theme-nuxt-v0.1.1) (2026-10-12)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.2.9

## 0.1.0 (2026-10-10)


### Features

* theme SDK for the page builder — ui library, storefront starter, categories, filters, locales, theme texts ([#37](https://github.com/eldra-is/headless-kit/issues/37)) ([cead3f9](https://github.com/eldra-is/headless-kit/commit/cead3f91eeb5eb9d5bb72bf9a0957c2f4ab1f0b3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.2.8
    * @eldrajs/theme-core bumped to 0.1.0
    * @eldrajs/theme-vue bumped to 0.1.0
    * @eldrajs/vite-plugin-theme bumped to 0.1.0
