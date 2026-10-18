# Changelog

## [0.2.0](https://github.com/eldra-is/headless-kit/compare/theme-cli-v0.1.0...theme-cli-v0.2.0) (2026-10-18)


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

* **theme-cli:** explain a raw 413 from a proxy or CDN in front of the gateway ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))
* **theme-cli:** scaffold studioOrigins defaulting to production Studio instead of localhost ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))
* **theme-nuxt:** site icon tags replace the theme's own icon, manifest and theme-color tags ([02474d0](https://github.com/eldra-is/headless-kit/commit/02474d058f374d23ce78f7c20cde99d25e8df2e7))
* **ui:** centre the Lightbox image between equal top and bottom space ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/theme-core bumped to 0.2.0
    * @eldrajs/vite-plugin-theme bumped to 0.2.0

## 0.1.0 (2026-10-10)


### Features

* theme SDK for the page builder — ui library, storefront starter, categories, filters, locales, theme texts ([#37](https://github.com/eldra-is/headless-kit/issues/37)) ([cead3f9](https://github.com/eldra-is/headless-kit/commit/cead3f91eeb5eb9d5bb72bf9a0957c2f4ab1f0b3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/theme-core bumped to 0.1.0
    * @eldrajs/vite-plugin-theme bumped to 0.1.0
