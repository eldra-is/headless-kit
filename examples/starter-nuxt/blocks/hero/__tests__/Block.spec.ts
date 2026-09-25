// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert (no image — see
// task-9b-live-report.md, Finding 2); `preview.json` is the demo-imagery
// overlay `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImage = { ...mock, ...preview };

describe('hero block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json axe-clean for every variant, including image-background with no image (regression net for a freshly-inserted block)', async () => {
    for (const variant of ['image-right', 'image-background', 'centered'] as const) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('image-background falls back to a plain surface (not primary-contrast-on-nothing) when there is no image yet', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'image-background' } } })
    );
    const section = wrapper.get('section');
    expect(section.classes()).toContain('bg-surface-strong');
    expect(section.classes()).not.toContain('text-primary-contrast');
  });

  it.each(['image-right', 'image-background', 'centered'] as const)(
    'renders the heading exactly once for the %s variant, with the preview image',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant } } })
      );
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(wrapper.get('h1').text()).toBe(withImage.heading);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('carries the framing marker attributes on the rendered image (image-right)', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'hero-1', data: { ...withImage, variant: 'image-right' } } })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
  });

  it('carries the framing marker attributes on the background image (image-background)', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'hero-1', data: { ...withImage, variant: 'image-background' } },
      })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
  });

  it('applies the xl radius to the frame for the image-right variant', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImage, variant: 'image-right' } } })
    );
    expect(wrapper.get('[data-part="frame"]').classes()).toContain('rounded-xl');
  });

  /**
   * `UiImage`'s `fill` prop (task-7-fix-1.md ruling 2): the background image must cover the
   * section it sits behind, which needs `Image`'s root to fill the section (`absolute inset-0
   * h-full w-full`) and its frame to fill the root (`h-full w-full`) rather than reserving its own
   * aspect-ratio box — `Image`'s attribute-forwarding contract puts a caller's plain `class` on
   * the root, but the old bare `class="absolute inset-0 h-full w-full object-cover"` landed on the
   * `<img>` directly, so it silently stopped covering the section once routed through `Image`
   * (review finding: "hero image-background no longer covers the section"). jsdom does not compute
   * layout, so this asserts the classes/style that make that geometry hold, not the rendered
   * pixels.
   */
  it('fills the section for the image-background variant (root/frame classes, no forced aspect-ratio)', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'e1', data: { ...withImage, variant: 'image-background' } },
      })
    );
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toEqual(
      expect.arrayContaining(['absolute', 'inset-0', 'h-full', 'w-full'])
    );
    const frame = wrapper.get('[data-part="frame"]');
    expect(frame.classes()).toEqual(expect.arrayContaining(['h-full', 'w-full']));
    // `ratio="auto"` with no `media.width`/`height` (this wrapper never has them) resolves to the
    // CSS keyword `auto` — no fixed aspect-ratio box fights the `h-full` above.
    expect(frame.attributes('style')).toContain('aspect-ratio: auto');
    const media = wrapper.get('[data-part="media"]');
    expect(media.classes()).toEqual(expect.arrayContaining(['object-cover', 'h-full', 'w-full']));
  });

  it('falls back to the built-in CTAs when the actions slot is empty', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.ctaLabel);
    expect(wrapper.text()).toContain(mock.secondaryCtaLabel);
  });

  it('routes both same-site CTAs through the router, not a document navigation', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    // Both destinations are same-site, so both must go through `EldraRouterLink` -> `NuxtLink`.
    // `Button` reaches it through the same `as` prop `Link` uses, and hands it the destination as
    // `to`: asserting the component's prop (not the rendered `href`) is what tells the two apart,
    // since the stub renders an `<a href>` either way.
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).toEqual(['/shop/new', '/about']);
  });

  it('leaves an off-site CTA a plain document navigation', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, ctaHref: 'https://example.com/shop' } } })
    );
    expect(wrapper.findAllComponents({ name: 'NuxtLink' }).map((l) => l.props('to'))).toEqual([
      '/about',
    ]);
    expect(wrapper.get('a[href="https://example.com/shop"]').text()).toBe(mock.ctaLabel);
  });

  it('renders a placed actions slot instead of the built-in CTAs', () => {
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: mock } }),
      slots: { actions: () => h('button', 'Custom action') },
    });
    expect(wrapper.text()).toContain('Custom action');
    expect(wrapper.text()).not.toContain(mock.ctaLabel);
  });
});
