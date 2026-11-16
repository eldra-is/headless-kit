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
 * A server error on a *different* field stays on screen while this one is edited: each `Field*`
 * holds the message it shows and changes it only at its own moments (its blur, a submit, its own
 * edit of a server error — see `useFieldControl`). Underneath, vee-validate may already have
 * dropped it: with a form-level `validationSchema`, validating one field revalidates every field
 * that has been validated before (`validated-only`), and a field that now passes has its manually
 * set error replaced by that pass. So the entry is gone for good at that field's next blur or the
 * next submit; send the current map with each response rather than treating one as sticky.
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

/**
 * How a `Field*` tells the `Form` above it which message it is **showing**, so the form's error
 * summary and its `errors` slot prop say exactly what the fields say, at the same moment.
 *
 * A field holds its displayed message itself (see `useFieldControl`): it changes on the field's
 * blur, on a submit, and on a value change only when the field asks for that. vee-validate's own
 * `errors` can move at other moments — a form-level schema revalidates already-validated fields
 * whenever any one of them is validated — so the form reads what the fields report rather than
 * `errors`.
 *
 * Internal: not exported from the entry.
 */
export interface FieldMessageRegistry {
  /** Record the message the field at `path` is showing; `undefined` while it shows none. */
  report(path: string, message: string | undefined): void;
  /** Forget `path`, when the field unmounts or is renamed. */
  forget(path: string): void;
  /**
   * Counts the submits whose validation has finished. A field reads its message again each time
   * it rises: that is the "on submit" moment, after the form has validated every field.
   */
  settled: Readonly<Ref<number>>;
}

/** The key a `Form` provides its {@link FieldMessageRegistry} on. Internal to this entry. */
export const FIELD_MESSAGES_KEY: InjectionKey<FieldMessageRegistry> =
  Symbol('eldra-ui:field-messages');
