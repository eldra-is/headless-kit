// @vitest-environment jsdom
//
// The starter's credential-free `nuxi generate` (exercised in
// test/starter.test.ts) resolves no page: with ELDRA_GATEWAY_URL='',
// useEldraPage's getEntries() call throws (new URL('' + path) is invalid),
// so index.html renders the `<p role="alert">Invalid URL</p>` error state,
// never the feature-grid block or its mock data. There is therefore no
// generated HTML to assert the inlined icon markup against. Instead, mount
// EldraIcon.vue directly with @vue/test-utils,
// stubbing useEldraIcon with tablerIconSvg's real output so the assertion
// still exercises the genuine SVG shape (stroke="currentColor", no fixed
// width/height) that the util and route produce.
import { mount } from '@vue/test-utils';
import { computed } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { tablerIconSvg } from '../server/utils/tablerIcon';
import EldraIcon from '../app/components/EldraIcon.vue';

vi.mock('../app/composables/useEldraIcon', () => ({
  useEldraIcon: (name: { value?: string }) => computed(() => tablerIconSvg(name.value ?? '')),
}));

describe('EldraIcon', () => {
  it('renders the inlined Tabler outline SVG with currentColor for a known icon', () => {
    const wrapper = mount(EldraIcon, { props: { name: 'bolt' } });
    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
  });

  it('renders nothing for an unknown icon name', () => {
    const wrapper = mount(EldraIcon, { props: { name: 'does-not-exist-xyz' } });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });
});
