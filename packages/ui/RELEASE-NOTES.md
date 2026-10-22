# Changelog

## [0.2.2](https://github.com/eldra-is/headless-kit/compare/ui-v0.2.1...ui-v0.2.2) (2026-10-22)


### Features

* **sdk,ui:** size images from the API's width and height, and keep zoomed crops sharp ([#74](https://github.com/eldra-is/headless-kit/issues/74)) ([a9ceef9](https://github.com/eldra-is/headless-kit/commit/a9ceef93ba8865518ed928cea51210947e2599b5))
* **ui:** NavMenu and components.css ([#73](https://github.com/eldra-is/headless-kit/issues/73)) ([b8429aa](https://github.com/eldra-is/headless-kit/commit/b8429aa5e2cf5e634c552435a57817e8dacbf091))


### Bug Fixes

* **ui:** let weight utilities win over type styles, and merge the kit's shadow and container scales in cx ([#76](https://github.com/eldra-is/headless-kit/issues/76)) ([13d17c6](https://github.com/eldra-is/headless-kit/commit/13d17c6eb632cfdf519a8163914ff43d5214efd2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.3.2

## [0.2.1](https://github.com/eldra-is/headless-kit/compare/ui-v0.2.0...ui-v0.2.1) (2026-10-19)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.3.1

## [0.2.0](https://github.com/eldra-is/headless-kit/compare/ui-v0.1.2...ui-v0.2.0) (2026-10-18)


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

## [0.1.2](https://github.com/eldra-is/headless-kit/compare/ui-v0.1.1...ui-v0.1.2) (2026-10-18)


### Bug Fixes

* **theme-cli:** explain a raw 413 from a proxy or CDN in front of the gateway ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))
* **theme-cli:** scaffold studioOrigins defaulting to production Studio instead of localhost ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))
* **ui:** centre the Lightbox image between equal top and bottom space ([8a08701](https://github.com/eldra-is/headless-kit/commit/8a0870190a63f55f1bdb874508a7526461da0353))

## [0.1.1](https://github.com/eldra-is/headless-kit/compare/ui-v0.1.0...ui-v0.1.1) (2026-10-12)


### Features

* **sdk:** Icelandic formatting that prints the same on every runtime ([#51](https://github.com/eldra-is/headless-kit/issues/51)) ([1a731f0](https://github.com/eldra-is/headless-kit/commit/1a731f0e700205ce7cd6e34b4a8824744df34e96))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @eldrajs/sdk bumped to 0.2.9

## 0.1.0 (2026-10-10)


### Features

* theme SDK for the page builder — ui library, storefront starter, categories, filters, locales, theme texts ([#37](https://github.com/eldra-is/headless-kit/issues/37)) ([cead3f9](https://github.com/eldra-is/headless-kit/commit/cead3f91eeb5eb9d5bb72bf9a0957c2f4ab1f0b3))
