import { computed, inject, ref, unref, watchEffect, type MaybeRef, type Ref } from 'vue';
import { stripStega } from '@eldrajs/theme-core/stega';
import { ICON_FETCHER_KEY, type IconFetcher } from './iconFetcher';

/**
 * Resolves an icon name to its inlined SVG markup, for
 * `app/components/EldraIcon.vue` (the adapter that hands it to `@eldrajs/ui`'s
 * `Icon`). It is used in three environments that each need a different
 * transport:
 *  - the real Nuxt app (`/api/eldra-icon`, this file's default path below)
 *  - Storybook, which has no Nuxt server at all
 *  - unit tests, which want a synchronous, network-free stub
 *
 * `ICON_FETCHER_KEY` lets the latter two `provide()` their own fetcher
 * (`.storybook/iconFetcher.ts` builds one from `import.meta.glob` over
 * `@tabler/icons`, wired app-wide in `.storybook/preview.ts`; tests stub it
 * directly, see `test/eldraIcon.spec.ts`). Absent an injected fetcher,
 * `useEldraIcon` keeps calling `/api/eldra-icon` exactly as before.
 */

export const useEldraIcon = (name: MaybeRef<string | undefined>): Ref<string | null> => {
  // The name is normally an entry field (`feature.icon`), and inside Studio's
  // preview every rendered field value carries the invisible stega payload.
  // Strip it here, where the request key is built: left in, the request
  // asks for `lock%EF%BB%BF…` and every icon silently disappears in edit
  // mode while working fine in static output.
  const key = computed(() => stripStega(unref(name) ?? '').trim());
  const injectedFetcher = inject(ICON_FETCHER_KEY, undefined);

  if (injectedFetcher) return useInjectedIcon(key, injectedFetcher);

  // Default path: Nuxt's own `useFetch` runs this request server-side during
  // `nuxi generate` and inlines the response into the page's static
  // payload, so static hosting serves the icon with no runtime request; the
  // route itself does the file read (see server/utils/tablerIcon.ts). Used
  // as a bare global the same way the rest of app/composables/** relies on
  // Nuxt's auto-imports (unlike blocks/** and app/components/ui/**, which may
  // not — which is why `EldraIcon` only ever reaches this through here).
  const { data } = useFetch<{ svg: string | null }>('/api/eldra-icon', {
    query: { name: key },
    key: computed(() => `eldra-icon:${key.value}`),
    default: () => ({ svg: null }),
  });
  return computed(() => data.value?.svg ?? null);
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
