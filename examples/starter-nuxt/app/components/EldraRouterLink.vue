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
 *
 * `defineExpose({ focus })`: `@eldrajs/ui`'s `Breadcrumb` moves focus to the first link it reveals
 * after its "…" is activated by calling `.focus()` straight on whatever its own `:ref` callback
 * received (`Breadcrumb.vue`'s own `setFirstRevealedLink`/`expand` — see that component's source
 * comment) — a real DOM `Element.focus` when `linkAs` is left as the default `<a>` tag, but a
 * *component* public instance when `linkAs` is this component (`breadcrumbs` block, every internal
 * trail level): a `<script setup>` instance calling `.focus()` on itself does nothing unless the
 * component exposes one. `nuxtLink`'s own instance ref still carries Vue's always-on `$el` (that
 * one is never gated by `defineExpose` — only user-defined bindings are), so this exposes a thin
 * `focus` that forwards to it, giving this component the same `.focus()` contract a plain `<a>`
 * already has. Harmless to every other caller (`Button`'s/`Link`'s own `as`, `Pagination`, …):
 * `defineExpose` only affects what a parent's template `ref` sees, never props/slots/rendering.
 *
 * **Every destination that routes through here keeps the page's language.** This is the one
 * component every same-site link in the theme passes through, so it is where the active locale's
 * path prefix is added (`useEldraLocale().path`, `@eldrajs/theme-vue`): on `/is-IS/products/x` a
 * `/cart` link becomes `/is-IS/cart`, so a visitor cannot be dropped back into the default
 * language by following an ordinary link. The rewrite is idempotent and only touches paths on this
 * site, so a destination that already carries a prefix (a `link` field resolved by `useEldraLink`,
 * which prefixes too) and anything that is not such a path are both left exactly as they are — and
 * on a single-locale site, in Storybook and in unit tests `path()` is the identity.
 */
import { computed, ref } from 'vue';
import { useEldraLocale } from '@eldrajs/theme-vue';

const props = defineProps<{ to: string }>();

const locale = useEldraLocale();
const destination = computed(() => locale.path(props.to));

const nuxtLink = ref<{ $el?: HTMLElement } | null>(null);

defineExpose({
  focus: () => nuxtLink.value?.$el?.focus(),
});
</script>

<template>
  <NuxtLink ref="nuxtLink" :to="destination"><slot /></NuxtLink>
</template>
