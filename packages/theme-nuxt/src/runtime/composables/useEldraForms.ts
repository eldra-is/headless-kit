import type { EldraFormDefinition } from '@eldrajs/sdk';
import { useRuntimeConfig } from 'nuxt/app';

/**
 * The form definitions the build baked into the site (`eldra.formSeeds` and `eldra.forms` keys,
 * read once at `nuxi generate` time), by form key. A form that is not here — the merchant made it
 * after the build, or the build's read failed — is fetched in the visitor's browser instead; the
 * storefront's `forms.definition(key)` does both, so a block never calls this directly.
 */
export function useEldraForms(): Record<string, EldraFormDefinition> {
  const eldra = useRuntimeConfig().public.eldra as {
    forms?: Record<string, EldraFormDefinition> | '';
  };
  return typeof eldra.forms === 'object' && eldra.forms !== null ? eldra.forms : {};
}
