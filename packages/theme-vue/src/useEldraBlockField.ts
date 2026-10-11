import { isBlockFieldLocalized } from '@eldrajs/theme-core';

/**
 * Vue-facing name for theme-core's block-field lookup. The registry and the
 * `localized` resolution live in `@eldrajs/theme-core` so every framework
 * binding shares one implementation; this wrapper exists only so themes keep
 * calling a composable-shaped API.
 *
 * There is no `toolbar` here any more: §18 v3 keeps the rich-text toolbar in
 * Studio, which reads `metadata.toolbar` from Core's field definitions. The
 * vite plugin still validates the control ids at build time.
 */
export function useEldraBlockField(
  apiId: string | undefined,
  fieldId: string
): { localized: boolean } {
  return { localized: isBlockFieldLocalized(apiId, fieldId) };
}
