// @vitest-environment jsdom
//
// `EldraIcon` (app/components/EldraIcon.vue) is the theme's name→component
// bridge to `@eldrajs/ui`'s `Icon`: it resolves a Tabler icon *name* to markup
// through `useEldraIcon`, which reads `app/icons.ts` — the icons the theme
// bundles at build time — so a plain `mount()` needs no server and no stub, and
// the assertions below run against the genuine SVG a real page renders.
import { flushPromises, mount } from '@vue/test-utils';
import { axe } from './support/axe';
import { describe, expect, it } from 'vitest';
import EldraIcon from '../app/components/EldraIcon.vue';

describe('EldraIcon', () => {
  it('renders the Tabler outline paths with currentColor for a known icon', async () => {
    const wrapper = mount(EldraIcon, { props: { name: 'lock' } });
    await flushPromises();
    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.element.querySelector('path')).not.toBeNull();
  });

  // The primitive owns size, stroke weight and the decorative ARIA state —
  // that is the whole reason the name goes through `Icon` instead of being
  // inlined here (see the component's own doc comment).
  it("lets @eldrajs/ui's Icon own the size, stroke and ARIA state", async () => {
    const wrapper = mount(EldraIcon, { props: { name: 'lock' } });
    await flushPromises();
    const svg = wrapper.find('svg');
    expect(svg.classes()).toContain('size-8');
    expect(svg.attributes('stroke-width')).toBe('1.75');
    expect(svg.attributes('aria-hidden')).toBe('true');
  });

  it('names the icon when it carries meaning of its own', async () => {
    const wrapper = mount(EldraIcon, {
      props: { name: 'lock', label: 'Fast delivery' },
    });
    await flushPromises();
    const svg = wrapper.find('svg');
    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('Fast delivery');
    expect(svg.attributes('aria-hidden')).toBeUndefined();
  });

  it('renders nothing for an unknown icon name', async () => {
    const wrapper = mount(EldraIcon, { props: { name: 'does-not-exist-xyz' } });
    await flushPromises();
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(EldraIcon, { props: { name: 'lock' } });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
