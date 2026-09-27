// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { enUS } from '../../../app/i18n/en-US';

/**
 * Icons (`map-pin`/`clock`/`phone`/`mail`/`circle-check`) resolve through `EldraIcon`
 * (Tabler-by-name), which under Nuxt calls `/api/eldra-icon`; outside Nuxt this needs an injected
 * `ICON_FETCHER_KEY` (see `feature-grid`/`footer`'s own specs for the same pattern) — `stubFetcher`
 * reads the real SVGs synchronously via `tablerIconSvg`, network-free.
 */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

const merged = { ...mock, ...preview };

function mountContact(data: Record<string, unknown>, options: { failForms?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  return mount(Block, {
    ...base,
    // Real focus tracking (`document.activeElement`) needs the tree connected to the document —
    // jsdom does not reliably track focus on a detached mount. Auto-unmount (`test/setup.ts`)
    // removes this from `document.body` again after every test.
    attachTo: document.body,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [ICON_FETCHER_KEY]: stubFetcher,
        ...(options.failForms
          ? { [STOREFRONT_KEY]: createDemoStorefront({ failForms: true }) }
          : {}),
      },
    },
  });
}

function fillValid(wrapper: ReturnType<typeof mountContact>) {
  const name = wrapper.find('input[autocomplete="name"]');
  const email = wrapper.find('input[type="email"]');
  const message = wrapper.find('textarea');
  return { name, email, message };
}

async function submitValid(wrapper: ReturnType<typeof mountContact>) {
  const { name, email, message } = fillValid(wrapper);
  await name.setValue('Hannah Reyes');
  await email.setValue('hannah@example.com');
  await message.setValue('Do you carry the moss glaze in stock right now?');
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

/** The Topic `Select` trigger (its `role="combobox"` button, in DOM order the first — and only —
 * combobox this block renders). */
function selectTrigger(wrapper: ReturnType<typeof mountContact>) {
  return wrapper.findAll('[role="combobox"]').filter((c) => c.element.tagName === 'BUTTON')[0]!;
}

describe('contact block', () => {
  it('renders the merged (mock + preview) split default with no axe violations', async () => {
    const wrapper = mountContact(merged);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.formTitle);
    expect(wrapper.find('img').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json content (no map — media is absent) with no axe violations', async () => {
    const wrapper = mountContact({ ...mock });
    expect(wrapper.find('section').exists()).toBe(true);
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the details-only variant renders details beside the map with no axe violations', async () => {
    const wrapper = mountContact({ ...merged, variant: 'details-only' });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain(enUS.contact.addressLabel);
    expect(wrapper.find('img').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the form-only variant renders only the heading, intro and form in a narrow container, with no axe violations', async () => {
    const wrapper = mountContact({ ...merged, variant: 'form-only' });
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).not.toContain(enUS.contact.addressLabel);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the block root is the Section component, a width container for its own @content:/@tablet: breakpoints', () => {
    const wrapper = mountContact(merged);
    const section = wrapper.find('section');
    expect(section.exists()).toBe(true);
    expect(section.classes()).toContain('@container');
  });

  it('form-only with hideHeading keeps the h2 in the outline but hides it visually', () => {
    const wrapper = mountContact({ ...mock, variant: 'form-only', hideHeading: true });
    const heading = wrapper.find('h2');
    expect(heading.exists()).toBe(true);
    expect(heading.text()).toBe(mock.heading);
    expect(heading.classes()).toContain('sr-only');
  });

  it('every field has a visible, programmatically tied label, and the optional one says "(optional)"', () => {
    const wrapper = mountContact(mock);
    const fields: Array<[string, string]> = [
      ['input[autocomplete="name"]', enUS.contact.nameLabel],
      ['input[type="email"]', enUS.contact.emailFieldLabel],
      ['input[name="orderNumber"]', enUS.contact.orderNumberLabel],
      ['textarea', enUS.contact.messageLabel],
    ];
    for (const [selector, labelText] of fields) {
      const control = wrapper.find(selector);
      expect(control.exists()).toBe(true);
      const id = control.attributes('id');
      expect(id).toBeTruthy();
      const label = wrapper.find(`label[for="${id}"]`);
      expect(label.exists()).toBe(true);
      expect(label.text()).toContain(labelText);
    }
    const orderLabel = wrapper.find(
      `label[for="${wrapper.find('input[name="orderNumber"]').attributes('id')}"]`
    );
    expect(orderLabel.text()).toContain('optional');
  });

  it('an invalid (empty) submit focuses the error summary, marks every invalid field, and keeps entered values', async () => {
    const wrapper = mountContact(mock);
    const { name } = fillValid(wrapper);
    // Only the name is filled in — email and message stay invalid.
    await name.setValue('Priya');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const summary = wrapper.find('[role="alert"]');
    expect(summary.exists()).toBe(true);
    expect(document.activeElement).toBe(summary.find('[tabindex="-1"]').element);

    const emailInput = wrapper.find('input[type="email"]');
    expect(emailInput.attributes('aria-invalid')).toBe('true');
    const describedBy = emailInput.attributes('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(wrapper.find(`#${describedBy?.split(' ')[0]}`).text()).toContain(
      enUS.contact.emailInvalidError
    );

    const messageField = wrapper.find('textarea');
    expect(messageField.attributes('aria-invalid')).toBe('true');
    expect(messageField.attributes('aria-describedby')).toBeTruthy();

    // The name field the visitor filled in correctly is not marked invalid, and keeps its value.
    expect(name.attributes('aria-invalid')).toBeUndefined();
    expect((name.element as HTMLInputElement).value).toBe('Priya');
  });

  it('each error summary link moves focus to its own field', async () => {
    const wrapper = mountContact(mock);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const emailInput = wrapper.find('input[type="email"]');
    const emailLink = wrapper
      .findAll('[role="alert"] a')
      .find((a) => a.text() === enUS.contact.emailFieldLabel);
    expect(emailLink).toBeTruthy();
    await emailLink!.trigger('click');
    expect(document.activeElement).toBe(emailInput.element);

    const messageField = wrapper.find('textarea');
    const messageLink = wrapper
      .findAll('[role="alert"] a')
      .find((a) => a.text() === enUS.contact.messageLabel);
    expect(messageLink).toBeTruthy();
    await messageLink!.trigger('click');
    expect(document.activeElement).toBe(messageField.element);
  });

  it('a valid submit calls forms.sendMessage and shows a role="status" success panel that receives focus, replacing the form', async () => {
    const wrapper = mountContact(mock);
    await submitValid(wrapper);

    expect(wrapper.find('form').exists()).toBe(false);
    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain('Hannah');
    expect(status.text()).toContain('hannah@example.com');
    expect(document.activeElement).toBe(status.element);
  });

  it('"Send another message" restores an empty form and focuses the Name field', async () => {
    const wrapper = mountContact(mock);
    await submitValid(wrapper);

    const sendAnother = wrapper
      .findAll('button')
      .find((b) => b.text() === enUS.contact.sendAnother);
    expect(sendAnother).toBeTruthy();
    await sendAnother!.trigger('click');
    await flushPromises();

    expect(wrapper.find('form').exists()).toBe(true);
    const name = wrapper.find('input[autocomplete="name"]');
    expect((name.element as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(name.element);
  });

  it('a server failure (forms.sendMessage ok:false) shows the summary again and keeps the form', async () => {
    const wrapper = mountContact(mock, { failForms: true });
    await submitValid(wrapper);

    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toContain(mock.recipient);
  });

  it.each(['Enter', ' ', 'ArrowDown'])(
    'the Topic Select opens from the keyboard with %j',
    async (key) => {
      const wrapper = mountContact(mock);
      const trigger = selectTrigger(wrapper);
      trigger.element.focus();
      expect(trigger.attributes('aria-expanded')).toBe('false');

      await trigger.trigger('keydown', { key });
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(document.querySelector('[role="listbox"]')).toBeTruthy();
    }
  );

  it('phone and email detail rows render as tel: and mailto: links built from the field values', () => {
    const wrapper = mountContact(mock);
    const tel = wrapper.find('a[href^="tel:"]');
    expect(tel.exists()).toBe(true);
    expect(tel.attributes('href')).toBe(`tel:${mock.phone.replace(/[^\d+]/g, '')}`);
    expect(wrapper.find(`a[href="mailto:${mock.email}"]`).exists()).toBe(true);
  });

  it('renders the phone as plain text, not an inert href="tel:", when it strips down to no digits', () => {
    // `new URL('tel:')` parses without throwing (an empty path is valid for a non-special
    // scheme), so `safeHref` alone would still accept it — a phone value with no digits at all
    // (or only a bare "+") must never reach `Link`/`safeHref` as `tel:${...}` in the first place.
    // Mutation check (manual): reverting `telHref` to `safeHref(\`tel:${phone.replace(...)}\`)`
    // with no digit guard makes this test fail with a clickable, dead `href="tel:"` link.
    const wrapper = mountContact({ ...mock, phone: 'Call the studio' });
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
    expect(wrapper.find('a[href="tel:"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Call the studio');
  });

  it('renders the phone as plain text when stripping leaves only a bare "+" with no digit', () => {
    const wrapper = mountContact({ ...mock, phone: '+' });
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('+');
  });

  it('the Topic Select opens with ArrowDown, moves with arrows, commits with Enter, and closes on Esc returning focus to the trigger', async () => {
    const wrapper = mountContact(mock);
    const trigger = selectTrigger(wrapper);
    expect(trigger.attributes('aria-haspopup')).toBe('listbox');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    trigger.element.focus();

    await trigger.trigger('keydown', { key: 'ArrowDown' });
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="listbox"]')).toBeTruthy();

    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await trigger.trigger('keydown', { key: 'Enter' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.text()).toContain(mock.topics[1]!.label);

    await trigger.trigger('keydown', { key: 'ArrowDown' });
    expect(trigger.attributes('aria-expanded')).toBe('true');
    await trigger.trigger('keydown', { key: 'Escape' });
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
  });

  it('"Open in maps" sits outside the iframe/image, is a tab stop and announces the new tab', () => {
    const wrapper = mountContact(merged);
    const mapLink = wrapper.findAll('a').find((a) => a.text().includes(mock.mapLinkLabel));
    expect(mapLink).toBeTruthy();
    expect(mapLink!.attributes('target')).toBe('_blank');
    expect(mapLink!.attributes('rel')).toContain('noopener');
    expect(mapLink!.element.closest('iframe')).toBeNull();
    const focusable = Array.from(wrapper.element.querySelectorAll('a, input, button, [tabindex]'));
    expect(focusable).toContain(mapLink!.element);
  });

  it('a map embed (no mapImage) renders as an iframe with a title and loading="lazy"', () => {
    const wrapper = mountContact({
      ...mock,
      mapEmbed: 'https://www.google.com/maps/embed?pb=northwind',
    });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('title')).toBeTruthy();
    expect(iframe.attributes('loading')).toBe('lazy');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('an untrusted embed host is not rendered as an iframe', () => {
    const wrapper = mountContact({ ...mock, mapEmbed: 'https://evil.example/embed' });
    expect(wrapper.find('iframe').exists()).toBe(false);
  });

  it('a map image has a text alternative', () => {
    const wrapper = mountContact(merged);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('alt')).toBe(preview.mapImage.altText);
  });

  it('with no map fields at all, no map area is rendered', () => {
    const wrapper = mountContact({
      ...mock,
      mapLinkLabel: undefined,
      mapLinkHref: undefined,
      mapNote: undefined,
      mapEmbed: undefined,
    });
    // Structural check on the map area's own marker, not merely its usual contents — a block
    // that rendered an empty map wrapper (no image, no iframe, no bar) would still pass a
    // content-only assertion here.
    expect(wrapper.find('[data-part="map"]').exists()).toBe(false);
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Open in maps');
  });
});
