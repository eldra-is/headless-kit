// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type {
  StorefrontFormDefinition,
  StorefrontFormSubmitResult,
  StorefrontSource,
} from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';
import enUS from '../../../i18n/en-US.json';

/** Only what the block requires: `preset`, `formKey`, `heading`. */
const bare = { preset: 'default', formKey: 'contact', heading: 'Send us a message' };

type Submit = StorefrontSource['forms']['submit'];

/** The demo storefront with `forms.submit` replaced, and optionally a Turnstile site key on the
 *  definition — the two things a spec here needs to steer. */
function withForms(options: {
  submit?: Submit;
  turnstileSiteKey?: string;
  successRedirect?: string;
  locale?: string;
}) {
  const base = createDemoStorefront({ formLocale: options.locale });
  return {
    ...base,
    forms: {
      definition: (key: Parameters<StorefrontSource['forms']['definition']>[0]) => {
        const result = base.forms.definition(key);
        if (options.turnstileSiteKey === undefined && options.successRedirect === undefined) {
          return result;
        }
        const { data } = result;
        return {
          ...result,
          get data() {
            return {
              get value(): StorefrontFormDefinition | null {
                return data.value === null
                  ? null
                  : {
                      ...data.value,
                      turnstileSiteKey: options.turnstileSiteKey ?? null,
                      successRedirect: options.successRedirect ?? null,
                    };
              },
            } as typeof data;
          },
        };
      },
      submit: options.submit ?? base.forms.submit,
    },
  };
}

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((node) => node.remove());
  delete (window as { turnstile?: unknown }).turnstile;
});

async function mountForm(
  data: Record<string, unknown>,
  options: {
    submit?: Submit;
    turnstileSiteKey?: string;
    successRedirect?: string;
    locale?: string;
  } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } }, { locale: options.locale });
  const custom =
    options.submit ||
    options.turnstileSiteKey !== undefined ||
    options.successRedirect !== undefined
      ? { [STOREFRONT_KEY]: withForms(options) }
      : {};
  const wrapper = mount(Block, {
    ...base,
    attachTo: document.body,
    global: { ...base.global, provide: { ...base.global.provide, ...custom } },
  });
  trackedWrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const ok = (pending = false): Submit => vi.fn(async () => ({ ok: true, pending }));

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

async function fillContact(wrapper: VueWrapper) {
  await wrapper.find('input[name="name"]').setValue('Anna Jónsdóttir');
  await wrapper.find('input[name="email"]').setValue('anna@example.is');
  await wrapper.find('textarea[name="message"]').setValue('Where is my order, please?');
}

describe('form block', () => {
  describe('rendering from the definition', () => {
    it('renders every field of the form the key names, labelled, with no axe violations', async () => {
      const wrapper = await mountForm(mock);
      expect(wrapper.text()).toContain(mock.heading);
      expect(wrapper.text()).toContain(mock.text);
      for (const label of ['Name', 'Email address', 'Message']) {
        expect(wrapper.find('label').exists()).toBe(true);
        expect(wrapper.text()).toContain(label);
      }
      const name = wrapper.get('input[name="name"]');
      const label = wrapper.get(`label[for="${name.attributes('id')}"]`);
      expect(label.text()).toContain('Name');
      expect(wrapper.get('input[name="email"]').attributes('type')).toBe('email');
      expect(wrapper.get('input[name="email"]').attributes('autocomplete')).toBe('email');
      expect(wrapper.find('textarea[name="message"]').exists()).toBe(true);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the bare, required-fields-only content with the default button label', async () => {
      const wrapper = await mountForm(bare);
      expect(wrapper.get('button[type="submit"]').text()).toBe(enUS.form.submit);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders the fields in the page locale', async () => {
      const wrapper = await mountForm(mock, { locale: 'is-IS', submit: ok() });
      expect(wrapper.text()).toContain('Netfang');
      expect(wrapper.text()).toContain('Skilaboð');
    });

    it('is one h2, and the form is named by it or by the form name', async () => {
      const wrapper = await mountForm(mock);
      expect(wrapper.findAll('h1')).toHaveLength(0);
      expect(wrapper.findAll('h2')).toHaveLength(1);
      expect(wrapper.get('form').attributes('aria-label')).toBe('Contact');
      expect(wrapper.get('section').attributes('aria-labelledby')).toBe(
        wrapper.get('h2').attributes('id')
      );
    });

    it.each(['default', 'inline'] as const)(
      'renders the %s layout with no axe violations',
      async (variant) => {
        const wrapper = await mountForm({ ...mock, preset: variant });
        expect(await axe(wrapper.element)).toHaveNoViolations();
      }
    );

    it('the inline layout puts a single field and the button on one grid row', async () => {
      const wrapper = await mountForm({ ...mock, preset: 'inline', formKey: 'newsletter' });
      expect(wrapper.get('[data-part="fields"]').classes().join(' ')).toContain(
        'grid-cols-[1fr_auto]'
      );
      const fields = wrapper.get('[data-part="fields"]');
      expect(fields.find('button[type="submit"]').exists()).toBe(true);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    describe('the consent sentence of a subscribing form', () => {
      const SENTENCE =
        'I want to receive the newsletter from Northwind Goods. I can unsubscribe at any time.';

      it('shows it under the submit button, tied to it with aria-describedby', async () => {
        const wrapper = await mountForm({ ...mock, formKey: 'newsletter' });
        const sentence = wrapper.get('[data-part="consent-sentence"]');
        expect(sentence.text()).toBe(SENTENCE);
        expect(wrapper.get('button[type="submit"]').attributes('aria-describedby')).toBe(
          sentence.attributes('id')
        );
        expect(await axe(wrapper.element)).toHaveNoViolations();
      });

      it('shows it for the inline preset too, in the page’s locale', async () => {
        const wrapper = await mountForm(
          { ...mock, preset: 'inline', formKey: 'newsletter' },
          { locale: 'is-IS', submit: ok() }
        );
        expect(wrapper.get('[data-part="consent-sentence"]').text()).toBe(
          'Ég vil fá fréttabréf frá Northwind Goods. Ég get skráð mig úr áskrift hvenær sem er.'
        );
      });

      it('shows nothing on a form that does not subscribe', async () => {
        const wrapper = await mountForm(mock);
        expect(wrapper.find('[data-part="consent-sentence"]').exists()).toBe(false);
        expect(wrapper.get('button[type="submit"]').attributes('aria-describedby')).toBeUndefined();
      });
    });

    it('an inline form of several fields falls back to stacked fields and an actions row', async () => {
      const wrapper = await mountForm({ ...mock, preset: 'inline' });
      expect(wrapper.get('[data-part="fields"]').classes().join(' ')).not.toContain(
        'grid-cols-[1fr_auto]'
      );
      expect(wrapper.get('[data-part="actions"]').find('button[type="submit"]').exists()).toBe(
        true
      );
    });

    it('renders on a primary background with no axe violations', async () => {
      const wrapper = await mountForm({ ...mock, sectionBackground: 'primary' });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('says so, and renders no form, for a key the platform does not know', async () => {
      const wrapper = await mountForm({ ...bare, formKey: 'nope' });
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.get('[role="alert"]').text()).toBe(enUS.form.loadFailed);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('keyboard', () => {
    it('reaches each field in definition order, then the button; the honeypot is never tabbable', async () => {
      const wrapper = await mountForm(mock);
      const tabbable = [
        ...wrapper.element.querySelectorAll<HTMLElement>(
          'input, textarea, select, button, a[href], [tabindex]'
        ),
      ].filter((element) => {
        if (element.closest('[inert]')) return false;
        return element.getAttribute('tabindex') !== '-1';
      });
      const names = tabbable.map((element) => element.getAttribute('name') ?? element.tagName);
      expect(names.indexOf('name')).toBeLessThan(names.indexOf('email'));
      expect(names.indexOf('email')).toBeLessThan(names.indexOf('message'));
      expect(names.at(-1)).toBe('BUTTON');
      expect(names).not.toContain('website');
      const honeypot = wrapper.get('input[name="website"]');
      expect(honeypot.element.closest('[inert]')).not.toBeNull();
      expect(honeypot.element.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('moves focus to the first invalid field on a failed submit', async () => {
      const wrapper = await mountForm(mock);
      await submit(wrapper);
      expect(document.activeElement).toBe(wrapper.get('input[name="name"]').element);
    });

    it('moves focus to the status panel on success, which holds the confirmation', async () => {
      const wrapper = await mountForm(mock, { submit: ok() });
      await fillContact(wrapper);
      await submit(wrapper);
      const status = wrapper.get('[role="status"][tabindex="-1"]');
      expect(document.activeElement).toBe(status.element);
      expect(status.text()).toContain(enUS.form.successTitle);
      expect(status.text()).toContain('Thanks. We reply within one business day');
      expect(wrapper.find('form').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('field-keyed errors', () => {
    it('shows a failed local check under the field it names, and sends nothing', async () => {
      const send = ok();
      const wrapper = await mountForm(mock, { submit: send });
      await wrapper.find('input[name="email"]').setValue('not an email');
      await submit(wrapper);

      expect(send).not.toHaveBeenCalled();
      const email = wrapper.get('input[name="email"]');
      expect(email.attributes('aria-invalid')).toBe('true');
      const describedBy = email.attributes('aria-describedby') ?? '';
      expect(wrapper.get(`[id="${describedBy.split(' ')[0]}"]`).text()).toContain(
        'Enter a full email address'
      );
      expect(wrapper.get('input[name="name"]').attributes('aria-invalid')).toBe('true');
      expect(wrapper.get('textarea[name="message"]').attributes('aria-invalid')).toBe('true');
      expect(wrapper.get('input[name="topic"]').attributes('aria-invalid')).toBeUndefined();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('applies the definition’s own length rule', async () => {
      const wrapper = await mountForm(mock, { submit: ok() });
      await fillContact(wrapper);
      await wrapper.find('textarea[name="message"]').setValue('short');
      await submit(wrapper);
      expect(wrapper.text()).toContain('Use at least 10 characters.');
    });

    it('clears a field’s error as soon as that field changes, so a retry is not gated', async () => {
      const send = ok();
      const wrapper = await mountForm(mock, { submit: send });
      await submit(wrapper);
      expect(wrapper.get('input[name="name"]').attributes('aria-invalid')).toBe('true');
      await wrapper.find('input[name="name"]').setValue('Anna');
      expect(wrapper.get('input[name="name"]').attributes('aria-invalid')).toBeUndefined();
      await wrapper.find('input[name="email"]').setValue('anna@example.is');
      await wrapper.find('textarea[name="message"]').setValue('A long enough message.');
      await submit(wrapper);
      expect(send).toHaveBeenCalledOnce();
    });

    it('shows the platform’s 422 messages under the fields they are keyed by, verbatim', async () => {
      const send: Submit = vi.fn(async () => ({
        ok: false as const,
        reason: 'invalid' as const,
        errors: { email: ['That domain does not accept mail.'], message: ['Too spammy.'] },
        form: ['Check the highlighted answers.'],
      }));
      const wrapper = await mountForm(mock, { submit: send });
      await fillContact(wrapper);
      await submit(wrapper);

      expect(send).toHaveBeenCalledOnce();
      expect(wrapper.text()).toContain('That domain does not accept mail.');
      expect(wrapper.text()).toContain('Too spammy.');
      expect(wrapper.get('input[name="email"]').attributes('aria-invalid')).toBe('true');
      expect(wrapper.get('input[name="name"]').attributes('aria-invalid')).toBeUndefined();
      expect(wrapper.get('[role="alert"]').text()).toContain('Check the highlighted answers.');
      expect(document.activeElement).toBe(wrapper.get('input[name="email"]').element);
      expect(wrapper.find('form').exists()).toBe(true);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('keeps a message for a field this form does not render, instead of dropping it', async () => {
      const send: Submit = vi.fn(async () => ({
        ok: false as const,
        reason: 'invalid' as const,
        errors: { ghost: ['Unknown field.'] },
        form: [],
      }));
      const wrapper = await mountForm(mock, { submit: send });
      await fillContact(wrapper);
      await submit(wrapper);
      expect(wrapper.get('[role="alert"]').text()).toContain('Unknown field.');
    });

    it.each([
      ['rate-limited', enUS.form.rateLimited],
      ['too-large', enUS.form.tooLarge],
      ['unavailable', enUS.form.unavailable],
      ['unsupported', enUS.form.unsupported],
    ] as const)(
      'says what a %s refusal means, keeps the answers and allows a retry',
      async (reason, message) => {
        const send: Submit = vi.fn(async () => ({ ok: false as const, reason }));
        const wrapper = await mountForm(mock, { submit: send });
        await fillContact(wrapper);
        await submit(wrapper);

        expect(wrapper.get('[role="alert"]').text()).toContain(message);
        expect(wrapper.get('input[name="name"]').element).toHaveProperty(
          'value',
          'Anna Jónsdóttir'
        );
        await submit(wrapper);
        expect(send).toHaveBeenCalledTimes(2);
      }
    );
  });

  describe('submitting', () => {
    it('sends the values keyed by field id, with the honeypot only when something filled it', async () => {
      const send = ok();
      const wrapper = await mountForm(mock, { submit: send });
      await fillContact(wrapper);
      await submit(wrapper);
      expect(send).toHaveBeenCalledWith('contact', {
        values: {
          name: 'Anna Jónsdóttir',
          email: 'anna@example.is',
          topic: '',
          orderNumber: '',
          message: 'Where is my order, please?',
        },
      });
    });

    it('sends what a bot typed into the honeypot as hp', async () => {
      const send = ok();
      const wrapper = await mountForm(mock, { submit: send });
      await fillContact(wrapper);
      await wrapper.find('input[name="website"]').setValue('http://spam.example');
      await submit(wrapper);
      expect(send).toHaveBeenCalledWith(
        'contact',
        expect.objectContaining({ hp: 'http://spam.example' })
      );
    });

    it('ignores repeat submits while one is in flight', async () => {
      let release!: (result: StorefrontFormSubmitResult) => void;
      const send: Submit = vi.fn(
        () =>
          new Promise<StorefrontFormSubmitResult>((resolve) => {
            release = resolve;
          })
      );
      const wrapper = await mountForm(mock, { submit: send });
      await fillContact(wrapper);
      await wrapper.find('form').trigger('submit');
      await wrapper.find('form').trigger('submit');
      expect(send).toHaveBeenCalledOnce();
      release({ ok: true, pending: false });
      await flushPromises();
      expect(wrapper.find('form').exists()).toBe(false);
    });

    it('a pending (double opt-in) success tells the visitor to check their inbox', async () => {
      const wrapper = await mountForm(
        { ...mock, preset: 'inline', formKey: 'newsletter' },
        { submit: ok(true) }
      );
      await wrapper.find('input[name="email"]').setValue('anna@example.is');
      await submit(wrapper);
      const status = wrapper.get('[role="status"][tabindex="-1"]');
      expect(status.text()).toContain(enUS.form.successTitlePending);
      expect(status.text()).toContain('Check your inbox to confirm your subscription.');
    });

    it('the block’s own success title wins over the default', async () => {
      const wrapper = await mountForm(
        { ...mock, successTitle: 'Message received' },
        { submit: ok() }
      );
      await fillContact(wrapper);
      await submit(wrapper);
      expect(wrapper.get('[role="status"]').text()).toContain('Message received');
    });

    it('offers another message after a success and focuses the first field', async () => {
      const wrapper = await mountForm(mock, { submit: ok() });
      await fillContact(wrapper);
      await submit(wrapper);
      await wrapper.get('[role="status"] button').trigger('click');
      await flushPromises();
      expect(wrapper.find('form').exists()).toBe(true);
      expect(wrapper.get('input[name="name"]').element).toHaveProperty('value', '');
      expect(document.activeElement).toBe(wrapper.get('input[name="name"]').element);
    });
  });

  describe('redirect', () => {
    it('sends the visitor to the merchant’s redirect instead of showing the panel', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign });
      const wrapper = await mountForm(mock, { submit: ok(), successRedirect: '/thank-you' });
      await fillContact(wrapper);
      await submit(wrapper);
      expect(assign).toHaveBeenCalledWith('/thank-you');
    });

    it('never follows an executable redirect, and shows the confirmation instead', async () => {
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign });
      const wrapper = await mountForm(mock, {
        submit: ok(),
        successRedirect: 'javascript:alert(1)',
      });
      await fillContact(wrapper);
      await submit(wrapper);
      expect(assign).not.toHaveBeenCalled();
      expect(wrapper.get('[role="status"]').text()).toContain(enUS.form.successTitle);
    });
  });

  describe('turnstile', () => {
    it('loads nothing third-party when the form has no site key', async () => {
      await mountForm(mock);
      expect(document.head.querySelector('script[src*="turnstile"]')).toBeNull();
    });

    it('renders the widget under the fields and refuses to send before the check is passed', async () => {
      let callback: ((token: string) => void) | undefined;
      const render = vi.fn((_el: HTMLElement, options: { callback: (token: string) => void }) => {
        callback = options.callback;
        return 'widget-1';
      });
      const reset = vi.fn();
      (window as unknown as { turnstile: unknown }).turnstile = { render, reset, remove: vi.fn() };
      const send = ok();
      const wrapper = await mountForm(mock, {
        submit: send,
        turnstileSiteKey: '1x00000000000000000000AA',
      });
      await flushPromises();

      expect(render).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ sitekey: '1x00000000000000000000AA' })
      );
      await fillContact(wrapper);
      await submit(wrapper);
      expect(send).not.toHaveBeenCalled();
      expect(wrapper.get('[role="alert"]').text()).toContain(enUS.form.turnstileRequired);

      callback?.('token-123');
      await flushPromises();
      await submit(wrapper);
      expect(send).toHaveBeenCalledWith(
        'contact',
        expect.objectContaining({ turnstileToken: 'token-123' })
      );
    });

    it('resets the single-use token after a refusal', async () => {
      let callback: ((token: string) => void) | undefined;
      const reset = vi.fn();
      (window as unknown as { turnstile: unknown }).turnstile = {
        render: (_el: HTMLElement, options: { callback: (token: string) => void }) => {
          callback = options.callback;
          return 'w';
        },
        reset,
        remove: vi.fn(),
      };
      const send: Submit = vi.fn(async () => ({
        ok: false as const,
        reason: 'unavailable' as const,
      }));
      const wrapper = await mountForm(mock, { submit: send, turnstileSiteKey: 'key' });
      await flushPromises();
      callback?.('t1');
      await fillContact(wrapper);
      await submit(wrapper);
      expect(reset).toHaveBeenCalledOnce();
    });
  });

  describe('editing', () => {
    it('is empty-safe: a block with no form key renders without crashing', async () => {
      const wrapper = await mountForm({ preset: 'default', formKey: '', heading: 'Hello' });
      expect(wrapper.find('form').exists()).toBe(false);
    });
  });
});
