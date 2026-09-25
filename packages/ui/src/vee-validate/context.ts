import type { InjectionKey, Ref } from 'vue';

/**
 * The server's field errors, keyed by the path a `Field*` validates under (its `path`, or its
 * `name` when there is none).
 *
 * `Form` provides it from its `apiErrors` prop and applies it to the form with vee-validate's own
 * `setErrors`, so a 422 from the shop's API lands on the field it belongs to rather than in a
 * banner above the form. Every `Field*` injects it and removes **its own** entry the moment its
 * value changes — a server error is a statement about the value that was sent, so it stops being
 * true as soon as the customer edits it, and nothing else would reliably clear it (a rule that
 * already passes has no new message to overwrite it with).
 *
 * How long an entry survives a change to a *different* field is vee-validate's, not this key's.
 * Before the first submit — and with per-field `rules` at any time — only the changed field is
 * revalidated, so another field's server error stays put. After a submit, with a form-level
 * `validationSchema`, every already-validated field is revalidated on each change
 * (`validated-only`), and a field that now passes has its manually set error replaced by that
 * pass — so the server's message for it goes too. Send the current map with each response rather
 * than treating one as sticky; `src/vee-validate/__tests__/vee-validate.spec.ts` pins both halves.
 *
 * It is a plain `Ref`, so a consumer can provide one itself and drive server errors from outside a
 * `Form`:
 *
 * ```ts
 * import { API_ERRORS_KEY } from '@eldrajs/ui/vee-validate';
 * provide(API_ERRORS_KEY, ref({ email: 'That address is already subscribed.' }));
 * ```
 */
export const API_ERRORS_KEY: InjectionKey<Ref<Record<string, string>>> =
  Symbol('eldra-ui:api-errors');

/**
 * How a `Field*` tells the `Form` above it which element its error summary should link to.
 *
 * The summary lists one link per error and the anchor is the field's own control — the `id` a
 * `FieldWrapper` generated and tied its `<label for>` to, or the one the `Field*` handed the
 * control when it stands on its own. Only the `Field*` can resolve that, so it registers it here
 * rather than the `Form` guessing from the DOM.
 *
 * Internal: not exported from the entry. A `Field*` outside a `Form` injects nothing and registers
 * nothing.
 */
export interface FieldAnchorRegistry {
  /** Record (or update) the element id the field called `name` should be linked to. */
  register(name: string, id: string | undefined): void;
  /** Forget `name`, when the field unmounts or is renamed. */
  unregister(name: string): void;
}

/** The key a `Form` provides its {@link FieldAnchorRegistry} on. Internal to this entry. */
export const FIELD_ANCHORS_KEY: InjectionKey<FieldAnchorRegistry> =
  Symbol('eldra-ui:field-anchors');
