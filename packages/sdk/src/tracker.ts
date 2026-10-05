import { resolveApiBaseUrl, resolveOrgId } from './client';
import type { EldraClientOptions } from './types';

export interface EldraTrackerScriptOptions extends Pick<
  EldraClientOptions,
  'apiBaseUrl' | 'orgId' | 'env'
> {
  /** Origin that receives events when the script is served through a first-party proxy. */
  eventOrigin?: string;
}

/** Attributes of the `<script>` tag that loads the Eldra analytics tracker. */
export interface EldraTrackerScript {
  src: string;
  defer: true;
  crossorigin: 'anonymous';
  'data-org': string;
  'data-api'?: string;
}

/**
 * Builds the tracker `<script>` attributes from the same configuration the client uses, so the
 * tracker always reports to the gateway the site reads from. Returns `undefined` when no
 * organisation id is configured, which is the case in builds that should not report at all.
 */
export function analyticsTrackerScript(
  options: EldraTrackerScriptOptions = {}
): EldraTrackerScript | undefined {
  const orgId = resolveOrgId(options);
  if (!orgId) {
    return undefined;
  }
  const script: EldraTrackerScript = {
    src: `${new URL(resolveApiBaseUrl(options)).origin}/js/script.js`,
    defer: true,
    crossorigin: 'anonymous',
    'data-org': orgId,
  };
  if (options.eventOrigin) {
    script['data-api'] = options.eventOrigin;
  }
  return script;
}
