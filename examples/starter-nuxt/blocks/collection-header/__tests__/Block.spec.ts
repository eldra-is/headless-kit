// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { enUS } from '../../../app/i18n/en-US';

/** Only `variant` is required at the schema level — the "genuinely minimal" fixture every
 *  rebuilt block spec covers alongside the full `mock.json` (see `blocks/faq/__tests__/
 *  Block.spec.ts`'s own `bare` comment). Every other value — title, description, image, count —
 *  falls back to the demo storefront's default collection (`winter-knitwear`, `demo.ts`). */
const bare = { variant: 'image' as const };

/** jsdom reports `scrollHeight`/`clientHeight` as `0`/`0` for every element, so the clamp never
 *  "overflows" on its own — a known jsdom limitation. Stubbing both on
 *  the element prototype (restored after each test) is what lets a test drive the Read more
 *  disclosure's own overflow check deterministically. */
let restoreOverflowStub: (() => void) | null = null;

/** `scrollHeight`/`clientHeight` are inherited from `Element.prototype` in jsdom, not owned by
 *  `HTMLElement.prototype` itself — `getOwnPropertyDescriptor(HTMLElement.prototype, ...)` returns
 *  `undefined`, so the stub has to be *deleted* (not "restored to undefined") to stop shadowing the
 *  inherited accessor once a test is done with it. */
function stubOverflow(scrollHeight: number, clientHeight: number): void {
  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const clientDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  restoreOverflowStub = () => {
    if (scrollDescriptor)
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollDescriptor);
    else delete (HTMLElement.prototype as Record<string, unknown>).scrollHeight;
    if (clientDescriptor)
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientDescriptor);
    else delete (HTMLElement.prototype as Record<string, unknown>).clientHeight;
  };
}

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
  restoreOverflowStub?.();
  restoreOverflowStub = null;
});

/**
 * Mounts the block and lets the demo storefront's own `catalog.collection(handle)` resolve —
 * `createDemoResult` (`app/storefront/demo.ts`) always settles one tick after `watch(..., {
 * immediate: true })` fires, the same "real (if brief) pending transition" every storefront
 * consumer sees, so every assertion that reads the store's title/description/image/count needs a
 * `flushPromises()` first.
 */
async function mountHeader(data: Record<string, unknown>) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const wrapper = mount(Block, {
    ...base,
    attachTo: document.body,
  });
  trackedWrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe('collection-header block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content with no axe violations', async () => {
      const wrapper = await mountHeader(mock);
      expect(wrapper.text()).toContain(mock.title);
      expect(wrapper.text()).toContain('48');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the merged mock + preview content (the field-provided image) with no axe violations', async () => {
      const wrapper = await mountHeader({ ...mock, ...preview });
      const img = wrapper.get('img');
      expect(img.attributes('alt')).toBe(preview.image.altText);
      expect(img.attributes('src')).toContain(preview.image.url);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content (every fallback from the store) with no axe violations', async () => {
      const wrapper = await mountHeader(bare);
      expect(wrapper.text()).toContain('Winter knitwear');
      expect(wrapper.text()).toContain('48');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(['image', 'text-only'] as const)(
      'renders the %s variant with no axe violations',
      async (variant) => {
        const wrapper = await mountHeader({ ...mock, variant });
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );

    it('has no axe violations once Read more is expanded', async () => {
      stubOverflow(200, 60);
      const wrapper = await mountHeader(mock);
      await wrapper.get('button[aria-expanded]').trigger('click');
      expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('true');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('renders exactly one h1, which labels the header landmark', async () => {
    const wrapper = await mountHeader(mock);
    const headings = wrapper.findAll('h1');
    expect(headings).toHaveLength(1);
    const header = wrapper.get('header');
    expect(header.attributes('aria-labelledby')).toBe(headings[0]!.attributes('id'));
    expect(headings[0]!.text()).toBe(mock.title);
  });

  describe('breadcrumb', () => {
    it('is a labelled nav with aria-current="page" on the last (current) item', async () => {
      const wrapper = await mountHeader(mock);
      const nav = wrapper.get('nav');
      expect(nav.attributes('aria-label')).toBeTruthy();
      const current = nav.get('[aria-current="page"]');
      expect(current.text()).toBe(mock.title);
    });

    it('is absent when showBreadcrumb is off', async () => {
      const wrapper = await mountHeader({ ...mock, showBreadcrumb: false });
      expect(wrapper.find('nav').exists()).toBe(false);
    });
  });

  describe('read more', () => {
    it('is absent when the description is short (does not overflow the clamp)', async () => {
      const wrapper = await mountHeader(mock);
      expect(wrapper.find('button[aria-expanded]').exists()).toBe(false);
    });

    it('exposes aria-expanded/aria-controls pointing at the description, and toggles the label', async () => {
      stubOverflow(200, 60);
      const wrapper = await mountHeader(mock);
      const button = wrapper.get('button[aria-expanded]');
      const controlsId = button.attributes('aria-controls');
      expect(controlsId).toBeTruthy();
      expect(wrapper.find(`#${controlsId}`).exists()).toBe(true);
      expect(button.attributes('aria-expanded')).toBe('false');
      expect(button.text()).toContain(enUS.collection.readMore);

      await button.trigger('click');
      expect(button.attributes('aria-expanded')).toBe('true');
      expect(button.text()).toContain(enUS.collection.readLess);
    });

    it('toggles with both Enter and Space', async () => {
      stubOverflow(200, 60);
      const wrapper = await mountHeader(mock);
      const button = wrapper.get('button[aria-expanded]');

      await button.trigger('keydown', { key: 'Enter' });
      expect(button.attributes('aria-expanded')).toBe('true');

      await button.trigger('keydown', { key: ' ' });
      expect(button.attributes('aria-expanded')).toBe('false');
    });

    it('Esc on the button collapses it and keeps focus on the button', async () => {
      stubOverflow(200, 60);
      const wrapper = await mountHeader(mock);
      const button = wrapper.get('button[aria-expanded]');

      await button.trigger('click');
      expect(button.attributes('aria-expanded')).toBe('true');
      button.element.focus();

      await button.trigger('keydown', { key: 'Escape' });
      expect(button.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button.element);
    });

    it('Esc from inside the expanded text also collapses it and moves focus to the button', async () => {
      stubOverflow(200, 60);
      const wrapper = await mountHeader(mock);
      const button = wrapper.get('button[aria-expanded]');
      await button.trigger('click');
      expect(button.attributes('aria-expanded')).toBe('true');

      const controlsId = button.attributes('aria-controls');
      const description = wrapper.get(`#${controlsId}`);
      await description.trigger('keydown', { key: 'Escape' });

      expect(button.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(button.element);
    });
  });

  describe('count', () => {
    it("always comes from the storefront (the demo collection's 48), never a field", async () => {
      const wrapper = await mountHeader(mock);
      expect(wrapper.text()).toContain(enUS.collection.countMany.replace('{count}', '48'));
    });

    it('is hidden when showCount is off, even though the store still has a count', async () => {
      const wrapper = await mountHeader({ ...mock, showCount: false });
      expect(wrapper.text()).not.toContain('48');
    });
  });

  describe('sub-collection pills', () => {
    it('renders each as a link, marking the current one with aria-current and the weight class', async () => {
      const wrapper = await mountHeader(mock);
      const list = wrapper.get(`ul[aria-label="${enUS.collection.subcollections}"]`);
      const links = list.findAll('a');
      expect(links).toHaveLength(mock.subcollections.length);

      const current = links.find((link) => link.attributes('aria-current') === 'page')!;
      expect(current.text()).toBe('All');
      expect(current.classes()).toContain('font-semibold');

      const notCurrent = links.find((link) => link.text() === 'Sweaters')!;
      expect(notCurrent.attributes('aria-current')).toBeUndefined();
      expect(notCurrent.classes()).not.toContain('font-semibold');
    });
  });

  describe('image variant fallback', () => {
    it('renders the text-only layout with no <img> when neither the field nor the store has an image', async () => {
      const wrapper = await mountHeader({
        variant: 'image',
        title: 'Sale',
        collectionHandle: 'no-such-collection',
      });
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.text()).toContain('Sale');
    });

    it("falls back to the collection's own image when the field is empty", async () => {
      const wrapper = await mountHeader(mock);
      expect(wrapper.find('img').exists()).toBe(true);
    });
  });
});
