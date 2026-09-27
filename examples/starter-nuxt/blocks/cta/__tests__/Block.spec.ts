// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert — no `image` yet (Core's write-side media
// validator rejects a fixture-shaped object there); `preview.json` is the demo-imagery overlay
// `scripts/generate-stories.mjs`'s `Default` story merges onto it (see `docs/starter-kit.md`).
const withImage = { ...mock, ...preview };

function mountBlock(data: Record<string, unknown>) {
  return mount(Block, mountOptions({ entry: { id: 'e1', data } }));
}

/** Same as `mountBlock`, but with the Studio page-builder's edit mode active — the only state
 *  `EditorPlaceholder` renders in (`useEditing()`). Mirrors `breadcrumbs`' own `mountEditing`. */
function mountEditing(data: Record<string, unknown>) {
  const options = mountOptions({ entry: { id: 'e1', data } });
  const context = options.global.provide[ELDRA_KEY] as {
    preview: { active: boolean; mode: string };
  };
  context.preview.active = true;
  context.preview.mode = 'edit';
  return mount(Block, options);
}

describe('cta block', () => {
  it('roots every variant in the Section — the ancestor every @tablet:/@content: class in this block measures against', () => {
    // The block's own inner divs use `@tablet:`/`@content:` container-query classes, but none of
    // them declares `@container` itself — `Section`'s own root does (`Section.vue`'s `rootClass`),
    // so those classes only ever match if this block's root really is that `Section`, not a plain
    // `Container` or `div` (a `Container` never sets `@container` on its own).
    for (const variant of ['primary', 'subtle', 'split', 'banner'] as const) {
      const wrapper = mountBlock({ ...withImage, variant });
      expect(wrapper.get('section').classes()).toContain('@container');
    }
  });

  it('renders the bare mock.json content with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.eyebrow);
    expect(wrapper.text()).toContain(mock.text);
    expect(wrapper.text()).toContain(mock.primaryCtaLabel);
    expect(wrapper.text()).toContain(mock.secondaryCtaLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the merged (preview.json-overlaid) content with no axe violations', async () => {
    const wrapper = mountBlock(withImage);
    expect(wrapper.text()).toContain(withImage.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['primary', 'subtle', 'split', 'banner'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...withImage, variant });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it.each(['primary', 'subtle', 'split', 'banner'] as const)(
    'labels the section by its h2, which is an h2 in every variant including banner',
    (variant) => {
      const wrapper = mountBlock({ ...withImage, variant });
      const section = wrapper.get('section');
      const heading = wrapper.get('h2');
      expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'));
      expect(heading.text()).toBe(mock.heading);
    }
  );

  it('routes both same-site actions through the router, not a document navigation', () => {
    const wrapper = mountBlock(mock);
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).toEqual([mock.primaryCtaHref, mock.secondaryCtaHref]);
    // Both actions render as real anchors (the router stub itself writes an `<a href>`).
    expect(wrapper.get(`a[href="${mock.primaryCtaHref}"]`).text()).toBe(mock.primaryCtaLabel);
    expect(wrapper.get(`a[href="${mock.secondaryCtaHref}"]`).text()).toBe(mock.secondaryCtaLabel);
  });

  it('leaves an off-site primary action a plain document navigation', () => {
    const wrapper = mountBlock({ ...mock, primaryCtaHref: 'https://example.com/book' });
    expect(wrapper.findAllComponents({ name: 'NuxtLink' }).map((l) => l.props('to'))).toEqual([
      mock.secondaryCtaHref,
    ]);
    expect(wrapper.get('a[href="https://example.com/book"]').text()).toBe(mock.primaryCtaLabel);
  });

  it('split with no image renders the centred fallback and no <img>', async () => {
    const wrapper = mountBlock({ ...mock, variant: 'split' });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.get(`a[href="${mock.primaryCtaHref}"]`).exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('split with an image renders exactly one <img>, alt-tagged from the field', () => {
    const wrapper = mountBlock({ ...withImage, variant: 'split' });
    const images = wrapper.findAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]!.attributes('alt')).toBe(preview.image.altText);
  });

  it('banner renders exactly one button and drops the eyebrow and secondary action', () => {
    const wrapper = mountBlock({ ...mock, variant: 'banner' });
    expect(wrapper.findAll('a, button')).toHaveLength(1);
    expect(wrapper.get(`a[href="${mock.primaryCtaHref}"]`).text()).toBe(mock.primaryCtaLabel);
    expect(wrapper.text()).not.toContain(mock.eyebrow);
    expect(wrapper.text()).not.toContain(mock.secondaryCtaLabel);
  });

  it('the banner button is a smaller control below 48rem, and the package’s own lg from 48rem (spec: 2.75rem, then 3rem)', () => {
    const wrapper = mountBlock({ ...mock, variant: 'banner' });
    const button = wrapper.get('a, button');
    const classes = button.classes();
    // `control-h` (the package's regular control height, closest token-backed step to the spec's
    // 2.75rem) below `@tablet` (48rem of the block's own width); `@tablet:control-h-lg` (3rem)
    // from 48rem on — see `Block.vue`'s own doc comment on the banner Button's `classes.container`.
    expect(classes).toContain('control-h');
    expect(classes).toContain('@tablet:control-h-lg');
    // `size="lg"`'s own *unprefixed* `control-h-lg` must be gone — `cx`'s custom `twMerge` config
    // treats `control-h`/`control-h-lg` as one conflicting group, so the override replaces it
    // rather than sitting beside it (which would let the bare `control-h-lg` win the cascade at
    // every width, silently keeping the button at 3rem below 48rem too). Its `lg` padding/text
    // sizing (`px-6`, `text-button-lg`) stay untouched — a different, non-conflicting class group.
    expect(classes).not.toContain('control-h-lg');
    expect(classes).toContain('px-6');
    expect(classes).toContain('text-button-lg');
  });

  it('marks the banner panel data-section="accent" — the attribute that inverts the button, not a colour class', () => {
    const wrapper = mountBlock({ ...mock, variant: 'banner' });
    const panel = wrapper.get('[data-section="accent"]');
    expect(panel.classes()).toContain('group/section');
    // Mutation check (manual): removing `data-section="accent"` from the panel while keeping
    // `bg-accent` leaves the button unstyled by the package's own inversion rules (its classes are
    // `group-data-[section=accent]/section:*`) — confirmed by temporarily dropping the attribute
    // here and observing the assertion above fail (`get()` throws, no such element).
  });

  it('omits the secondary action when no secondary label/href is set', () => {
    const wrapper = mountBlock({
      ...mock,
      secondaryCtaLabel: undefined,
      secondaryCtaHref: undefined,
    });
    expect(wrapper.text()).not.toContain(mock.secondaryCtaLabel);
    expect(wrapper.findAll('a, button')).toHaveLength(1);
  });

  it('renders an entry saved before version 2 (no primaryCtaLabel at all) without throwing, and with no action', () => {
    // A published page can carry a cta entry written against the previous block version, whose
    // fields were `buttonLabel`/`buttonHref`/`body`. Those never migrate on their own, and a
    // required-field guarantee only holds for entries Studio wrote against *this* version — so a
    // missing string must read as empty, never crash server rendering of the whole page.
    const wrapper = mountBlock({
      variant: 'primary',
      heading: mock.heading,
      body: 'Connect your repo and publish in minutes.',
      buttonLabel: 'Start now',
      buttonHref: '/contact',
    });
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('a, button')).toHaveLength(0);
  });

  it('renders minimal content — heading and one button — with no eyebrow or text', async () => {
    const wrapper = mountBlock({
      variant: 'primary',
      heading: mock.heading,
      primaryCtaLabel: mock.primaryCtaLabel,
      primaryCtaHref: mock.primaryCtaHref,
    });
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('a, button')).toHaveLength(1);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  describe('keyboard path', () => {
    it('reaches the primary action then the secondary action, in document (Tab) order', () => {
      const wrapper = mountBlock(mock);
      const links = wrapper.findAll('a');
      expect(links.map((link) => link.text())).toEqual([
        mock.primaryCtaLabel,
        mock.secondaryCtaLabel,
      ]);
      // Both are real, in-flow anchors — no `tabindex` override, nothing removed from the tab
      // order.
      for (const link of links) expect(link.attributes('tabindex')).toBeUndefined();
    });

    /**
     * jsdom does not run a native `<a href>`'s default Enter activation (see
     * `packages/ui/src/components/button/__tests__/button.spec.ts`'s own "native activation
     * contract" comment), so "press Enter, expect navigation" cannot fail here and would test
     * nothing. This asserts the contract that gives Enter its meaning instead: nothing in this
     * block cancels the keydown, so the platform's own default action still runs. Mutation check
     * (manual): adding a `@keydown.enter.prevent` handler to either `Button` in `Block.vue` flips
     * `defaultPrevented` to `true` and fails this test.
     */
    it('activates the primary action with a native Enter contract, and the secondary the same way', () => {
      const wrapper = mount(Block, {
        ...mountOptions({ entry: { id: 'e1', data: mock } }),
        attachTo: document.body,
      });
      const primary = wrapper.get(`a[href="${mock.primaryCtaHref}"]`).element as HTMLAnchorElement;
      const secondary = wrapper.get(`a[href="${mock.secondaryCtaHref}"]`)
        .element as HTMLAnchorElement;

      primary.focus();
      expect(document.activeElement).toBe(primary);
      const primaryEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      primary.dispatchEvent(primaryEnter);
      expect(primaryEnter.defaultPrevented).toBe(false);

      secondary.focus();
      expect(document.activeElement).toBe(secondary);
      const secondaryEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      secondary.dispatchEvent(secondaryEnter);
      expect(secondaryEnter.defaultPrevented).toBe(false);

      wrapper.unmount();
    });
  });

  describe('editor hints (spec line 815, "Empty (freshly inserted)")', () => {
    it('shows no hints outside the editor even when every optional field is empty', () => {
      const wrapper = mountBlock({
        variant: 'primary',
        heading: mock.heading,
        primaryCtaLabel: mock.primaryCtaLabel,
        primaryCtaHref: mock.primaryCtaHref,
      });
      expect(wrapper.text()).not.toContain('Add supporting text');
    });

    it('hints for a missing heading and a missing button, only in the editor', async () => {
      const live = mountBlock({
        variant: 'primary',
        heading: '',
        primaryCtaLabel: '',
        primaryCtaHref: '',
      });
      expect(live.text()).not.toContain('Add a heading');
      expect(live.text()).not.toContain('Add a button');

      const editing = mountEditing({
        variant: 'primary',
        heading: '',
        primaryCtaLabel: '',
        primaryCtaHref: '',
      });
      expect(editing.text()).toContain('Add a heading');
      expect(editing.text()).toContain('Add a button');
      expect(await axe(editing.element)).toHaveNoViolations();
    });

    it('hints for missing supporting text only in the editor, even with a heading and a button', () => {
      const editing = mountEditing(mock);
      // `mock.json`'s `text` is filled in, so the hint must not appear here.
      expect(editing.text()).not.toContain('Add supporting text');

      const editingNoText = mountEditing({ ...mock, text: '' });
      expect(editingNoText.text()).toContain('Add supporting text');
    });
  });
});
