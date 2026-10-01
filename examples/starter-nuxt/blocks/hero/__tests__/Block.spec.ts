// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert (no image/slides — Core's write-side media
// validator rejects a fixture-shaped object there); `preview.json` is the demo-imagery overlay
// `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImage = { ...mock, ...preview };

const VARIANTS = [
  'image-right',
  'image-left',
  'image-background',
  'centered',
  'split-carousel',
] as const;

describe('hero block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  /**
   * Every `@tablet:`/`@content:` class in this block measures against the nearest `@container`
   * ancestor — `Container` (the block's other wrapper) declares none of its own, so the block's
   * `@content:grid-cols-2`/`@tablet:flex-row`/etc. only ever take effect because `Section`'s own
   * root already carries `@container` (see `Section.vue`). Asserted directly so a future change
   * that swaps the root away from `Section` (or a `classes.root` override that drops the class)
   * fails loudly instead of silently keeping every block at its mobile layout at every width.
   */
  it('the block root carries @container, so its @tablet:/@content: classes have something to measure against', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.get('section').classes()).toContain('@container');
  });

  it.each(VARIANTS)(
    'renders the bare mock.json axe-clean for the %s variant, with no <img> and exactly one h1 (regression net for a freshly-inserted block)',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('image-background falls back to a plain surface (not primary-contrast-on-nothing) when there is no image yet', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'image-background' } } })
    );
    const section = wrapper.get('section');
    expect(section.classes()).toContain('bg-surface-strong');
    expect(section.classes()).not.toContain('text-primary-contrast');
  });

  it.each(VARIANTS)(
    'renders the heading exactly once for the %s variant, with the preview image/slides',
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
   * The background image must cover the section it sits behind, which needs `Image`'s root to
   * fill the section (`absolute inset-0 h-full w-full`) and its frame to fill the root (`h-full
   * w-full`) rather than reserving its own aspect-ratio box. jsdom does not compute layout, so
   * this asserts the classes/style that make that geometry hold, not the rendered pixels.
   */
  it('fills the section for the image-background variant (root/frame classes, no forced aspect-ratio)', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'e1', data: { ...withImage, variant: 'image-background' } },
      })
    );
    // `Section` and `Container` also carry `data-part="root"` on their own elements — this
    // scopes to the one Image's `fill` prop actually put the absolute-fill classes on.
    const root = wrapper.get('[data-part="root"].absolute');
    expect(root.classes()).toEqual(
      expect.arrayContaining(['absolute', 'inset-0', 'h-full', 'w-full'])
    );
    const frame = wrapper.get('[data-part="frame"]');
    expect(frame.classes()).toEqual(expect.arrayContaining(['h-full', 'w-full']));
    expect(frame.attributes('style')).toContain('aspect-ratio: auto');
    const media = wrapper.get('[data-part="media"]');
    expect(media.classes()).toEqual(expect.arrayContaining(['object-cover', 'h-full', 'w-full']));
  });

  it('renders no built-in CTAs — the seeded state carries no destination for either', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).not.toContain(mock.primaryCtaLabel);
    expect(wrapper.text()).not.toContain(mock.secondaryCtaLabel);
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it('falls back to the built-in CTAs when the actions slot is empty and hrefs are set', () => {
    const primaryCtaHref = '/collections/new';
    const secondaryCtaHref = '/pages/about';
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, primaryCtaHref, secondaryCtaHref } } })
    );
    expect(wrapper.text()).toContain(mock.primaryCtaLabel);
    expect(wrapper.text()).toContain(mock.secondaryCtaLabel);
  });

  it('routes both same-site CTAs through the router, not a document navigation', () => {
    const primaryCtaHref = '/collections/new';
    const secondaryCtaHref = '/pages/about';
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, primaryCtaHref, secondaryCtaHref } } })
    );
    // Both destinations are same-site, so both must go through `EldraRouterLink` -> `NuxtLink`.
    // `Button` reaches it through the same `as` prop `Link` uses, and hands it the destination as
    // `to`: asserting the component's prop (not the rendered `href`) is what tells the two apart,
    // since the stub renders an `<a href>` either way.
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).toEqual([primaryCtaHref, secondaryCtaHref]);
  });

  it('leaves an off-site CTA a plain document navigation', () => {
    const secondaryCtaHref = '/pages/about';
    const wrapper = mount(
      Block,
      mountOptions({
        entry: {
          id: 'e1',
          data: { ...mock, primaryCtaHref: 'https://example.com/shop', secondaryCtaHref },
        },
      })
    );
    expect(wrapper.findAllComponents({ name: 'NuxtLink' }).map((l) => l.props('to'))).toEqual([
      secondaryCtaHref,
    ]);
    expect(wrapper.get('a[href="https://example.com/shop"]').text()).toBe(mock.primaryCtaLabel);
  });

  it('renders a placed actions slot instead of the built-in CTAs', () => {
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: mock } }),
      slots: { actions: () => h('button', 'Custom action') },
    });
    expect(wrapper.text()).toContain('Custom action');
    expect(wrapper.text()).not.toContain(mock.primaryCtaLabel);
  });

  describe('split-carousel', () => {
    it('renders one figure per slide, each a "slide" of the total, with a 4/5 framed image', () => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant: 'split-carousel' } } })
      );
      const figures = wrapper.findAll('figure');
      expect(figures).toHaveLength(withImage.slides.length);
      figures.forEach((figure, index) => {
        expect(figure.attributes('aria-roledescription')).toBe('slide');
        expect(figure.attributes('aria-label')).toBe(`${index + 1} of ${withImage.slides.length}`);
      });
      expect(wrapper.findAll('[data-part="frame"]')[0]?.classes()).toContain('rounded-xl');
    });

    it('wraps a slide with a same-site link in the router, and leaves an unlinked slide plain', () => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant: 'split-carousel' } } })
      );
      // Scoped to the track: the copy column's own primary/secondary CTAs also route through
      // `NuxtLink` and would otherwise be picked up by a bare `findAllComponents`.
      const links = wrapper.get('[data-part="track"]').findAllComponents({ name: 'NuxtLink' });
      expect(links.map((link) => link.props('to'))).toEqual(withImage.slides.map((s) => s.href));
    });

    it('renders a slide with no link as a plain figure (no anchor at all)', () => {
      const slides = [
        { image: preview.slides[0]!.image, alt: 'Terracotta serving bowl' },
        { ...preview.slides[1]!, href: 'https://example.com/off-site' },
      ];
      const wrapper = mount(
        Block,
        mountOptions({
          entry: { id: 'e1', data: { ...mock, variant: 'split-carousel', slides } },
        })
      );
      const figures = wrapper.findAll('figure');
      expect(figures[0]?.find('a').exists()).toBe(false);
      expect(figures[1]?.get('a').attributes('href')).toBe('https://example.com/off-site');
      expect(
        wrapper.get('[data-part="track"]').findAllComponents({ name: 'NuxtLink' })
      ).toHaveLength(0);
    });

    it('the track is focusable; ArrowLeft/ArrowRight move one slide and disable the arrows at the ends', async () => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant: 'split-carousel' } } })
      );
      // `useCarousel`'s `annotate()`/`updateEdges()` run in `onMounted` and mutate reactive state
      // there — the DOM only reflects it after the next tick.
      await nextTick();
      const track = wrapper.get('[data-part="track"]');
      expect(track.attributes('tabindex')).toBe('0');
      const prevButton = () => wrapper.get('[data-part="prev"]');
      const nextButton = () => wrapper.get('[data-part="next"]');

      expect(prevButton().attributes('disabled')).toBeDefined();
      expect(nextButton().attributes('disabled')).toBeUndefined();

      await track.trigger('keydown', { key: 'ArrowRight' });
      await track.trigger('keydown', { key: 'ArrowRight' });
      await track.trigger('keydown', { key: 'ArrowRight' });
      expect(prevButton().attributes('disabled')).toBeUndefined();
      expect(nextButton().attributes('disabled')).toBeDefined();

      await track.trigger('keydown', { key: 'ArrowLeft' });
      expect(nextButton().attributes('disabled')).toBeUndefined();
    });

    it('never leaves focus on a disabled arrow', async () => {
      const wrapper = mount(Block, {
        ...mountOptions({
          entry: { id: 'e1', data: { ...withImage, variant: 'split-carousel' } },
        }),
        attachTo: document.body,
      });
      await nextTick();
      const nextButton = wrapper.get('[data-part="next"]');
      (nextButton.element as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(nextButton.element);
      // 4 slides: three "next" clicks land on the last one, disabling `next`.
      await nextButton.trigger('click');
      await nextButton.trigger('click');
      await nextButton.trigger('click');
      expect(document.activeElement).toBe(wrapper.get('[data-part="prev"]').element);
      wrapper.unmount();
    });

    it('never autoplays', () => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant: 'split-carousel' } } })
      );
      expect(wrapper.find('[data-part="pause"]').exists()).toBe(false);
    });

    it('renders no carousel and no <img> with no slides yet (bare mock), and passes axe', async () => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'split-carousel' } } })
      );
      expect(wrapper.find('[data-part="track"]').exists()).toBe(false);
      expect(wrapper.find('img').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });
});
