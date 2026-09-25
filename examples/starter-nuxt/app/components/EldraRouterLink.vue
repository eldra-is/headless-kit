<script setup lang="ts">
/**
 * **The one place in this theme allowed to reach for Nuxt's `<NuxtLink>`** —
 * as a bare template tag, not an import (there is no `#components` import
 * outside a real Nuxt build, and a block that reached for one would stop
 * rendering in Storybook).
 *
 * Hand it to `@eldrajs/ui`'s `Link` as `as` for an internal destination:
 * `Link` passes the href to a component `as` as `to`, which is `NuxtLink`'s
 * own prop, so the link routes client-side instead of reloading the document.
 * Everything else — `class`, `data-part`, listeners — falls through to the
 * `<a>` `NuxtLink` renders.
 *
 * Nuxt resolves the tag at build time, Storybook (`.storybook/preview.ts`) and
 * unit tests (`test/support/mountBlock.ts`) each register a matching stub, so
 * the same markup renders in every environment. Note `resolveComponent('NuxtLink')`
 * is *not* an alternative here: Nuxt's components loader only rewrites that
 * call inside a `.vue` file, so from a `.ts` composable it resolves to
 * nothing and the literal tag name ends up in the HTML.
 *
 * Pair it with `safeHref` + `isInternalHref` (`app/utils/links.ts`): an
 * external or unsafe destination must never be routed through the router.
 */
defineProps<{ to: string }>();
</script>

<template>
  <NuxtLink :to="to"><slot /></NuxtLink>
</template>
