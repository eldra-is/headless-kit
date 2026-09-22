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
 * `useT()` picks the active locale's messages from the Eldra context
 * (`useEldra().preview.locale`), falling back to `en-US` both when no
 * context is provided (e.g. a composable called outside `provideEldra()`,
 * or in a unit test that mounts a component with no Eldra provide) and when
 * the context's locale is unset or not one of the shipped locales.
 *
 * `useEldra()` — like Vue's own `inject()` it wraps — only works while a
 * component instance is active, i.e. called synchronously from `useT()`
 * itself (which callers invoke from `setup()`, the normal composable
 * convention). The returned `t` function only *reads* the already-resolved
 * context's `preview.locale`, which stays correct however/whenever `t` is
 * then called (a template expression, an event handler, …) — and still
 * reactive, since `preview` is a `reactive()` object.
 *
 * No vue-i18n dependency: this is a plain lookup + `{param}` interpolation
 * over the two `satisfies Messages` locale files.
 */
export function useT(): Translate {
  const context = tryUseEldra();
  return (key, params) => {
    const locale = context?.preview.locale ?? DEFAULT_LOCALE;
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
