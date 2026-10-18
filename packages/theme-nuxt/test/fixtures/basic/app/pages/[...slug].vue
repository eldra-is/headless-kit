<script setup lang="ts">
import { buildBreadcrumbLd, buildOrganizationLd, buildWebSiteLd } from '@eldrajs/theme-core';
import { EldraBlockZone, EldraLayout } from '@eldrajs/theme-vue';

const { page, template, entry, layout, blocks, reusableComponentProjection, pending, error } =
  useEldraPage();

// The SEO head (`useEldraSeo`): the generate test reads the tags it writes.
const route = useRoute();
const isHome = () => route.path.replace(/\/+$/, '') === '';
const seo = useEldraSeo(
  () => (isHome() ? 'home' : 'page'),
  () => ({ 'page.title': String((template.value ?? page.value)?.data?.title ?? '') })
);

// The structured data (`useStructuredData`): the generate test reads the script it writes.
const profile = useSiteProfile();
useStructuredData(
  () => {
    if (profile.siteUrl === '') return [];
    if (isHome()) {
      return [
        {
          type: 'organization' as const,
          node: buildOrganizationLd({
            name: profile.name,
            url: profile.siteUrl,
            logo: profile.logoUrl,
            sameAs: profile.sameAs,
            contact: profile.contact,
          }),
        },
        {
          type: 'website' as const,
          node: buildWebSiteLd({ name: profile.name, url: profile.siteUrl, searchPath: '/search' }),
        },
      ];
    }
    return [
      {
        type: 'breadcrumb' as const,
        node: buildBreadcrumbLd([
          { name: 'Home', url: `${profile.siteUrl}/` },
          {
            name: String((template.value ?? page.value)?.data?.title ?? ''),
            url: seo.value.canonical ?? '',
          },
        ]),
      },
    ];
  },
  // A page kept out of the index carries no markup either.
  { enabled: () => !seo.value.noindex }
);
</script>

<template>
  <main
    :data-page-id="page?.id"
    :data-layout-root="(layout as { root?: { id?: string } } | null)?.root?.id"
  >
    <p v-if="pending">Loading…</p>
    <p v-else-if="error" data-eldra-error>{{ error }}</p>
    <p v-else-if="page === null && template === null">Not found</p>
    <EldraLayout
      v-else-if="layout !== null"
      :layout="layout"
      :blocks="blocks"
      :reusable-component-projection="reusableComponentProjection"
      :template-entry="entry ?? undefined"
      nonce="fixture-layout-nonce"
    />
    <EldraBlockZone v-else :blocks="blocks" />
  </main>
</template>
