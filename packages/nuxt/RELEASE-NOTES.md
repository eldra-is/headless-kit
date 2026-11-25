# Changelog

## [0.2.0](https://github.com/eldra-is/headless-kit/compare/nuxt-v0.1.0...nuxt-v0.2.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **theme-nuxt:** @eldrajs/theme-nuxt needs Nuxt 4.7.0 or later. On an older Nuxt the module is disabled (Nuxt logs "Module `@eldrajs/theme-nuxt` is disabled due to incompatibility issues"); `nuxt >=4.7.0` is a peer dependency.

### Features

* **theme-nuxt:** draft preview sessions and preview parity, needs Nuxt 4.7.0 (WS-1277) ([#168](https://github.com/eldra-is/headless-kit/issues/168)) ([332d35a](https://github.com/eldra-is/headless-kit/commit/332d35a20378b0bd43e50c7e91d9bbb0e2be22d3))

## 0.1.0 (2026-11-22)


### Features

* **nuxt:** @eldrajs/nuxt, a 404 for unbuilt paths before any render or API read (WS-1236) ([#160](https://github.com/eldra-is/headless-kit/issues/160)) ([71c8134](https://github.com/eldra-is/headless-kit/commit/71c8134353d82011c0b6ac67be625584523667b7))
