<script setup lang="ts">
import { computed } from 'vue';
import { EldraBlockZone, EldraLayout } from '@eldrajs/theme-vue';
import UiButton from '../components/ui/UiButton.vue';
import UiSection from '../components/ui/UiSection.vue';
import { useT } from '../composables/useT';

const { page, template, entry, layout, blocks, reusableComponentProjection, pending, error } =
  useEldraPage();
const t = useT();

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
    ? t('notFound.title')
    : (((template.value ?? page.value)?.data.title as string | undefined) ?? 'Site'),
}));
</script>

<template>
  <main id="main">
    <UiSection v-if="pending" spacing="lg" container-size="content">
      <p aria-busy="true">{{ t('loading') }}</p>
    </UiSection>
    <UiSection v-else-if="error && !isNotFoundRoute" spacing="lg" container-size="content">
      <p role="alert">{{ error }}</p>
    </UiSection>
    <UiSection
      v-else-if="isNotFound"
      spacing="lg"
      container-size="narrow"
      data-eldra-not-found
      class="text-center"
    >
      <p class="text-muted text-sm font-semibold tracking-widest uppercase">
        {{ t('notFound.eyebrow') }}
      </p>
      <h1 class="font-heading mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {{ t('notFound.title') }}
      </h1>
      <p class="text-muted mt-4 text-lg">{{ t('notFound.body') }}</p>
      <UiButton class="mt-8" href="/">{{ t('notFound.back') }}</UiButton>
    </UiSection>
    <EldraLayout
      v-else-if="layout !== null"
      :layout="layout"
      :blocks="blocks"
      :reusable-component-projection="reusableComponentProjection"
      :template-entry="entry ?? undefined"
    />
    <EldraBlockZone v-else :blocks="blocks" />
  </main>
</template>
