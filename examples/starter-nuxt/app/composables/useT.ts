import { useEldra } from '@eldrajs/theme-vue';
import { enUS } from '../i18n/en-US';
import { isIS } from '../i18n/is-IS';
import type { Messages, MessageKey } from '../i18n/messages';

const DEFAULT_LOCALE = 'en-US';

const LOCALES: Record<string, Messages> = {
  'en-US': enUS,
  'is-IS': isIS,
};

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * `useT()` picks the **active content locale's** messages from the Eldra
 * context, falling back to `en-US` both when no context is provided (e.g. a
 * composable called outside `provideEldra()`, or in a unit test that mounts a
 * component with no Eldra provide) and when the active locale is unset or not
 * one of the shipped locales.
 *
 * Two sources, in order. `context.locales.active` is the page's own locale —
 * the one its URL prefix names, or the one a Studio preview is driving — which
 * is what a visitor reading `/is-IS/...` must see the UI strings in.
 * `preview.locale` is the fallback for a context assembled without the locale
 * slice at all (an adapter one version behind, a test that provides only the
 * preview state), where it is still the only answer there is.
 *
 * **A locale with no message set of its own falls back to `en-US`, not to
 * nothing.** The theme ships two sets and an organisation may configure any
 * number of locales; the content on such a page is still that locale's, and
 * English chrome around real Icelandic (or Polish, or Portuguese) copy is the
 * honest outcome of shipping two sets — a key rendered as `nav.menu` would not
 * be.
 *
 * `useEldra()` — like Vue's own `inject()` it wraps — only works while a
 * component instance is active, i.e. called synchronously from `useT()`
 * itself (which callers invoke from `setup()`, the normal composable
 * convention). The returned `t` function only *reads* the already-resolved
 * context, which stays correct however/whenever `t` is then called (a template
 * expression, an event handler, …) — and still reactive, since both slices are
 * `reactive()` objects.
 *
 * No vue-i18n dependency: this is a plain lookup + `{param}` interpolation
 * over the two `satisfies Messages` locale files.
 */
export function useT(): Translate {
  const context = tryUseEldra();
  return (key, params) => {
    const locale = context?.locales?.active ?? context?.preview.locale ?? DEFAULT_LOCALE;
    const messages = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]!;
    return interpolate(resolveKey(messages, key), params);
  };
}

function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    // No provideEldra() ancestor (see useEldra()'s own error) — render
    // outside a themed page still needs a locale to fall back to.
    return undefined;
  }
}

function resolveKey(messages: Messages, key: MessageKey): string {
  let value: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null) return key;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : key;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match
  );
}
