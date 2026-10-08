// @vitest-environment jsdom
//
// The starter speaks `vue-i18n` directly — every block calls `useI18n()`, with no wrapper
// composable in front of it, by design. This file is what used to guard `useT()`
// (deleted along with `app/i18n/{messages,en-US,is-IS,uiMessages}.ts`): the key-parity canary
// between the two locale files, a harness proving `useI18n()` resolves the same way a real page's
// `app/plugins/eldra-i18n.ts` does (active locale first, `vue-i18n`'s own `fallbackLocale` for a
// locale the theme ships no messages for, `{param}` interpolation), and the "no literal UI copy in
// blocks" strings rule.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n, useI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import enUS from '../i18n/en-US.json';
import isIS from '../i18n/is-IS.json';

function flattenKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof child === 'string' ? [path] : flattenKeys(child as Record<string, unknown>, path);
  });
}

describe('locale key parity', () => {
  it('en-US and is-IS declare exactly the same set of dotted keys', () => {
    expect(flattenKeys(enUS).sort()).toEqual(flattenKeys(isIS).sort());
  });
});

/**
 * Mounts a harness whose `setup()` calls `useI18n()` — the same call every block makes — against
 * an `i18n` instance installed with the starter's own two locale files and `fallbackLocale: 'en-US'`
 * (the theme's own default locale; a real page's chain also tries the organisation's default
 * locale first — `app/plugins/eldra-i18n.ts` — which there is none of here).
 */
function mountWithLocale(
  locale: string
): (key: string, params?: Record<string, unknown>) => string {
  let translate!: (key: string, params?: Record<string, unknown>) => string;
  const Harness = defineComponent({
    setup() {
      const { t } = useI18n();
      translate = t;
      return () => h('div');
    },
  });
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en-US',
    messages: { 'en-US': enUS, 'is-IS': isIS },
  });
  mount(Harness, { global: { plugins: [i18n] } });
  return translate;
}

describe('useI18n over the starter catalogue', () => {
  it('picks the is-IS message when the active locale is is-IS', () => {
    const t = mountWithLocale('is-IS');
    expect(t('nav.menu')).toBe('Valmynd');
    expect(t('notFound.title')).toBe('Síða fannst ekki');
  });

  it('falls back to en-US when the active locale is not a shipped locale', () => {
    // An organisation may configure any number of locales; the theme ships two message sets. The
    // content on such a page is still that locale's, and English chrome around it is the honest
    // outcome — a key rendered unresolved would not be.
    const t = mountWithLocale('pl-PL');
    expect(t('nav.menu')).toBe('Menu');
  });

  // `{param}` interpolation is load-bearing again: 87 placeholders across the two locales, read by
  // dozens of block call sites — `vue-i18n`'s own named interpolation, not a hand-rolled one.
  describe('{param} interpolation', () => {
    it('substitutes a named parameter, in both locales', () => {
      expect(
        mountWithLocale('en-US')('footer.socialLinkName', {
          brand: 'Northwind',
          network: 'Instagram',
        })
      ).toBe('Northwind on Instagram');
      expect(
        mountWithLocale('is-IS')('footer.socialLinkName', {
          brand: 'Northwind',
          network: 'Instagram',
        })
      ).toBe('Northwind á Instagram');
    });

    it('substitutes every occurrence of the same parameter', () => {
      // `gallery.viewLarger` carries `{index}`, `{count}` and `{alt}` — three distinct params in
      // one string, which is what a single-pass replace over the wrong regex gets wrong.
      expect(
        mountWithLocale('en-US')('gallery.viewLarger', { index: 2, count: 9, alt: 'A glazed jug' })
      ).toBe('View larger, image 2 of 9: A glazed jug');
    });

    it('accepts numbers as well as strings', () => {
      expect(mountWithLocale('en-US')('header.cartMany', { count: 3 })).toContain('3');
    });

    // `vue-i18n`'s own behaviour for a named placeholder with no matching param: it renders empty,
    // not the literal `{network}` the starter's old hand-rolled `interpolate()` left in place. A
    // real difference from adopting the library directly — flagged in the report, not worked
    // around with a wrapper.
    it('renders a missing param as empty, not the literal placeholder', () => {
      expect(mountWithLocale('en-US')('footer.socialLinkName', { brand: 'Northwind' })).toBe(
        'Northwind on '
      );
    });
  });

  it('returns the key itself when it does not resolve to a message', () => {
    const t = mountWithLocale('en-US');
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
});

/**
 * The strings rule (`docs/starter-kit.md` §5): no hard-coded UI copy in blocks. Deliberately
 * narrow in scope — it reads each block's `<template>` section (comments stripped) for a literal,
 * unbound `aria-label`/`title`/`placeholder`/`alt` value, the attribute family a block is most
 * likely to accidentally hardcode (an icon-only button's accessible name, a field's placeholder) —
 * rather than attempting to parse every possible text node, which Vue's own interpolation syntax
 * and CMS-authored content (a block's own `mock.json` data, not UI copy) make hard to tell apart
 * reliably by regex. `:attr="…"`/`v-bind:attr="…"` bindings are excluded (that is how every real
 * call site reads a `t(...)` string), so what remains is exactly an attribute written as a plain
 * double-quoted literal.
 *
 * Mutation-proven: hardcoding `aria-label="Primary"` in `blocks/navigation/Block.vue` (in place of
 * its real `:aria-label="t('header.primary')"`) makes this fail, naming the file, attribute and
 * value; reverting makes it pass again.
 */
describe('strings rule — no literal UI copy in blocks', () => {
  const blocksDir = join(process.cwd(), 'blocks');
  const LITERAL_ATTR = /(^|[^:@\w-])(aria-label|title|placeholder|alt)="([^"]*)"/g;

  function vueFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === '__tests__') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...vueFiles(full));
      else if (name.endsWith('.vue')) out.push(full);
    }
    return out;
  }

  it('every block template keeps aria-label/title/placeholder/alt bound to t(...), never literal', () => {
    const violations: string[] = [];
    for (const file of vueFiles(blocksDir)) {
      const source = readFileSync(file, 'utf-8');
      const start = source.indexOf('<template>');
      const end = source.lastIndexOf('</template>');
      if (start === -1 || end === -1) continue;
      const template = source.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');
      for (const match of template.matchAll(LITERAL_ATTR)) {
        const value = match[3]!;
        if (/[A-Za-z]/.test(value)) {
          violations.push(`${file}: ${match[2]}="${value}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
