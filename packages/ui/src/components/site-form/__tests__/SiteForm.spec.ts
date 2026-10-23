import type {
  EldraFormDefinition,
  EldraFormSubmitInput,
  EldraFormSubmitResult,
} from '@eldrajs/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { isIS } from '../../../messages/is-IS';
import { enUS } from '../../../messages/en-US';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import SiteForm from '../SiteForm.vue';
import {
  resetTurnstileLoaderForTests,
  TURNSTILE_SCRIPT_SRC,
  type TurnstileApi,
} from '../turnstile';
import type { SiteFormClient } from '../types';

const EVERY_TYPE: EldraFormDefinition = {
  key: 'everything',
  name: 'Every field',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'en-US': 'Name', 'is-IS': 'Nafn' } },
    { id: 'email', type: 'email', required: true, label: { 'en-US': 'Email', 'is-IS': 'Netfang' } },
    { id: 'phone', type: 'phone', required: false, label: { 'en-US': 'Phone', 'is-IS': 'Sími' } },
    { id: 'guests', type: 'number', required: false, label: { 'en-US': 'Guests' } },
    { id: 'site', type: 'url', required: false, label: { 'en-US': 'Website' } },
    {
      id: 'topic',
      type: 'select',
      required: true,
      label: { 'en-US': 'Topic', 'is-IS': 'Efni' },
      options: [
        { value: 'sales', label: { 'en-US': 'Sales', 'is-IS': 'Sala' } },
        { value: 'support', label: { 'en-US': 'Support', 'is-IS': 'Aðstoð' } },
      ],
    },
    {
      id: 'note',
      type: 'textarea',
      required: false,
      label: { 'en-US': 'Message', 'is-IS': 'Skilaboð' },
      validation: { maxLength: 400 },
    },
    { id: 'news', type: 'checkbox', required: false, label: { 'en-US': 'Send me news' } },
    {
      id: 'terms',
      type: 'consent',
      required: true,
      label: { 'en-US': 'I accept the terms', 'is-IS': 'Ég samþykki skilmálana' },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: { 'en-US': 'We will be in touch.', 'is-IS': 'Við höfum samband.' } },
  kinds: ['store', 'notify'],
};

const CONTACT: EldraFormDefinition = {
  key: 'contact',
  name: 'Contact',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'en-US': 'Name' } },
    { id: 'email', type: 'email', required: true, label: { 'en-US': 'Email' } },
    { id: 'note', type: 'textarea', required: false, label: { 'en-US': 'Message' } },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: { 'en-US': 'Thanks, we will reply soon.' } },
  kinds: ['store', 'notify'],
};

const NEWSLETTER: EldraFormDefinition = {
  key: 'newsletter',
  name: 'Newsletter',
  fields: [
    {
      id: 'email',
      type: 'email',
      required: true,
      label: { 'en-US': 'Email' },
      placeholder: { 'en-US': 'you@example.com' },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: {} },
  kinds: ['store', 'subscribe'],
  consentText: { 'en-US': 'I want the newsletter from Northwind. I can unsubscribe at any time.' },
};

type Submit = (key: string, input: EldraFormSubmitInput) => Promise<EldraFormSubmitResult>;

function fakeClient(submit: Submit = async () => ({ status: 'ok', pending: false })) {
  const forms = {
    get: vi.fn(async (_key: string): Promise<EldraFormDefinition> => CONTACT),
    submit: vi.fn(submit),
  };
  return { client: { forms } satisfies SiteFormClient, forms };
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Web Studio request failed with ${status}`), { status });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mountForm(props: Record<string, unknown>) {
  return mountWith(SiteForm, {
    props: { locale: 'en-US', pagePath: '/contact', ...props } as never,
  });
}

const byLabel = (wrapper: ReturnType<typeof mountForm>, text: string): HTMLElement => {
  const ownText = (element: Element): string =>
    [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim();
  const label = [...wrapper.element.querySelectorAll('label')].find(
    (element) => ownText(element) === text
  );
  const id = label?.getAttribute('for');
  const control = id ? document.getElementById(id) : null;
  if (!control) throw new Error(`no control labelled "${text}"`);
  return control;
};

async function type(wrapper: ReturnType<typeof mountForm>, label: string, value: string) {
  const control = byLabel(wrapper, label) as HTMLInputElement;
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function submit(wrapper: ReturnType<typeof mountForm>): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  delete (window as { turnstile?: TurnstileApi }).turnstile;
  resetTurnstileLoaderForTests();
  vi.restoreAllMocks();
});

describe('SiteForm: drawing a definition', () => {
  it('draws every field type with its own control', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: EVERY_TYPE, client });

    expect(byLabel(wrapper, 'Name').getAttribute('type')).toBe('text');
    expect(byLabel(wrapper, 'Name').getAttribute('autocomplete')).toBe('name');
    expect(byLabel(wrapper, 'Email').getAttribute('type')).toBe('email');
    expect(byLabel(wrapper, 'Email').getAttribute('autocomplete')).toBe('email');
    expect(byLabel(wrapper, 'Phone').getAttribute('type')).toBe('tel');
    expect(byLabel(wrapper, 'Guests').getAttribute('type')).toBe('text');
    expect(byLabel(wrapper, 'Guests').getAttribute('inputmode')).toBe('decimal');
    expect(byLabel(wrapper, 'Website').getAttribute('type')).toBe('url');
    expect(byLabel(wrapper, 'Message').tagName).toBe('TEXTAREA');

    const topic = wrapper.find('[data-part="trigger"]');
    expect(topic.attributes('role')).toBe('combobox');
    expect(wrapper.text()).toContain('Topic');

    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes.map((box) => box.attributes('name'))).toEqual(['news', 'terms']);
    expect(wrapper.text()).toContain('I accept the terms');
    expect(boxes[1]!.attributes('required')).toBeDefined();
  });

  it('labels every field in the visitor’s locale and says which are required', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: EVERY_TYPE, client, locale: 'is-IS', messages: isIS });

    expect(byLabel(wrapper, 'Nafn').hasAttribute('required')).toBe(true);
    expect(wrapper.text()).toContain('Sími(valfrjálst)');
    expect(wrapper.text()).toContain('Ég samþykki skilmálana');
    expect(wrapper.find('button[type="submit"]').text()).toBe('Senda');
  });

  it('renders the honeypot the definition names, out of reach of people', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: CONTACT, client });
    const honeypot = wrapper.find('input[name="website"]');

    expect(honeypot.exists()).toBe(true);
    expect(honeypot.attributes('tabindex')).toBe('-1');
    expect(honeypot.attributes('autocomplete')).toBe('off');
    const box = honeypot.element.parentElement!;
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(box.hasAttribute('inert')).toBe(true);
  });

  it('shows a subscribing form’s consent sentence under the button, describing it', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: NEWSLETTER, client });
    const sentence = wrapper.find('[data-part="consentText"]');

    expect(sentence.text()).toBe(
      'I want the newsletter from Northwind. I can unsubscribe at any time.'
    );
    expect(wrapper.find('button[type="submit"]').attributes('aria-describedby')).toBe(
      sentence.attributes('id')
    );
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it('puts a one-field form on one row only when asked for inline, and only for a text-like field', () => {
    const { client } = fakeClient();
    const inline = mountForm({ definition: NEWSLETTER, client, layout: 'inline' });
    expect(inline.find('form').classes()).toContain('flex');

    const fallsBack = mountForm({ definition: CONTACT, client, layout: 'inline' });
    expect(fallsBack.find('form').classes()).toContain('grid');
  });

  it('has no axe violations, empty or with errors', async () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: EVERY_TYPE, client });
    expect(await axe(wrapper.element)).toHaveNoViolations();

    await submit(wrapper);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('SiteForm: checks before sending', () => {
  it('marks every failing field, focuses the first and sends nothing', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: EVERY_TYPE, client });
    await type(wrapper, 'Email', 'anna@');
    await submit(wrapper);

    expect(forms.submit).not.toHaveBeenCalled();
    const name = byLabel(wrapper, 'Name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    const errorId = name.getAttribute('aria-describedby')!.split(' ')[0]!;
    expect(document.getElementById(errorId)?.textContent).toContain(enUS.formRequired);
    expect(document.activeElement).toBe(name);
    expect(wrapper.text()).toContain(enUS.formInvalidEmail);

    const terms = wrapper.findAll('input[type="checkbox"]')[1]!;
    expect(terms.attributes('aria-invalid')).toBe('true');
    expect(document.getElementById(terms.attributes('aria-describedby')!)?.textContent).toContain(
      enUS.formRequiredCheckbox
    );
  });

  it('clears a field’s message as soon as its value changes', async () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: CONTACT, client });
    await submit(wrapper);
    expect(byLabel(wrapper, 'Name').getAttribute('aria-invalid')).toBe('true');

    await type(wrapper, 'Name', 'Anna');
    expect(byLabel(wrapper, 'Name').hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('SiteForm: sending', () => {
  async function fillContact(wrapper: ReturnType<typeof mountForm>) {
    await type(wrapper, 'Name', 'Anna');
    await type(wrapper, 'Email', 'anna@example.is');
  }

  it('posts every value with the locale and the page, and no honeypot when it is empty', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);

    expect(forms.submit).toHaveBeenCalledWith('contact', {
      values: { name: 'Anna', email: 'anna@example.is', note: '' },
      locale: 'en-US',
      pagePath: '/contact',
    });
  });

  it('sends what a bot typed into the honeypot as hp', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await wrapper.find('input[name="website"]').setValue('https://spam.example');
    await submit(wrapper);

    expect(forms.submit.mock.calls[0]![1]).toMatchObject({ hp: 'https://spam.example' });
  });

  it('sends the chosen option of a select and the state of each box', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: EVERY_TYPE, client });
    await type(wrapper, 'Name', 'Anna');
    await type(wrapper, 'Email', 'anna@example.is');
    const trigger = wrapper.find('[data-part="trigger"]');
    await trigger.trigger('pointerdown');
    await trigger.trigger('click');
    await flush();
    const support = panelOf(trigger.element)
      .findAll('[data-part="option"]')
      .find((option) => option.text().includes('Support'))!;
    await support.trigger('click');
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);
    await submit(wrapper);

    expect(forms.submit.mock.calls[0]![1].values).toMatchObject({
      topic: 'support',
      news: false,
      terms: true,
    });
  });

  it('replaces the form with the success message and moves focus to it', async () => {
    const { client } = fakeClient();
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);

    const panel = wrapper.find('[data-part="success"]');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(panel.attributes('role')).toBe('status');
    expect(panel.text()).toContain(enUS.formSuccessTitle);
    expect(panel.text()).toContain('Thanks, we will reply soon.');
    expect(document.activeElement).toBe(panel.element);
    expect(wrapper.emitted('success')).toEqual([[{ pending: false, redirect: null }]]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('tells a subscriber to confirm from their inbox', async () => {
    const { client } = fakeClient(async () => ({ status: 'ok', pending: true }));
    const wrapper = mountForm({ definition: NEWSLETTER, client });
    await type(wrapper, 'Email', 'anna@example.is');
    await submit(wrapper);

    const panel = wrapper.find('[data-part="success"]');
    expect(panel.text()).toContain(enUS.formPendingTitle);
    expect(panel.text()).toContain(enUS.formPendingMessage);
  });

  it('goes to the merchant’s redirect instead, through navigate', async () => {
    const { client } = fakeClient();
    const navigate = vi.fn();
    const definition = { ...CONTACT, success: { message: {}, redirect: { 'en-US': '/takk' } } };
    const wrapper = mountForm({ definition, client, navigate });
    await fillContact(wrapper);
    await submit(wrapper);

    expect(navigate).toHaveBeenCalledWith('/takk');
  });

  it('loads an absolute redirect itself, keeping navigate for a site path', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    const { client } = fakeClient();
    const navigate = vi.fn();
    const definition = {
      ...CONTACT,
      success: { message: {}, redirect: { 'en-US': 'https://shop.example/takk' } },
    };
    const wrapper = mountForm({ definition, client, navigate });
    await fillContact(wrapper);
    await submit(wrapper);

    expect(navigate).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('https://shop.example/takk');
  });

  it('shows the platform’s field messages next to their fields and the rest above them', async () => {
    const { client } = fakeClient(async () => ({
      status: 'invalid',
      errors: { email: ['Sláðu inn gilt netfang.'], retired: ['Gamall reitur.'] },
      form: ['Ruslvörnin mistókst. Reyndu aftur.'],
    }));
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);

    const email = byLabel(wrapper, 'Email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const errorId = email.getAttribute('aria-describedby')!.split(' ')[0]!;
    expect(document.getElementById(errorId)?.textContent).toContain('Sláðu inn gilt netfang.');
    expect(document.activeElement).toBe(email);

    const summary = wrapper.find('[data-part="errorSummary"]');
    expect(summary.attributes('role')).toBe('alert');
    expect(summary.text()).toContain('Ruslvörnin mistókst. Reyndu aftur.');
    expect(summary.text()).toContain('Gamall reitur.');
    expect(wrapper.emitted('error')).toEqual([[{ reason: 'refused' }]]);
  });

  it('says something even when a refusal carries no message', async () => {
    const { client } = fakeClient(async () => ({ status: 'invalid', errors: {}, form: [] }));
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);

    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(enUS.formRefused);
  });

  it.each([
    [429, enUS.formRateLimited, 'rate-limited'],
    [413, enUS.formTooLarge, 'too-large'],
    [500, enUS.formUnavailable, 'unavailable'],
  ] as const)('shows a %i above the fields', async (status, message, reason) => {
    const error = httpError(status);
    const { client } = fakeClient(async () => {
      throw error;
    });
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);

    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(message);
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.emitted('error')).toEqual([[{ reason, cause: error }]]);
  });

  it('shows a network failure and lets the visitor try again', async () => {
    let attempt = 0;
    const { client, forms } = fakeClient(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('Failed to fetch');
      return { status: 'ok', pending: false };
    });
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);
    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(enUS.formUnavailable);

    await submit(wrapper);
    expect(forms.submit).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-part="success"]').exists()).toBe(true);
  });

  it('marks the button busy while sending and ignores a second submit', async () => {
    let release: (value: EldraFormSubmitResult) => void = () => {};
    const { client, forms } = fakeClient(
      () => new Promise<EldraFormSubmitResult>((resolve) => (release = resolve))
    );
    const wrapper = mountForm({ definition: CONTACT, client });
    await fillContact(wrapper);
    await submit(wrapper);
    expect(wrapper.find('button[type="submit"]').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('button[type="submit"]').attributes('aria-label')).toBe(
      enUS.formSubmitting
    );

    await submit(wrapper);
    expect(forms.submit).toHaveBeenCalledTimes(1);
    release({ status: 'ok', pending: false });
    await flush();
    expect(wrapper.find('[data-part="success"]').exists()).toBe(true);
  });

  it('defaults the page to the current path', async () => {
    window.history.replaceState(null, '', '/samband');
    const { client, forms } = fakeClient();
    const wrapper = mountWith(SiteForm, {
      props: { definition: CONTACT, client, locale: 'is-IS' },
    });
    await fillContact(wrapper as never);
    await submit(wrapper as never);

    expect(forms.submit.mock.calls[0]![1]).toMatchObject({ pagePath: '/samband', locale: 'is-IS' });
  });
});

describe('SiteForm: Turnstile', () => {
  const WITH_TURNSTILE = { ...CONTACT, turnstileSiteKey: '0x4AAAAAAA-site-key' };

  function stubTurnstile() {
    const options: Array<{ callback: (token: string) => void; sitekey: string }> = [];
    const api = {
      render: vi.fn((_element: HTMLElement, rendered: (typeof options)[number]) => {
        options.push(rendered);
        return 'widget-1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    (window as { turnstile?: TurnstileApi }).turnstile = api as unknown as TurnstileApi;
    return { api, options };
  }

  let appended: HTMLScriptElement[];
  beforeEach(() => {
    appended = [];
    const append = document.head.append.bind(document.head);
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLScriptElement) appended.push(node);
        else append(node);
      }
    });
  });

  it('loads nothing third-party for a form without a site key', async () => {
    const { client } = fakeClient();
    mountForm({ definition: CONTACT, client });
    await flush();

    expect(appended).toEqual([]);
  });

  it('loads Cloudflare’s script once the form asks for it', async () => {
    const { client } = fakeClient();
    mountForm({ definition: WITH_TURNSTILE, client });
    await flush();

    expect(appended.map((script) => script.src)).toEqual([TURNSTILE_SCRIPT_SRC]);
  });

  it('renders the widget with the site key and sends its token', async () => {
    const { api, options } = stubTurnstile();
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: WITH_TURNSTILE, client });
    await flush();

    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.render.mock.calls[0]![0]).toBe(wrapper.find('[data-part="turnstile"]').element);
    expect(options[0]!.sitekey).toBe('0x4AAAAAAA-site-key');

    await type(wrapper, 'Name', 'Anna');
    await type(wrapper, 'Email', 'anna@example.is');
    await submit(wrapper);
    expect(forms.submit).not.toHaveBeenCalled();
    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(enUS.formSpamCheckRequired);

    options[0]!.callback('turnstile-token');
    await submit(wrapper);
    expect(forms.submit.mock.calls[0]![1]).toMatchObject({ turnstileToken: 'turnstile-token' });
  });

  it('asks for a fresh token after a refused submission', async () => {
    const { api, options } = stubTurnstile();
    const { client } = fakeClient(async () => ({
      status: 'invalid',
      errors: {},
      form: ['The spam check failed. Try again.'],
    }));
    const wrapper = mountForm({ definition: WITH_TURNSTILE, client });
    await flush();
    await type(wrapper, 'Name', 'Anna');
    await type(wrapper, 'Email', 'anna@example.is');
    options[0]!.callback('spent-token');
    await submit(wrapper);

    expect(api.reset).toHaveBeenCalledWith('widget-1');
    await submit(wrapper);
    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(enUS.formSpamCheckRequired);
  });

  it('says so when the script cannot load', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ definition: WITH_TURNSTILE, client });
    await flush();
    appended[0]!.dispatchEvent(new Event('error'));
    appended[0]!.onerror?.(new Event('error'));
    await flush();
    await type(wrapper, 'Name', 'Anna');
    await type(wrapper, 'Email', 'anna@example.is');
    await submit(wrapper);

    expect(forms.submit).not.toHaveBeenCalled();
    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(enUS.formSpamCheckFailed);
  });
});

describe('SiteForm: reading by key', () => {
  it('reads the definition in the browser when only a key is given', async () => {
    const { client, forms } = fakeClient();
    const wrapper = mountForm({ formKey: 'contact', client });
    expect(wrapper.find('[data-part="notice"]').text()).toBe(enUS.formLoading);

    await flush();
    expect(forms.get).toHaveBeenCalledWith('contact');
    expect(byLabel(wrapper, 'Name')).toBeTruthy();
  });

  it('says the form cannot be shown when the read fails', async () => {
    const { client, forms } = fakeClient();
    forms.get.mockRejectedValueOnce(httpError(404));
    const wrapper = mountForm({ formKey: 'missing', client });
    await flush();

    const notice = wrapper.find('[data-part="notice"]');
    expect(notice.text()).toBe(enUS.formLoadFailed);
    expect(notice.attributes('role')).toBe('alert');
  });

  it('refuses a definition with a field type it cannot draw', () => {
    const { client } = fakeClient();
    const definition = {
      ...CONTACT,
      fields: [{ id: 'when', type: 'date', required: true, label: { 'en-US': 'When' } }],
    } as unknown as EldraFormDefinition;
    const wrapper = mountForm({ definition, client });

    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('[data-part="notice"]').text()).toBe(enUS.formLoadFailed);
  });
});

describe('SiteForm: customising', () => {
  it('merges classes onto the parts and the controls inside', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({
      definition: CONTACT,
      client,
      classes: {
        root: 'rounded-xl',
        label: 'text-sm',
        control: 'px-3.5',
        submit: 'w-full',
        requiredMark: 'hidden',
      },
    });

    expect(wrapper.find('[data-part="root"]').classes()).toContain('rounded-xl');
    expect(wrapper.find('label').classes()).toContain('text-sm');
    expect(byLabel(wrapper, 'Name').classList.contains('px-3.5')).toBe(true);
    expect(wrapper.find('button[type="submit"]').classes()).toContain('w-full');
    expect(wrapper.find('[data-part="requiredMark"]').classes()).toContain('hidden');
  });

  it('takes a submit slot and a success slot', async () => {
    const { client } = fakeClient();
    const wrapper = mountWith(SiteForm, {
      props: { definition: CONTACT, client, locale: 'en-US', pagePath: '/' },
      slots: {
        submit: `<template #submit="{ label }"><button type="submit" class="mine">{{ label }}!</button></template>`,
        success: `<template #success="{ message }"><p class="done">{{ message }}</p></template>`,
      },
    });
    expect(wrapper.find('button.mine').text()).toBe('Send!');

    await type(wrapper as never, 'Name', 'Anna');
    await type(wrapper as never, 'Email', 'anna@example.is');
    await submit(wrapper as never);
    expect(wrapper.find('p.done').text()).toBe('Thanks, we will reply soon.');
  });

  it('hands a custom submit control the consent sentence to be described by', () => {
    const { client } = fakeClient();
    const wrapper = mountWith(SiteForm, {
      props: { definition: NEWSLETTER, client, locale: 'en-US', pagePath: '/' },
      slots: {
        submit: `<template #submit="{ label, describedBy }"><button type="submit" :aria-describedby="describedBy">{{ label }}</button></template>`,
      },
    });
    const sentence = wrapper.find('[data-part="consentText"]');
    expect(wrapper.find('button[type="submit"]').attributes('aria-describedby')).toBe(
      sentence.attributes('id')
    );
  });

  it('puts focus on the first field when the success slot sends another', async () => {
    const { client } = fakeClient();
    const wrapper = mountWith(SiteForm, {
      props: { definition: CONTACT, client, locale: 'en-US', pagePath: '/' },
      slots: {
        success: `<template #success="{ reset }"><button type="button" class="again" @click="reset">Again</button></template>`,
      },
    });
    await type(wrapper as never, 'Name', 'Anna');
    await type(wrapper as never, 'Email', 'anna@example.is');
    await submit(wrapper as never);
    await wrapper.find('button.again').trigger('click');
    await flush();

    expect(document.activeElement).toBe(byLabel(wrapper as never, 'Name'));
    expect((byLabel(wrapper as never, 'Name') as HTMLInputElement).value).toBe('');
  });

  it('passes its messages to the controls inside it', () => {
    const { client } = fakeClient();
    const wrapper = mountForm({
      definition: CONTACT,
      client,
      messages: { optional: 'not needed', formSubmit: 'Go' },
    });

    expect(wrapper.text()).toContain('(not needed)');
    expect(wrapper.find('button[type="submit"]').text()).toBe('Go');
  });
});
