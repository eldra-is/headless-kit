// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { EditorPlaceholder } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { STOREFRONT_KEY } from '../../../app/storefront/types';
import type { StorefrontForms } from '../../../app/storefront/types';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { enUS } from '../../../app/i18n/en-US';

/**
 * `mock.json` names a collection or product by handle, because a theme cannot know an
 * organisation's catalog ids: Core rewrites those to ids when it seeds the entry, and the site
 * resolves each id to a slug before rendering. This is the same route context a real page carries,
 * keyed to the ids `resolveTargets` writes, so a spec can assert the hrefs the footer produces.
 */
const TEMPLATES = [
  {
    id: 'rt-collection',
    data: {
      schemaApiId: 'catalog:collection',
      routePattern: '/collections/:slug',
      slugField: 'slug',
    },
  },
  {
    id: 'rt-product',
    data: { schemaApiId: 'catalog:product', routePattern: '/products/:slug', slugField: 'slug' },
  },
];

interface SeedLink {
  kind: string;
  target?: { _type: string; slug?: string; id?: string };
  url?: string;
  label?: string;
  children?: SeedLink[];
}

const linkTargets = new Map<string, unknown>();
function resolveSeedLink(link: SeedLink): SeedLink {
  const slug = link.target?.slug;
  if (link.target === undefined || slug === undefined) return link;
  const id = `id-${slug}`;
  linkTargets.set(`${link.target._type}:${id}`, { slug, title: link.label });
  return { ...link, target: { _type: link.target._type, id } };
}

const resolvedMock = {
  ...mock,
  groups: (mock.groups as SeedLink[]).map((group) => ({
    ...group,
    children: (group.children ?? []).map(resolveSeedLink),
  })),
  links: (mock.links as SeedLink[]).map(resolveSeedLink),
  legalLinks: (mock.legalLinks as SeedLink[]).map(resolveSeedLink),
};
const linkContext = { templates: TEMPLATES, targets: linkTargets };

function mountFooter(
  data: Record<string, unknown>,
  options: {
    failForms?: boolean;
    subscribe?: StorefrontForms['subscribe'];
    /** Studio's edit mode — what `useEditing()` reads, and the only state that shows hints. */
    editing?: boolean;
  } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } }, { links: linkContext });
  if (options.editing) {
    const context = base.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  const storefront = options.subscribe
    ? (() => {
        const demo = createDemoStorefront();
        return { ...demo, forms: { ...demo.forms, subscribe: options.subscribe! } };
      })()
    : undefined;
  return mount(Block, {
    ...base,
    // Real focus tracking (`document.activeElement`, and `Select`'s own focus-return behaviour)
    // needs the tree connected to the document — jsdom does not reliably track focus on a
    // detached mount. Auto-unmount (`test/setup.ts`) removes this from `document.body` again
    // after every test.
    attachTo: document.body,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        ...(options.failForms
          ? { [STOREFRONT_KEY]: createDemoStorefront({ failForms: true }) }
          : {}),
        ...(storefront ? { [STOREFRONT_KEY]: storefront } : {}),
      },
    },
  });
}

/** Both `Select` triggers, in DOM order (locale, then currency — see `Block.vue`'s legal row). */
function selectTriggers(wrapper: ReturnType<typeof mountFooter>) {
  return wrapper.findAll('[role="combobox"]').filter((c) => c.element.tagName === 'BUTTON');
}

describe('footer block', () => {
  it('renders the default variant (merged data — no preview.json exists for this block) with no axe violations', async () => {
    const wrapper = mountFooter(mock);
    expect(wrapper.text()).toContain(mock.brandText);
    expect(wrapper.text()).toContain(mock.description);
    for (const group of mock.groups) expect(wrapper.text()).toContain(group.label);
    expect(wrapper.text()).toContain(mock.legalText);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json content (freshly-inserted regression net) with no axe violations', async () => {
    const wrapper = mountFooter({ ...mock });
    expect(wrapper.find('footer').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('minimal variant renders the flat links row and no groups or newsletter, with no axe violations', async () => {
    const wrapper = mountFooter({ ...mock, variant: 'minimal' });
    expect(wrapper.text()).toContain(mock.brandText);
    for (const link of mock.links) expect(wrapper.text()).toContain(link.label);
    expect(wrapper.text()).not.toContain(mock.groups[0]!.label);
    expect(wrapper.findAll('h3')).toHaveLength(0);
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a resolved collection and product row as their own paths', async () => {
    const wrapper = mountFooter(resolvedMock);
    const anchor = (label: string) => wrapper.findAll('a').find((a) => a.text() === label)!;
    expect(anchor('Knitwear').attributes('href')).toBe('/collections/knitwear');
    expect(anchor('Gift cards').attributes('href')).toBe('/products/gift-card');
    // A legal row is an ordinary URL and needs no catalog at all.
    expect(anchor('Privacy').attributes('href')).toBe('/pages/privacy');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a row whose target no longer exists as plain text, never a dead anchor', async () => {
    const wrapper = mountFooter({
      ...resolvedMock,
      variant: 'minimal',
      links: [
        { kind: 'collection', target: { _type: 'collection', id: 'id-gone' }, label: 'Gone' },
      ],
    });
    expect(wrapper.text()).toContain('Gone');
    expect(wrapper.findAll('a').some((a) => a.text() === 'Gone')).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders nothing at all for a row with no label', () => {
    const wrapper = mountFooter({
      ...resolvedMock,
      variant: 'minimal',
      links: [
        { kind: 'url', url: '/pages/terms' },
        { kind: 'url', url: '/pages/privacy', label: 'Privacy' },
      ],
    });
    const rows = wrapper.findAll('nav ul li');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toBe('Privacy');
  });

  it('background primary renders with no axe violations', async () => {
    const wrapper = mountFooter({ ...mock, background: 'primary' });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has a contentinfo <footer> landmark labelled by a visually hidden <h2> (default variant)', () => {
    const wrapper = mountFooter(mock);
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    const labelledBy = footer.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(footer.attributes('aria-label')).toBeUndefined();
    const heading = wrapper.find(`#${labelledBy}`);
    expect(heading.element.tagName).toBe('H2');
    expect(heading.text()).toBe(enUS.footer.title);
    expect(heading.classes()).toContain('sr-only');
  });

  it('names the <footer> landmark with aria-label directly in the minimal variant (no hidden <h2>)', () => {
    const wrapper = mountFooter({ ...mock, variant: 'minimal' });
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    expect(footer.attributes('aria-label')).toBe(enUS.footer.title);
    expect(footer.attributes('aria-labelledby')).toBeUndefined();
    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('the block root is the Section component, a width container for its own @content:/@tablet: breakpoints', () => {
    // Structural guard, not a layout one: happy-dom/jsdom compute no layout, so this only proves
    // the `@container` utility Section's own root always carries (see Section.vue) survives onto
    // the rendered <footer> — it cannot prove container queries actually resolve in a real
    // browser. (A known `@eldrajs/ui` package issue currently keeps `@content:` utilities from
    // compiling — its `@theme` container-query breakpoints are `var()` references, which Tailwind
    // cannot use as a query threshold — tracked and fixed at the package, not worked around here.)
    const wrapper = mountFooter(mock);
    const footer = wrapper.find('footer');
    expect(footer.exists()).toBe(true);
    expect(footer.classes()).toContain('@container');
  });

  it('labels the link-groups nav', () => {
    const wrapper = mountFooter(mock);
    const nav = wrapper.find('nav');
    expect(nav.exists()).toBe(true);
    expect(nav.attributes('aria-label')).toBe(enUS.footer.nav);
  });

  it('the newsletter email input has type="email", autocomplete="email" and a programmatic label', () => {
    const wrapper = mountFooter(mock);
    const input = wrapper.find('input[type="email"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('autocomplete')).toBe('email');
    const id = input.attributes('id');
    expect(id).toBeTruthy();
    const label = wrapper.find(`label[for="${id}"]`);
    expect(label.exists()).toBe(true);
    expect(label.text()).toBe(enUS.footer.emailLabel);
    expect(label.classes()).toContain('sr-only');
  });

  it('an invalid (malformed) email submit sets aria-invalid, shows the error linked by aria-describedby, and keeps focus in the field', async () => {
    const wrapper = mountFooter(mock);
    const input = wrapper.find('input[type="email"]');
    await input.setValue('not-an-email');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(enUS.footer.emailInvalid);
    const describedBy = input.attributes('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(wrapper.find(`#${describedBy?.split(' ')[0]}`).text()).toContain(
      enUS.footer.emailInvalid
    );
    expect(document.activeElement).toBe(input.element);
  });

  it('an empty submit is invalid too', async () => {
    const wrapper = mountFooter(mock);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const input = wrapper.find('input[type="email"]');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(enUS.footer.emailInvalid);
  });

  it('a valid submit calls forms.subscribe and announces success through role="status"', async () => {
    const wrapper = mountFooter(mock);
    const input = wrapper.find('input[type="email"]');
    await input.setValue('reader@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain(enUS.footer.subscribed);
    // The form is replaced, not merely supplemented, by the success line (spec: "the form is
    // replaced by a status line").
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('a subscribe failure (backend ok:false) shows an error and keeps focus in the field', async () => {
    const wrapper = mountFooter(mock, { failForms: true });
    const input = wrapper.find('input[type="email"]');
    await input.setValue('reader@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(enUS.footer.emailError);
    expect(document.activeElement).toBe(input.element);
    // The form stays (retryable), unlike the success path.
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('after a backend failure, resubmitting the unchanged email reaches the service again and can succeed', async () => {
    // The gap `blocks/newsletter/Block.vue` fixed first: `FormLayout`'s own submit handler
    // refuses to emit `submit` at all while a field still carries `aria-invalid="true"`, so an
    // unchanged resubmit right after a backend failure needs the block's own `retryable` +
    // `@invalid` handling to ever reach the service a second time. Mutation check (manual):
    // removing `@invalid="onNewsletterInvalid"` (or `retryable.value = serviceFailed` in
    // `onNewsletterSubmit`) makes `subscribe` stay called once and the field stay marked invalid
    // forever — confirmed by temporarily reverting each change and observing this test fail.
    const results = [{ ok: false as const, reason: 'failed' as const }, { ok: true as const }];
    const subscribe = vi.fn(async () => results.shift() ?? { ok: true as const });
    const wrapper = mountFooter(mock, { subscribe });
    const input = wrapper.find('input[type="email"]');
    await input.setValue('reader@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(input.attributes('aria-invalid')).toBe('true');

    // Same value, no edit in between: the form's own invalid gate must not swallow this.
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await flushPromises();

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenLastCalledWith({
      email: 'reader@example.com',
      list: 'footer-newsletter',
    });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toContain(enUS.footer.subscribed);
  });

  it('a backend {ok:false, reason:"invalid"} shows the exact same invalid-email message (not the retryable one)', async () => {
    const wrapper = mountFooter(mock, {
      subscribe: async () => ({ ok: false, reason: 'invalid' }),
    });
    const input = wrapper.find('input[type="email"]');
    await input.setValue('reader@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(enUS.footer.emailInvalid);
  });

  it('both selectors expose combobox/listbox roles with aria-expanded, closed by default', () => {
    const wrapper = mountFooter(mock);
    const triggers = selectTriggers(wrapper);
    expect(triggers).toHaveLength(2);
    for (const trigger of triggers) {
      expect(trigger.attributes('aria-haspopup')).toBe('listbox');
      expect(trigger.attributes('aria-expanded')).toBe('false');
    }
    expect(triggers[0]!.text()).toContain(enUS.footer.localeOptions.usEnglish);
    expect(triggers[1]!.text()).toContain(enUS.footer.currencyOptions.usd);
  });

  it('the currency selector commits only on Enter — arrow keys alone leave the value unchanged', async () => {
    const wrapper = mountFooter(mock);
    const currencyTrigger = selectTriggers(wrapper)[1]!;
    currencyTrigger.element.focus();

    await currencyTrigger.trigger('keydown', { key: 'ArrowDown' });
    expect(currencyTrigger.attributes('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="listbox"]')).toBeTruthy();

    // Moves the active option (USD -> CAD) without committing.
    await currencyTrigger.trigger('keydown', { key: 'ArrowDown' });
    expect(currencyTrigger.text()).toContain(enUS.footer.currencyOptions.usd);

    await currencyTrigger.trigger('keydown', { key: 'Enter' });
    expect(currencyTrigger.attributes('aria-expanded')).toBe('false');
    expect(currencyTrigger.text()).toContain(enUS.footer.currencyOptions.cad);
  });

  it('Esc closes a selector without changing its value', async () => {
    const wrapper = mountFooter(mock);
    const currencyTrigger = selectTriggers(wrapper)[1]!;
    const before = currencyTrigger.text();
    currencyTrigger.element.focus();

    await currencyTrigger.trigger('keydown', { key: 'ArrowDown' });
    await currencyTrigger.trigger('keydown', { key: 'ArrowDown' });
    await currencyTrigger.trigger('keydown', { key: 'Escape' });

    expect(currencyTrigger.attributes('aria-expanded')).toBe('false');
    expect(currencyTrigger.text()).toBe(before);
  });

  it('keyboard order: a link precedes the email field, which precedes the subscribe button, which precedes the selectors', () => {
    const wrapper = mountFooter(mock);
    const focusable = Array.from(
      wrapper.element.querySelectorAll('a, input, button, select, [tabindex]')
    );
    const firstLink = wrapper.find('a').element;
    const emailInput = wrapper.find('input[type="email"]').element;
    const subscribeButton = wrapper.find('button[type="submit"]').element;
    const firstSelectorTrigger = selectTriggers(wrapper)[0]!.element;

    expect(focusable.indexOf(firstLink)).toBeLessThan(focusable.indexOf(emailInput));
    expect(focusable.indexOf(emailInput)).toBeLessThan(focusable.indexOf(subscribeButton));
    expect(focusable.indexOf(subscribeButton)).toBeLessThan(
      focusable.indexOf(firstSelectorTrigger)
    );
  });

  /**
   * The spec's three Footer "States" rows. `footer` was the one block of 33 with no editor hints at
   * all: a freshly inserted footer showed an almost-empty band with nothing telling the editor
   * where the description, the link groups and the newsletter go, while every sibling block showed
   * dashed placeholders.
   */
  describe('editor hints', () => {
    const empty = {
      variant: 'default',
      brandText: mock.brandText,
      showNewsletter: false,
    };

    it('shows the description, link-group and newsletter hints in edit mode', async () => {
      const wrapper = mountFooter(empty, { editing: true });
      await flushPromises();
      const labels = wrapper.findAllComponents(EditorPlaceholder).map((p) => p.props('label'));
      expect(labels).toEqual([
        enUS.footer.descriptionHintLabel,
        enUS.footer.groupsHintLabel,
        enUS.footer.newsletterHintLabel,
      ]);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('renders none of them on the live site', async () => {
      const wrapper = mountFooter(empty);
      await flushPromises();
      expect(wrapper.findAllComponents(EditorPlaceholder)).toHaveLength(0);
      expect(wrapper.text()).not.toContain(enUS.footer.groupsHintLabel);
    });

    it('replaces each hint with the real content as soon as the field is filled', async () => {
      const wrapper = mountFooter(
        {
          ...empty,
          description: mock.description,
          groups: mock.groups,
          showNewsletter: true,
        },
        { editing: true }
      );
      await flushPromises();
      expect(wrapper.findAllComponents(EditorPlaceholder)).toHaveLength(0);
      expect(wrapper.text()).toContain(mock.description);
      expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    });

    it('shows no hint on the minimal variant, which has none of those three parts', async () => {
      const wrapper = mountFooter({ ...empty, variant: 'minimal' }, { editing: true });
      await flushPromises();
      expect(wrapper.findAllComponents(EditorPlaceholder)).toHaveLength(0);
    });
  });

  it('social link names include the store name', () => {
    const wrapper = mountFooter(mock);
    const instagramLink = wrapper
      .findAll('a[target="_blank"]')
      .find((a) => a.attributes('href')?.includes('instagram'));
    expect(instagramLink).toBeTruthy();
    expect(instagramLink!.attributes('aria-label')).toBe(`${mock.brandText} on Instagram`);
  });
});
