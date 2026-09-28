// @vitest-environment jsdom
//
// The seeded route templates (`app/templates.ts`) put the header and footer in
// as **roles**, which Core resolves to the site's own reusable components — so
// a product page's header is a `reusable` placement inside the *template*
// layout, not a block of the page. This mounts `app/pages/[...slug].vue` with
// the real `EldraLayout` (the sibling `slugPage.spec.ts` stubs `@eldrajs/theme-vue`
// wholesale, which is why this lives in its own file: `vi.mock` is per-file) and
// the shape `useEldraPage()` hands it on such a route — a `template`, the routed
// `entry`, the template's `blocks`, and the template read's own
// `reusableComponentProjection` — and asserts the header's own content renders
// where the placement sits.
import { mount, flushPromises } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import navigationMock from '../blocks/navigation/mock.json';
import { mountOptions } from './support/mountBlock';

const { default: SlugPage } = await import('../app/pages/[...slug].vue');

// `EldraLayout` resolves a block through `virtual:eldra/blocks` (here
// `test/mocks/blocks.ts`) as a lazily imported async component. Vitest still has
// to transform the SFC on that first import, which takes far longer than any
// number of microtask flushes — so warm both blocks' modules up front and the
// async components then resolve on the next tick, deterministically. The page
// specs (`test/pages/*.spec.ts`) sidestep this by importing their blocks
// statically; this spec must go through the real lazy path, because that lazy
// path is what an expanded reusable placement's blocks travel down.
await Promise.all([import('../blocks/navigation/Block.vue'), import('../blocks/hero/Block.vue')]);

const COMPONENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HEADER_ENTRY_ID = '99999999-9999-4999-8999-999999999999';

const headerEntry = {
  id: HEADER_ENTRY_ID,
  schemaApiId: 'navigation',
  data: navigationMock as Record<string, unknown>,
};

/** The stored layout of a seeded product template: the `header` role node, then
 *  the seed's own block bound to the routed object. */
const templateLayout = {
  version: 1,
  root: {
    id: 'template-root',
    type: 'flex',
    layout: { direction: { normal: 'column' } },
    children: [
      { id: 'role-header', type: 'reusable', componentId: COMPONENT_ID },
      {
        id: 'product-hero',
        type: 'template-block',
        apiId: 'hero',
        templates: { heading: 'Product: {{ title }}' },
      },
    ],
  },
};

/** What Core's template read attaches for that role node: the published header
 *  component, whose document is one block — the site's `navigation` entry. */
const projection = {
  bindings: [
    { placementId: 'role-header', componentId: COMPONENT_ID, siteId: SITE_ID, revision: 2 },
  ],
  revisions: [
    {
      componentId: COMPONENT_ID,
      siteId: SITE_ID,
      revision: 2,
      document: {
        version: 1,
        root: {
          id: 'component-root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'component-navigation', type: 'block', entryId: HEADER_ENTRY_ID }],
        },
      },
    },
  ],
};

function stubTemplateRoute(options: { projection?: unknown } = {}): void {
  vi.stubGlobal('useRoute', () => ({ path: '/products/ash-glaze-mug' }));
  vi.stubGlobal('useHead', () => {});
  vi.stubGlobal('useEldraPage', () => ({
    page: ref(null),
    template: ref({ id: 'rt-product', data: { title: 'Product', layout: templateLayout } }),
    entry: ref({ id: 'prod-1', data: { title: 'Ash glaze mug' } }),
    catalog: computed(() => ({ kind: 'product', slug: 'ash-glaze-mug' })),
    layout: computed(() => templateLayout),
    blocks: computed(() => [headerEntry]),
    reusableComponentProjection: computed(() => options.projection),
    pending: ref(false),
    error: ref(null),
  }));
}

/** Async block components (and the icons they fetch) settle over a few turns. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

describe('[...slug].vue — a reusable placement inside a route template', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the header component’s own content where the template places it', async () => {
    stubTemplateRoute({ projection });

    const wrapper = mount(SlugPage, { global: mountOptions({ entry: headerEntry }).global });
    await settle();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(false);
    // The expanded component's block resolves through the template's `blocks`,
    // so it is a real navigation, not the hidden missing-block placeholder.
    expect(wrapper.find('[data-eldra-missing-block]').exists()).toBe(false);
    const placed = wrapper.get(`[data-eldra-layout-node="component-navigation"]`);
    expect(placed.attributes('data-eldra-reusable-placement')).toBe('role-header');
    expect(placed.attributes('data-eldra-block')).toBe(HEADER_ENTRY_ID);
    expect(placed.text()).toContain(navigationMock.brandText);
    // …alongside the seed's own block, still bound to the routed product.
    expect(wrapper.text()).toContain('Product: Ash glaze mug');
    // Component and site ids stay out of the rendered document.
    expect(wrapper.html()).not.toContain(COMPONENT_ID);
    expect(wrapper.html()).not.toContain(SITE_ID);
  });

  it('fails the template closed when the header placement has no projection', async () => {
    stubTemplateRoute();

    const wrapper = mount(SlugPage, { global: mountOptions({ entry: headerEntry }).global });
    await settle();

    expect(wrapper.find('[data-eldra-invalid-layout]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(navigationMock.brandText);
  });
});
