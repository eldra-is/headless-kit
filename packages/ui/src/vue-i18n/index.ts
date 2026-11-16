import { numberFormat } from '@eldrajs/sdk/format';
import { useI18n } from 'vue-i18n';
import { provideEldraUiMessages } from '../composables/useMessages';
import { enUS, type UiMessages } from '../messages/en-US';
import { formatConjunctionList } from '../utils/listFormat';
import { SHAPES, variantKey, type FunctionMessageKey } from './shapes';

export { toVueI18nMessages } from './shapes';

/**
 * The parts of a vue-i18n `Composer` (`useI18n()`, or `i18n.global` with `legacy: false`) this entry
 * reads.
 */
export interface EldraUiI18n {
  t(key: string, named: Record<string, unknown>, plural: number): string;
  t(key: string, named?: Record<string, unknown>): string;
  te(key: string, locale?: string): boolean;
  locale: { value: string };
  fallbackLocale?: { value: unknown };
}

export interface EldraUiI18nOptions {
  /** Where the kit's keys live in your messages. Default `'eldraUi'`: `eldraUi.close`, … */
  prefix?: string;
  /** Text for a key your messages leave out. Default: the English defaults (`enUS`). */
  fallback?: UiMessages;
}

/**
 * The kit's messages read through vue-i18n, for `MESSAGES_KEY`. Each key is looked up under
 * `prefix`; one your messages do not have falls back to `fallback`, so a partial translation is
 * fine. Strings are read when a component renders, so switching the locale updates the kit.
 *
 * ```ts
 * app.provide(MESSAGES_KEY, eldraUiI18nMessages(i18n.global));
 * ```
 */
export function eldraUiI18nMessages(
  i18n: EldraUiI18n,
  options: EldraUiI18nOptions = {}
): UiMessages {
  const prefix = options.prefix ?? 'eldraUi';
  const fallback = options.fallback ?? enUS;
  const path = (key: string) => `${prefix}.${key}`;
  const fallbackLocales = (): string[] => {
    const value = i18n.fallbackLocale?.value;
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  };
  const has = (key: string) =>
    i18n.te(path(key)) || fallbackLocales().some((locale) => i18n.te(path(key), locale));

  const messages: Record<string, unknown> = {};
  for (const key of Object.keys(enUS) as (keyof UiMessages)[]) {
    if (typeof enUS[key] === 'string') {
      Object.defineProperty(messages, key, {
        enumerable: true,
        get: () => (has(key) ? i18n.t(path(key)) : fallback[key]),
      });
      continue;
    }
    const fnKey = key as FunctionMessageKey;
    const shape = SHAPES[fnKey];
    const original = fallback[fnKey] as (...args: unknown[]) => string;
    messages[key] = (...args: unknown[]): string => {
      if (fnKey === 'avatarGroup') return avatarGroup(args, original);
      const target = variantKey(fnKey, args);
      if (!has(target)) return original(...args);
      const named: Record<string, unknown> = {};
      shape.params.forEach((name, index) => {
        named[name] = args[index];
      });
      if (fnKey === 'rating') named.value = oneDecimal(args[0] as number);
      const count = shape.count === undefined ? undefined : named[shape.count];
      return typeof count === 'number'
        ? i18n.t(path(target), named, count)
        : i18n.t(path(target), named);
    };
  }

  function oneDecimal(value: number): string {
    return numberFormat(i18n.locale.value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  function avatarGroup(args: unknown[], original: (...args: unknown[]) => string): string {
    const [label, names, more] = args as [string, string[], number];
    if (!has('avatarGroup') || (more > 0 && !has('avatarGroup_more'))) return original(...args);
    const items =
      more > 0 ? [...names, i18n.t(path('avatarGroup_more'), { n: more }, more)] : names;
    return i18n.t(path('avatarGroup'), {
      label,
      names: formatConjunctionList(items, i18n.locale.value),
    });
  }

  return messages as UiMessages;
}

/**
 * Reads the kit's messages from the app's vue-i18n for this component and everything below it.
 * Call it during `setup()`, usually in the app root; it uses the global composer unless you pass
 * one (`i18n`).
 */
export function useEldraUiI18n(options: EldraUiI18nOptions & { i18n?: EldraUiI18n } = {}): void {
  const i18n = options.i18n ?? (useI18n({ useScope: 'global' }) as unknown as EldraUiI18n);
  provideEldraUiMessages(eldraUiI18nMessages(i18n, options));
}

/**
 * Icelandic plural forms for vue-i18n's `pluralRules`: a number ending in 1, except 11, is
 * singular (21 vara, 11 vörur). vue-i18n's default rule treats only 1 as singular.
 *
 * ```ts
 * createI18n({ pluralRules: { 'is-IS': icelandicPluralRule }, … });
 * ```
 */
export function icelandicPluralRule(choice: number, choicesLength: number): number {
  const n = Math.abs(choice);
  const singular = n % 10 === 1 && n % 100 !== 11;
  if (choicesLength === 2) return singular ? 0 : 1;
  if (choicesLength === 3) return n === 0 ? 0 : singular ? 1 : 2;
  return Math.min(n, choicesLength - 1);
}
