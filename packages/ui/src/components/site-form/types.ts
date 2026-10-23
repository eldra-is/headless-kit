import type { EldraFormDefinition, EldraFormFieldType, EldraFormsClient } from '@eldrajs/sdk';
import type { UiMessages } from '../../messages/en-US';
import type { FormLayoutHeadingLevel } from '../form-layout/types';

/** What a form reads and submits through: `createEldraClient()`'s client, or anything shaped like its `forms`. */
export interface SiteFormClient {
  forms: Pick<EldraFormsClient, 'get' | 'submit'>;
}

/** A field with its texts resolved for one locale. */
export interface SiteFormField {
  id: string;
  type: EldraFormFieldType;
  required: boolean;
  label: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validation?: { minLength?: number; maxLength?: number; pattern?: string };
}

/** A form definition with every per-locale text resolved for one locale. */
export interface SiteFormDefinition {
  key: string;
  name: string;
  fields: SiteFormField[];
  honeypotField: string;
  turnstileSiteKey: string | null;
  successMessage: string;
  /** A `/` path or an absolute http(s) URL; anything else the platform sent is dropped. */
  successRedirect: string | null;
  /** The consent sentence of a subscribing form, `''` for any other form. */
  consentText: string;
}

/** A checkbox or consent field holds a boolean, every other field a string. */
export type SiteFormValue = string | boolean;

/** Whether the definition can be drawn yet. */
export type SiteFormStatus = 'loading' | 'failed' | 'ready';

export interface SiteFormSuccess {
  /** `true` when the form subscribes the visitor and a confirmation email is on its way. */
  pending: boolean;
  redirect: string | null;
}

/** `refused` is a `422`, `rate-limited` a `429`, `too-large` a `413`, `unavailable` anything else. */
export type SiteFormFailureReason = 'refused' | 'rate-limited' | 'too-large' | 'unavailable';

export interface SiteFormFailure {
  reason: SiteFormFailureReason;
  /** What the client threw; absent for a `422`, which the SDK resolves rather than throws. */
  cause?: unknown;
}

/** `invalid` means the visitor's answers failed the checks here and nothing was sent. */
export type SiteFormSubmitOutcome =
  | { kind: 'success'; success: SiteFormSuccess }
  | { kind: 'invalid' }
  | { kind: 'failed'; failure: SiteFormFailure }
  | { kind: 'ignored' };

export type SiteFormLayout = 'single' | 'two' | 'inline';

/** The parts `classes` restyles; which inner component each reaches is in the README, "Site forms". */
export type SiteFormPart =
  | 'root'
  | 'notice'
  | 'form'
  | 'heading'
  | 'errorSummary'
  | 'fields'
  | 'actions'
  | 'field'
  | 'label'
  | 'requiredMark'
  | 'optionalText'
  | 'error'
  | 'control'
  | 'checkbox'
  | 'turnstile'
  | 'consentText'
  | 'submit'
  | 'success'
  | 'successTitle'
  | 'successMessage';

export interface SiteFormProps {
  /** As `client.forms.get(key)` answers it, read in your data loader so the form is server-rendered. */
  definition?: EldraFormDefinition | null;
  /** The form's key, read with `client.forms.get` in the browser when there is no `definition`. */
  formKey?: string;
  /** Reads the definition and posts the submission. */
  client: SiteFormClient;
  /** The visitor's locale (`is-IS`): the labels shown and the language the platform answers in. */
  locale: string;
  /** Sent with the submission as the page it came from. Defaults to `location.pathname`. */
  pagePath?: string;
  /** `single` (default), `two`, or `inline` for a one-field sign-up (else it falls back to `single`). */
  layout?: SiteFormLayout;
  /** A visible heading; without one the form is named by the definition's `name`. */
  heading?: string;
  headingLevel?: FormLayoutHeadingLevel;
  /** The submit button's text. Defaults to the `formSubmit` message. */
  submitLabel?: string;
  /** Follows a site-path redirect (`navigateTo`); an absolute one always uses `location.assign`. */
  navigate?: (path: string) => void;
  messages?: Partial<UiMessages>;
  classes?: Partial<Record<SiteFormPart, string>>;
}
