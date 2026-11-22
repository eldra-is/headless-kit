import { useRequestEvent } from 'nuxt/app';

export const UNBUILT_ERROR_DATA = { eldraUnbuilt: true };

/** On the server: this render is the 404 page for a page the build did not write. */
export function isUnbuiltPage(): boolean {
  if (!import.meta.server) return false;
  const context = useRequestEvent()?.context;
  return Boolean(context?.eldraUnbuilt || context?.eldraUnbuiltErrorPage);
}
