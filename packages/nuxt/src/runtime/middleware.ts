import {
  abortNavigation,
  createError,
  defineNuxtRouteMiddleware,
  getAppManifest,
  isPrerendered,
  navigateTo,
  useNuxtApp,
  useRequestEvent,
  useRuntimeConfig,
} from 'nuxt/app';
import { createLiveMatcher } from './paths';
import { UNBUILT_ERROR_DATA } from './unbuilt';

let isLive: ((path: string) => boolean) | undefined;

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    if (!useRequestEvent()?.context.eldraUnbuilt) return;
    return abortNavigation(
      createError({ statusCode: 404, statusMessage: 'Page not found', data: UNBUILT_ERROR_DATA })
    );
  }
  if (import.meta.dev || useNuxtApp().isHydrating) return;
  const config = useRuntimeConfig().public.eldraBuiltPages as { live?: string[] } | undefined;
  isLive ??= createLiveMatcher(config?.live ?? []);
  if (isLive(to.path)) return;
  const manifest = await getAppManifest().catch(() => null);
  // An empty list means this build prerendered nothing (dev, an SSR-only site): every page is live.
  if (!manifest?.prerendered.length) return;
  // A page the build did not write is loaded from the server, which answers with the 404 page.
  if (!(await isPrerendered(to.path))) return navigateTo(to.fullPath, { external: true });
});
