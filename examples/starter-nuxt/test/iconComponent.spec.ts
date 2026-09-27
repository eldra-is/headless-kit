// @vitest-environment jsdom
//
// `app/composables/iconComponent.ts` is the theme's one name→icon-component adapter. Several
// `@eldrajs/ui` props (`FeatureCard.icon`, `Badge.icon`, `EmptyState.icon`,
// `EditorPlaceholder.icon`, `Select.leadingIcon`, `Button.iconLeft`) take an already-bound icon
// *component*, while a CMS field gives a block an icon *name* — and that bridge had been
// copy-pasted into eight blocks, nine copies of one fragile regex over Tabler's own markup with no
// shared home. These are the assertions for the single implementation they all use now.
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ICON,
  iconComponent,
  renderTablerSvg,
  tablerSvgBody,
} from '../app/composables/iconComponent';
import { ICON_FETCHER_KEY, type IconFetcher } from '../app/composables/iconFetcher';
import { tablerIconSvg } from '../server/utils/tablerIcon';

const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);
const provide = { global: { provide: { [ICON_FETCHER_KEY]: stubFetcher } } };

/** Renders whatever a package prop would render an icon component as: bare, with no props. */
function host(icon: ReturnType<typeof iconComponent>) {
  return defineComponent({ setup: () => () => h(icon) });
}

describe('tablerSvgBody', () => {
  it("keeps only the body, so the caller owns the root's size, stroke and ARIA state", () => {
    const markup = tablerIconSvg('bolt')!;
    // Tabler ships a complete document with its own class/width/height/stroke-width.
    expect(markup).toContain('<svg');
    expect(markup).toMatch(/stroke-width/);

    const body = tablerSvgBody(markup);
    expect(body).not.toContain('<svg');
    expect(body).not.toContain('</svg>');
    expect(body).toContain('<path');
  });
});

describe('renderTablerSvg', () => {
  it('rebuilds a currentColor outline root around the body', () => {
    const wrapper = mount(
      defineComponent({ setup: () => () => renderTablerSvg('<path d="M0 0" />') })
    );
    const svg = wrapper.get('svg');
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.attributes('fill')).toBe('none');
    // No size and no stroke width: those belong to `Icon` (or the caller's own class).
    expect(svg.attributes('stroke-width')).toBeUndefined();
    expect(svg.element.querySelector('path')).not.toBeNull();
  });

  it('renders an empty root for no body, keeping the layout box', () => {
    const wrapper = mount(defineComponent({ setup: () => () => renderTablerSvg(null) }));
    const svg = wrapper.get('svg');
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.element.children).toHaveLength(0);
  });
});

describe('iconComponent', () => {
  it('draws the named Tabler icon', async () => {
    const wrapper = mount(host(iconComponent('bolt')), provide);
    await flushPromises();
    const svg = wrapper.get('svg');
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.element.querySelector('path')).not.toBeNull();
  });

  it('caches per name, so a re-render never remounts (and re-fetches) the same icon', () => {
    expect(iconComponent('bolt')).toBe(iconComponent('bolt'));
    expect(iconComponent('bolt')).not.toBe(iconComponent('star'));
  });

  it('renders an empty icon for an unknown name rather than nothing at all', async () => {
    // A package prop that requires an icon component gets one either way — the caller's layout is
    // holding a slot open for it. (`EldraIcon`, which is a template, renders nothing instead.)
    const wrapper = mount(host(iconComponent('does-not-exist-xyz')), provide);
    await flushPromises();
    const svg = wrapper.get('svg');
    expect(svg.element.children).toHaveLength(0);
  });
});

describe('EMPTY_ICON', () => {
  it('is an inert empty outline, for a required icon prop with nothing to show', () => {
    const wrapper = mount(host(EMPTY_ICON), provide);
    const svg = wrapper.get('svg');
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.element.children).toHaveLength(0);
  });
});
