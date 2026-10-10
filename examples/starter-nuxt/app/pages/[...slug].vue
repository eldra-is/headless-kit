<script setup lang="ts">
import { computed } from 'vue';
import { EldraBlockZone, EldraLayout, getBlockSchemaApiId } from '@eldrajs/theme-vue';
import { Button, Container, Section } from '@eldrajs/ui';
import EldraRouterLink from '../components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import { partitionPageBlocks } from '../utils/pageStructure';
import { pageTitle } from '../utils/pageTitle';

const {
  page,
  template,
  entry,
  catalog,
  layout,
  blocks,
  reusableComponentProjection,
  pending,
  error,
} = useEldraPage();
const { t } = useI18n();

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
  title: pageTitle({
    isNotFound: isNotFound.value,
    notFoundTitle: t('notFound.title'),
    // A catalog-backed route (a product, a collection) renders through a shared route template
    // whose own title names the template — "Product" on every product page. The object's own
    // title is on the resolved catalog `entry`, which is what the tab, the bookmark and the
    // search result should say.
    catalogTitle: catalog.value === null ? null : entry.value?.data.title,
    documentTitle: (template.value ?? page.value)?.data.title,
  }),
}));

/**
 * The page's flat block list, cut into the three landmark regions — see
 * `app/utils/pageStructure.ts` for the rule and for why rendering everything inside `<main>`
 * (which is what this template used to do) costs every page its `banner`/`contentinfo` landmarks
 * and makes `app/app.vue`'s "Skip to content" link land *above* the navigation it skips.
 *
 * Three sibling `EldraBlockZone`s, not one: the zone is a stateless renderer (it maps entries to
 * their block component inside a `data-eldra-block` wrapper and holds no per-zone state or
 * registration — see `@eldrajs/theme-vue`'s README and `EldraBlockZone.ts`), and Studio's
 * preview/overlay addresses blocks by those `data-eldra-block` attributes document-wide rather
 * than through a zone container. So editing, selection and live block updates behave exactly as
 * they did with a single zone, whichever region a block ends up in.
 *
 * `EldraLayout` is the exception and stays wholly inside `<main>`: there the arrangement is an
 * authored layout tree whose nodes reference block ids, so the flat list cannot be partitioned
 * without breaking the layout. A layout-driven page therefore has its header/footer blocks inside
 * `<main>` and no `banner`/`contentinfo` — documented in `docs/starter-kit.md` under "Page
 * structure and landmarks"; closing it needs a layout-level region concept in the SDK, not a
 * change here.
 */
const structure = computed(() =>
  layout.value === null
    ? partitionPageBlocks(blocks.value, getBlockSchemaApiId)
    : // `EldraLayout` already renders every block in `blocks`; splitting any of them out here too
      // would render the header and footer twice.
      { header: [], main: blocks.value, footer: [] }
);
</script>

<template>
  <EldraBlockZone v-if="structure.header.length > 0" :blocks="structure.header" />
  <main id="main">
    <Section v-if="pending" spacing="lg">
      <Container width="content">
        <p aria-busy="true">{{ t('loading') }}</p>
      </Container>
    </Section>
    <Section v-else-if="error && !isNotFoundRoute" spacing="lg">
      <Container width="content">
        <p role="alert">{{ error }}</p>
      </Container>
    </Section>
    <Section
      v-else-if="isNotFound"
      spacing="lg"
      labelled-by="not-found-title"
      data-eldra-not-found
      :classes="{ root: 'text-center' }"
    >
      <Container width="narrow">
        <p class="text-muted text-sm font-semibold tracking-widest uppercase">
          {{ t('notFound.eyebrow') }}
        </p>
        <h1
          id="not-found-title"
          class="font-heading mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          {{ t('notFound.title') }}
        </h1>
        <p class="text-muted mt-4 text-lg">{{ t('notFound.body') }}</p>
        <!-- `/` is always same-site, so it always routes: `Button`'s `as` hands the href to
             `EldraRouterLink` as `to`, exactly as a `Link` does. -->
        <Button variant="primary" class="mt-8" href="/" :as="EldraRouterLink">{{
          t('notFound.back')
        }}</Button>
      </Container>
    </Section>
    <EldraLayout
      v-else-if="layout !== null"
      :layout="layout"
      :blocks="blocks"
      :reusable-component-projection="reusableComponentProjection"
      :template-entry="entry ?? undefined"
    />
    <EldraBlockZone v-else :blocks="structure.main" />
  </main>
  <EldraBlockZone v-if="structure.footer.length > 0" :blocks="structure.footer" />
</template>
