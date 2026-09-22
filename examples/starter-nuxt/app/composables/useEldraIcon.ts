import { computed, unref, type MaybeRef } from 'vue';
import { stripStega } from '@eldrajs/theme-core/stega';

// Resolves a Tabler outline icon's inlined SVG markup for the given icon
// name via the `/api/eldra-icon` Nitro route. `useFetch` runs this request
// server-side during `nuxi generate` and inlines the response into the
// page's static payload, so static hosting serves the icon with no runtime
// request; the route itself does the file read (see server/utils/tablerIcon.ts).
export const useEldraIcon = (name: MaybeRef<string | undefined>) => {
  // The name is normally an entry field (`feature.icon`), and inside Studio's
  // preview every rendered field value carries the invisible stega payload.
  // Strip it here, where the request URL and its cache key are built: left in,
  // the browser asks for `/api/eldra-icon?name=lock%EF%BB%BF…` and every icon
  // silently disappears in edit mode while working fine in static output.
  const key = computed(() => stripStega(unref(name) ?? '').trim());
  const { data } = useFetch<{ svg: string | null }>('/api/eldra-icon', {
    query: { name: key },
    key: computed(() => `eldra-icon:${key.value}`),
    default: () => ({ svg: null }),
  });
  return computed(() => data.value?.svg ?? null);
};
