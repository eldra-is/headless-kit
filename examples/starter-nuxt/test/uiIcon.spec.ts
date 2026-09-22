// @vitest-environment jsdom
//
// UiIcon (app/components/ui/UiIcon.vue, moved + renamed from the old
// app/components/EldraIcon.vue) resolves its SVG through `useEldraIcon`,
// which now takes its fetcher from `inject(ICON_FETCHER_KEY, ...)` instead
// of calling Nuxt's `useFetch` directly (see
// app/composables/useEldraIcon.ts) — this lets a plain `mount()` provide a
// synchronous, network-free stub instead of needing a Nuxt runtime. The stub
// here wraps `tablerIconSvg`'s real output so the assertions still exercise
// the genuine SVG shape (stroke="currentColor", no fixed width/height) that
// the util and the real `/api/eldra-icon` route produce.
import { flushPromises, mount } from '@vue/test-utils';
import { axe } from './support/axe';
import { describe, expect, it } from 'vitest';
import UiIcon from '../app/components/ui/UiIcon.vue';
import { ICON_FETCHER_KEY, type IconFetcher } from '../app/composables/iconFetcher';
import { tablerIconSvg } from '../server/utils/tablerIcon';

const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

const mountOptions = { global: { provide: { [ICON_FETCHER_KEY]: stubFetcher } } };

describe('UiIcon', () => {
  it('renders the inlined Tabler outline SVG with currentColor for a known icon', async () => {
    const wrapper = mount(UiIcon, { props: { name: 'bolt' }, ...mountOptions });
    await flushPromises();
    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
  });

  it('renders nothing for an unknown icon name', async () => {
    const wrapper = mount(UiIcon, { props: { name: 'does-not-exist-xyz' }, ...mountOptions });
    await flushPromises();
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiIcon, { props: { name: 'bolt' }, ...mountOptions });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
