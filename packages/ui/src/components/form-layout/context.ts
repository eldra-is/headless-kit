import type { InjectionKey, Ref } from 'vue';

/**
 * Whether the form this subtree belongs to is currently submitting.
 *
 * `FormLayout` provides it; every `Button` below injects it. The design spec's Form layout section
 * says what a submitting form looks like — "primary button loading, other actions disabled" — and
 * this key is how the buttons learn it without the form reaching into them:
 *
 * - a `type="submit"` button becomes `loading` (spinner, `aria-busy`, focus and width kept);
 * - every other button becomes `disabled`, so a second action cannot start mid-submit.
 *
 * Optional everywhere: a Button outside a form injects nothing and behaves exactly as its props
 * say.
 *
 * ```ts
 * import { FORM_SUBMITTING_KEY } from '@eldrajs/ui';
 * provide(FORM_SUBMITTING_KEY, submitting); // Ref<boolean>
 * ```
 */
export const FORM_SUBMITTING_KEY: InjectionKey<Ref<boolean>> = Symbol('eldra-form-submitting');
