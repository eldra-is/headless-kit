import { computed, ref, inject, unref, watchEffect, type MaybeRef, type Ref } from 'vue';
import { stripStega } from '@eldrajs/theme-core/stega';
import { THEME_ICONS } from '../icons';
import { ICON_FETCHER_KEY, type IconFetcher } from './iconFetcher';

/**
 * Resolves an icon name to its inlined SVG markup, for `app/components/EldraIcon.vue` (the adapter
 * that hands it to `@eldrajs/ui`'s `Icon`).
 *
 * The default path is a plain lookup in `app/icons.ts`, which bundles the theme's own Tabler icons
 * at build time, so it is **synchronous and needs no server**: the same markup is there during
 * `nuxi generate`, on a static host, and in Studio's preview the moment an editor types a new icon
 * name. An icon the theme does not ship is simply absent from the map and renders nothing.
 *
 * `ICON_FETCHER_KEY` stays as an injection point for a spec that wants to drive resolution itself
 * (see `test/eldraIcon.spec.ts`); nothing in the app or in Storybook provides one.
 */

export const useEldraIcon = (name: MaybeRef<string | undefined>): Ref<string | null> => {
  // The name is normally an entry field (`feature.icon`), and inside Studio's preview every
  // rendered field value carries the invisible stega payload. Strip it before it is used as a
  // lookup key: left in, `lock%EF%BB%BF…` matches nothing and every icon silently disappears in
  // edit mode while working fine in static output.
  const key = computed(() => stripStega(unref(name) ?? '').trim());
  const injectedFetcher = inject(ICON_FETCHER_KEY, undefined);

  if (injectedFetcher) return useInjectedIcon(key, injectedFetcher);

  return computed(() => THEME_ICONS[key.value as keyof typeof THEME_ICONS] ?? null);
};

function useInjectedIcon(key: Ref<string>, fetcher: IconFetcher): Ref<string | null> {
  const result = ref<string | null>(null);
  watchEffect(() => {
    const current = key.value;
    if (current === '') {
      result.value = null;
      return;
    }
    fetcher(current).then((svg) => {
      // Guard against a resolution racing past a newer name.
      if (key.value === current) result.value = svg;
    });
  });
  return result;
}
