import type { ComputedRef, InjectionKey, Ref } from 'vue';

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

/**
 * Which of the three arrangements the form around this subtree is using.
 *
 * `FormLayout` provides it; a `FieldWrapper` below injects it so its `full` prop can span both
 * columns — and only in the layout where there *are* two columns. A `FieldWrapper` outside a form
 * injects nothing and `full` does nothing, which is what a field in a page-builder column wants.
 *
 * ```ts
 * import { FORM_LAYOUT_KEY } from '@eldrajs/ui';
 * provide(FORM_LAYOUT_KEY, computed(() => 'two')); // ComputedRef<'single' | 'two' | 'inline'>
 * ```
 */
export const FORM_LAYOUT_KEY: InjectionKey<ComputedRef<'single' | 'two' | 'inline'>> =
  Symbol('eldra-form-layout');
