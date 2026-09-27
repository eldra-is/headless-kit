// @vitest-environment jsdom
//
// `app/pages/[...slug].vue` reads `useEldraPage()`, `useRoute()`, and
// `useHead()` as bare Nuxt-auto-imported globals (no imports in the source
// file — see test/useEldraIcon.test.ts for the same pattern). Outside a
// Nuxt build we install them ourselves with `vi.stubGlobal` before mounting,
// the same technique used there. `NuxtLink` is stubbed via `global.stubs` so
// its `to` prop renders as a real `href` we can assert against.
//
// This test exists to lock in the not-found/error branch priority: `/404`
// must always render the not-found shell even when useEldraPage() reports an
// error (the credential-free generate reaches the error branch before this
// fix — see test/starter.test.ts), while a real content route's error state
// must remain visible and not be swallowed by the not-found branch.
import { mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EldraLayout/EldraBlockZone (via @eldrajs/theme-vue) pull in a
// `virtual:eldra/blocks` module supplied only by the Nuxt build's vite
// plugin, so the module is stubbed here. `EldraBlockZone` renders the ids it
// was handed (rather than nothing) so the landmark-partition test below can
// see *which* blocks landed in which of the route's three zones without
// needing a real block component; `getBlockSchemaApiId` is the real thing's
// own behaviour, reimplemented in one line.
vi.mock('@eldrajs/theme-vue', () => ({
  EldraLayout: { template: '<div data-eldra-layout />' },
  EldraBlockZone: {
    props: ['blocks'],
    template:
      '<div class="zone"><span v-for="b in blocks" :key="b.id" :data-block="b.schemaApiId" /></div>',
  },
  getBlockSchemaApiId: (entry: { schemaApiId?: string }) => entry.schemaApiId ?? null,
}));

const { default: SlugPage } = await import('../app/pages/[...slug].vue');

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

describe('[...slug].vue not-found vs. error branch priority', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the not-found shell, not the error alert, for /404 even when useEldraPage reports an error', () => {
    vi.stubGlobal('useRoute', () => ({ path: '/404' }));
    vi.stubGlobal('useHead', () => {});
    vi.stubGlobal('useEldraPage', () => ({
      page: ref(null),
      template: ref(null),
      entry: ref(null),
      layout: computed(() => null),
      blocks: computed(() => []),
      reusableComponentProjection: computed(() => undefined),
      pending: ref(false),
      error: ref('boom'),
    }));

    const wrapper = mount(SlugPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });

    expect(wrapper.find('[data-eldra-not-found]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('a').attributes('href')).toBe('/');
  });

  it('renders the error alert, not the not-found shell, for a real route with an error', () => {
    vi.stubGlobal('useRoute', () => ({ path: '/some-real-page' }));
    vi.stubGlobal('useHead', () => {});
    vi.stubGlobal('useEldraPage', () => ({
      page: ref(null),
      template: ref(null),
      entry: ref(null),
      layout: computed(() => null),
      blocks: computed(() => []),
      reusableComponentProjection: computed(() => undefined),
      pending: ref(false),
      error: ref('boom'),
    }));

    const wrapper = mount(SlugPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toBe('boom');
    expect(wrapper.find('[data-eldra-not-found]').exists()).toBe(false);
  });

  // C2: the leading structure blocks render *before* `<main id="main">` and a trailing `footer`
  // *after* it, so `navigation`'s `<header>` and `footer`'s `<footer>` are siblings of `<main>` and
  // therefore really carry the `banner`/`contentinfo` landmark roles. Inside `<main>` (which is
  // what this template used to do) they carry none, and `app/app.vue`'s `#main` skip link lands
  // above the navigation it exists to skip. The rule itself is `app/utils/pageStructure.ts`.
  it('renders the header blocks before <main> and a trailing footer after it', () => {
    vi.stubGlobal('useRoute', () => ({ path: '/' }));
    vi.stubGlobal('useHead', () => {});
    const blocks = [
      { id: 'b1', schemaApiId: 'announcement-bar' },
      { id: 'b2', schemaApiId: 'navigation' },
      { id: 'b3', schemaApiId: 'hero' },
      { id: 'b4', schemaApiId: 'breadcrumbs' },
      { id: 'b5', schemaApiId: 'footer' },
    ];
    vi.stubGlobal('useEldraPage', () => ({
      page: ref({ data: { title: 'Home' } }),
      template: ref(null),
      entry: ref(null),
      layout: computed(() => null),
      blocks: computed(() => blocks),
      reusableComponentProjection: computed(() => undefined),
      pending: ref(false),
      error: ref(null),
    }));

    const wrapper = mount(SlugPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });

    // `wrapper.element.querySelectorAll` rather than `wrapper.findAll`: the template has three root
    // nodes now, and `findAll` walks the component's vnode tree (roots first, then into each), so
    // it does not report them in document order — which is the whole point of this assertion.
    const zones = [...wrapper.element.querySelectorAll('.zone')];
    expect(zones).toHaveLength(3);
    const apiIdsOf = (index: number) =>
      [...zones[index]!.querySelectorAll('[data-block]')].map((el) =>
        el.getAttribute('data-block')
      );

    expect(apiIdsOf(0)).toEqual(['announcement-bar', 'navigation']);
    expect(apiIdsOf(1)).toEqual(['hero', 'breadcrumbs']);
    expect(apiIdsOf(2)).toEqual(['footer']);

    const main = wrapper.get('main#main').element;
    expect(main.contains(zones[0]!)).toBe(false);
    expect(main.contains(zones[1]!)).toBe(true);
    expect(main.contains(zones[2]!)).toBe(false);

    // Every block appears exactly once on the page — the partition never duplicates one.
    expect(wrapper.element.querySelectorAll('[data-block]')).toHaveLength(blocks.length);
  });

  // A layout-driven page is the documented exception: `EldraLayout` arranges the same flat block
  // list through an authored layout tree whose nodes reference block ids, so nothing can be split
  // out of it without breaking the layout. The header/footer blocks then stay inside `<main>` and
  // the page has no `banner`/`contentinfo` — see `docs/starter-kit.md`, "Page structure and
  // landmarks". This asserts the *no double render* half of that: the header/footer zones must not
  // also render the blocks `EldraLayout` is already rendering.
  it('renders a layout-driven page through EldraLayout alone, with no extra zones', () => {
    vi.stubGlobal('useRoute', () => ({ path: '/' }));
    vi.stubGlobal('useHead', () => {});
    vi.stubGlobal('useEldraPage', () => ({
      page: ref({ data: { title: 'Home' } }),
      template: ref(null),
      entry: ref(null),
      layout: computed(() => ({ nodes: [] })),
      blocks: computed(() => [
        { id: 'b1', schemaApiId: 'navigation' },
        { id: 'b2', schemaApiId: 'footer' },
      ]),
      reusableComponentProjection: computed(() => undefined),
      pending: ref(false),
      error: ref(null),
    }));

    const wrapper = mount(SlugPage, { global: { stubs: { NuxtLink: NuxtLinkStub } } });

    expect(wrapper.element.querySelectorAll('.zone')).toHaveLength(0);
    expect(wrapper.find('[data-eldra-layout]').exists()).toBe(true);
    expect(wrapper.get('main#main').element.querySelector('[data-eldra-layout]')).not.toBeNull();
  });
});
