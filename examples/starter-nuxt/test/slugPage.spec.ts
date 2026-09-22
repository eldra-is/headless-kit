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
// plugin. Neither branch under test reaches these components (both fixtures
// below resolve to the not-found or error branch), so stub the module to
// avoid that unrelated build-time resolution.
vi.mock('@eldrajs/theme-vue', () => ({
  EldraLayout: { template: '<div />' },
  EldraBlockZone: { template: '<div />' },
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
});
