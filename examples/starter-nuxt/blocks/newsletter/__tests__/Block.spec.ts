// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type { StorefrontAck, StorefrontForms } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { enUS } from '../../../app/i18n/en-US';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

/** `EldraIcon` (success/alert icons) resolves through `useEldraIcon`, which under Nuxt calls
 *  `/api/eldra-icon`; outside Nuxt this needs an injected `ICON_FETCHER_KEY` (see `footer`'s and
 *  `feature-grid`'s own specs for the identical pattern) — reads the real SVGs synchronously,
 *  network-free. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/** Only the fields the block requires (`variant`, `heading`, `consent`, `list`) — the "genuinely
 *  minimal" fixture every rebuilt block spec covers alongside the full `mock.json` (see
 *  `blocks/faq/__tests__/Block.spec.ts`'s own `bare` comment). Exercises every fallback default
 *  (field label, placeholder, button label, success title) at once. */
const bare = {
  variant: 'centered',
  heading: 'Letters from the workshop',
  consent: mock.consent,
  list: 'letters-from-the-workshop',
};

/** A resolvable-on-demand `forms.subscribe`, for the "submitting"/"repeat submits ignored" tests
 *  that need to observe the pending state before it settles (the same shape `cart.spec.ts`'s own
 *  "pending true-during/false-after via a deferred promise" case uses). */
function deferredAck(): { promise: Promise<StorefrontAck>; resolve: (ack: StorefrontAck) => void } {
  let resolve!: (ack: StorefrontAck) => void;
  const promise = new Promise<StorefrontAck>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function withForms(subscribe: StorefrontForms['subscribe']) {
  const base = createDemoStorefront();
  return { ...base, forms: { ...base.forms, subscribe } };
}

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

function mountNewsletter(
  data: Record<string, unknown>,
  options: { subscribe?: StorefrontForms['subscribe'] } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const wrapper = mount(Block, {
    ...base,
    // Real focus tracking (`document.activeElement`) needs the tree connected to the document —
    // jsdom does not reliably track focus on a detached mount.
    attachTo: document.body,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [ICON_FETCHER_KEY]: stubFetcher,
        ...(options.subscribe ? { [STOREFRONT_KEY]: withForms(options.subscribe) } : {}),
      },
    },
  });
  trackedWrappers.push(wrapper);
  return wrapper;
}

async function submitValidEmail(
  wrapper: ReturnType<typeof mountNewsletter>,
  email = 'reader@example.com'
) {
  await wrapper.find('input[type="email"]').setValue(email);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('newsletter block', () => {
  describe('accessibility', () => {
    it('renders the full mock.json content with no axe violations', async () => {
      const wrapper = mountNewsletter(mock);
      expect(wrapper.text()).toContain(mock.heading);
      expect(wrapper.text()).toContain(mock.text);
      expect(wrapper.text()).toContain('privacy policy');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content (every fallback default) with no axe violations', async () => {
      const wrapper = mountNewsletter(bare);
      expect(wrapper.text()).toContain(bare.heading);
      expect(wrapper.text()).toContain(enUS.newsletter.emailLabel);
      expect(wrapper.text()).toContain(enUS.newsletter.subscribe);
      expect(wrapper.find('input[type="email"]').attributes('placeholder')).toBe(
        enUS.newsletter.emailPlaceholder
      );
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it.each(['centered', 'split'] as const)(
      'renders the %s variant with no axe violations',
      async (variant) => {
        const wrapper = mountNewsletter({ ...mock, variant });
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );

    it('renders on a primary background with no axe violations', async () => {
      const wrapper = mountNewsletter({ ...mock, sectionBackground: 'primary' });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('the required consent checkbox state has no axe violations, unticked and in error', async () => {
      const wrapper = mountNewsletter({ ...mock, requireConsentCheckbox: true });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('the block root is the Section component, a width container for its own @content:/@two-col: breakpoints', () => {
    const wrapper = mountNewsletter(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('defaults sectionBackground to surface when unset', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const wrapper = mountNewsletter(withoutBackground);
    const section = wrapper.get('section');
    expect(section.attributes('data-section-bg')).toBe('surface');
  });

  it('the label is visible, tied to the input by for/id, and the placeholder is never the label', () => {
    const wrapper = mountNewsletter(mock);
    const input = wrapper.find('input[type="email"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('autocomplete')).toBe('email');
    expect(input.attributes('placeholder')).toBe(mock.placeholder);

    const id = input.attributes('id');
    expect(id).toBeTruthy();
    const label = wrapper.find(`label[for="${id}"]`);
    expect(label.exists()).toBe(true);
    expect(label.text()).toBe(mock.fieldLabel);
    // The placeholder text is a different string from the label — never standing in for it.
    expect(label.text()).not.toBe(input.attributes('placeholder'));
  });

  describe('email validation', () => {
    it('an empty submit sets aria-invalid, shows the message with an icon linked by aria-describedby, and keeps focus in the field', async () => {
      const wrapper = mountNewsletter(mock);
      const input = wrapper.find('input[type="email"]');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(input.attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain(enUS.newsletter.invalidEmail);
      const describedBy = input.attributes('aria-describedby');
      expect(describedBy).toBeTruthy();
      const errorEl = wrapper.find(`#${describedBy}`);
      expect(errorEl.text()).toContain(enUS.newsletter.invalidEmail);
      expect(errorEl.find('svg').exists()).toBe(true);
      expect(document.activeElement).toBe(input.element);
    });

    it('a malformed (not-an-email) submit sets aria-invalid the same way and keeps focus in the field', async () => {
      const wrapper = mountNewsletter(mock);
      const input = wrapper.find('input[type="email"]');
      await input.setValue('not-an-email');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(input.attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain(enUS.newsletter.invalidEmail);
      expect(document.activeElement).toBe(input.element);
    });

    it('a backend {ok:false, reason:"invalid"} shows the exact same invalid-email message', async () => {
      const wrapper = mountNewsletter(mock, {
        subscribe: async () => ({ ok: false, reason: 'invalid' }),
      });
      await submitValidEmail(wrapper);

      const input = wrapper.find('input[type="email"]');
      expect(input.attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain(enUS.newsletter.invalidEmail);
      expect(document.activeElement).toBe(input.element);
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('a backend failure with no reason shows the generic failed message and keeps the form', async () => {
      const wrapper = mountNewsletter(mock, {
        subscribe: async () => ({ ok: false, reason: 'failed' }),
      });
      await submitValidEmail(wrapper);

      const input = wrapper.find('input[type="email"]');
      expect(input.attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain(enUS.newsletter.failed);
      expect(document.activeElement).toBe(input.element);
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('after a backend failure, resubmitting the unchanged email reaches the service again and can succeed', async () => {
      const results = [{ ok: false as const, reason: 'failed' }, { ok: true as const }];
      const subscribe = vi.fn(async () => results.shift() ?? { ok: true as const });
      const wrapper = mountNewsletter(mock, { subscribe });
      await submitValidEmail(wrapper, 'reader@example.com');
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(wrapper.find('input[type="email"]').attributes('aria-invalid')).toBe('true');

      // Same value, no edit in between: the form's own invalid gate must not swallow this.
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      await flushPromises();

      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(subscribe).toHaveBeenLastCalledWith({ email: 'reader@example.com', list: mock.list });
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.find('[role="status"]').text()).toContain(enUS.newsletter.successTitle);
    });
  });

  describe('success', () => {
    it('a role="status" region exists before submission, empty', () => {
      const wrapper = mountNewsletter(mock);
      const status = wrapper.find('[role="status"]');
      expect(status.exists()).toBe(true);
      expect(status.text()).toBe('');
    });

    it('a valid submit calls forms.subscribe with the email and list, replaces the form with the status panel, and moves focus to it', async () => {
      const subscribe = vi.fn(async () => ({ ok: true }) as StorefrontAck);
      const wrapper = mountNewsletter(mock, { subscribe });
      await submitValidEmail(wrapper, 'reader@example.com');

      expect(subscribe).toHaveBeenCalledWith({ email: 'reader@example.com', list: mock.list });
      expect(wrapper.find('form').exists()).toBe(false);

      const status = wrapper.find('[role="status"]');
      expect(status.text()).toContain(mock.successTitle);
      expect(status.text()).toContain(mock.successText);
      expect(status.attributes('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(status.element);
    });

    it('falls back to the default success title when successTitle is unset', async () => {
      const { successTitle: _omit, ...withoutTitle } = mock;
      const wrapper = mountNewsletter(withoutTitle, { subscribe: async () => ({ ok: true }) });
      await submitValidEmail(wrapper);
      expect(wrapper.find('[role="status"]').text()).toContain(enUS.newsletter.successTitle);
    });
  });

  describe('submitting state', () => {
    it('aria-busy is true on the submit button while pending, and repeat submits are ignored', async () => {
      const deferred = deferredAck();
      const subscribe = vi.fn(() => deferred.promise);
      const wrapper = mountNewsletter(mock, { subscribe });

      await wrapper.find('input[type="email"]').setValue('reader@example.com');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      const button = wrapper.get('button[type="submit"]');
      expect(button.attributes('aria-busy')).toBe('true');

      // A second submit while still pending must not call subscribe again.
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(1);

      deferred.resolve({ ok: true });
      await flushPromises();
      expect(wrapper.get('[role="status"]').text()).toContain(mock.successTitle);
    });
  });

  describe('required consent checkbox', () => {
    it('is never pre-ticked', () => {
      const wrapper = mountNewsletter({ ...mock, requireConsentCheckbox: true });
      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.exists()).toBe(true);
      expect((checkbox.element as HTMLInputElement).checked).toBe(false);
    });

    it('is absent when requireConsentCheckbox is off (the default)', () => {
      const wrapper = mountNewsletter(mock);
      expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    });

    it('blocks submission until ticked, showing its own error and moving focus to it', async () => {
      const subscribe = vi.fn(async () => ({ ok: true }) as StorefrontAck);
      const wrapper = mountNewsletter({ ...mock, requireConsentCheckbox: true }, { subscribe });

      await wrapper.find('input[type="email"]').setValue('reader@example.com');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(subscribe).not.toHaveBeenCalled();
      const checkbox = wrapper.find('input[type="checkbox"]');
      expect(checkbox.attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain(enUS.newsletter.consentRequired);
      const describedBy = checkbox.attributes('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(wrapper.find(`#${describedBy}`).text()).toContain(enUS.newsletter.consentRequired);
      expect(document.activeElement).toBe(checkbox.element);

      // Ticking it and submitting again now succeeds.
      await checkbox.setValue(true);
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[role="status"]').text()).toContain(mock.successTitle);
    });
  });

  describe('keyboard', () => {
    it('Tab order is input, checkbox, button, then the consent link', () => {
      const wrapper = mountNewsletter({ ...mock, requireConsentCheckbox: true });
      const focusables = [
        ...wrapper.element.querySelectorAll<HTMLElement>(
          'input[type="email"], input[type="checkbox"], button[type="submit"], a'
        ),
      ];
      const tags = focusables.map((el) => {
        if (el.tagName === 'INPUT') return (el as HTMLInputElement).type;
        if (el.tagName === 'BUTTON') return (el as HTMLButtonElement).type;
        return el.tagName.toLowerCase();
      });
      expect(tags).toEqual(['email', 'checkbox', 'submit', 'a']);
    });

    it('Enter in the input submits the form', async () => {
      const subscribe = vi.fn(async () => ({ ok: true }) as StorefrontAck);
      const wrapper = mountNewsletter(mock, { subscribe });
      await wrapper.find('input[type="email"]').setValue('reader@example.com');
      // jsdom does not implement the browser's native "Enter submits the nearest form" default
      // action for a dispatched keydown (the same limitation `faq`'s own accordion suite documents
      // for Enter/Space on a native element) — triggering the form's own `submit` event is the
      // stand-in for that native behaviour, on the same real, unmodified `<form>`.
      await wrapper.find('form').trigger('submit');
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
    });

    it('Space toggles the checkbox (native default; a click stands in for it under jsdom)', async () => {
      const wrapper = mountNewsletter({ ...mock, requireConsentCheckbox: true });
      const checkbox = wrapper.find('input[type="checkbox"]');
      expect((checkbox.element as HTMLInputElement).checked).toBe(false);
      await checkbox.setValue(true);
      expect((checkbox.element as HTMLInputElement).checked).toBe(true);
    });
  });

  describe('split variant', () => {
    it('renders the same field and button as centered', () => {
      const wrapper = mountNewsletter({ ...mock, variant: 'split' });
      expect(wrapper.find('input[type="email"]').exists()).toBe(true);
      expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
      expect(wrapper.text()).toContain(mock.heading);
    });
  });
});
