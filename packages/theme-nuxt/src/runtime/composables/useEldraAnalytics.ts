import type { Analytics } from '@eldrajs/theme-core';
import { useNuxtApp } from 'nuxt/app';
import type { EldraAnalytics } from '../analytics';

const DISABLED: EldraAnalytics = { enabled: false, track: () => undefined };

/**
 * Records a custom event (`add_to_cart`, `search`, ...) with the Eldra tracker the module loads on
 * deployed sites. Props are stringified and cut to Core's limits; `null`/`undefined` props are
 * dropped. A no-op (`enabled: false`) on the server, in `nuxi dev`, in a Studio preview, on a
 * build without an organisation and when the site opted out — call it freely.
 *
 * Pageviews are not sent from here: the tracker sends them, including for client-side navigations.
 */
export function useEldraAnalytics(): EldraAnalytics {
  const injected = (useNuxtApp() as unknown as { $eldraAnalytics?: Analytics }).$eldraAnalytics;
  return injected ?? DISABLED;
}
