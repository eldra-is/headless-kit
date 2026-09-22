<script setup lang="ts">
import { computed } from 'vue';
import { EldraBlockZone, EldraLayout } from '@eldrajs/theme-vue';

const { page, template, entry, layout, blocks, reusableComponentProjection, pending, error } =
  useEldraPage();

// `/404` is prerendered (see nitro.prerender.routes) so a styled not-found
// shell exists for static hosts. Without gateway credentials the page-lookup
// call in useEldraPage() throws before it can resolve "no match", landing in
// the *error* branch instead of the not-found one. Treat the `/404` route
// (trailing slashes normalized) as not-found unconditionally so the
// prerendered artifact — and any real visitor routed there by a host's 404
// handling — always sees the not-found shell rather than a raw error
// message. `page === null && template === null` is the ordinary not-found
// case for any other route (no gateway error, just no match).
//
// Branch order below is: pending -> not-found (either reason) -> error ->
// layout/block zone. The not-found and error conditions are complementary
// (`error && !isNotFoundRoute` vs. `isNotFoundRoute || (page === null &&
// template === null)`), so `/404` always wins over a real error, while a
// real content route's error state is left fully reachable and unweakened.
const route = useRoute();
const isNotFoundRoute = computed(() => route.path.replace(/\/+$/, '') === '/404');
const isNotFound = computed(
  () => isNotFoundRoute.value || (page.value === null && template.value === null)
);

useHead(() => ({
  title: isNotFound.value
    ? 'Page not found'
    : (((template.value ?? page.value)?.data.title as string | undefined) ?? 'Site'),
}));
</script>

<template>
  <main v-if="pending" class="container" aria-busy="true"><p>Loading…</p></main>
  <main v-else-if="error && !isNotFoundRoute" class="container">
    <p role="alert">{{ error }}</p>
  </main>
  <main v-else-if="isNotFound" class="not-found container" data-eldra-not-found>
    <p class="muted">404</p>
    <h1>Page not found</h1>
    <p>The page you were looking for does not exist or has been moved.</p>
    <NuxtLink to="/" class="button">Back to home</NuxtLink>
  </main>
  <EldraLayout
    v-else-if="layout !== null"
    :layout="layout"
    :blocks="blocks"
    :reusable-component-projection="reusableComponentProjection"
    :template-entry="entry ?? undefined"
  />
  <EldraBlockZone v-else :blocks="blocks" />
</template>
