import type { EldraFormDefinition } from '@eldrajs/sdk';
import {
  computed,
  onMounted,
  reactive,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { useMessages } from '../../composables/useMessages';
import type { UiMessages } from '../../messages/en-US';
import { isBooleanField, localizeSiteForm } from './localize';
import { useTurnstile } from './turnstile';
import type {
  SiteFormClient,
  SiteFormDefinition,
  SiteFormFailureReason,
  SiteFormField,
  SiteFormStatus,
  SiteFormSubmitOutcome,
  SiteFormSuccess,
  SiteFormValue,
} from './types';
import { validateSiteFormValue } from './validate';

export interface UseSiteFormOptions {
  /** A definition already read; when absent the form reads `formKey` in the browser. */
  definition?: MaybeRefOrGetter<EldraFormDefinition | null | undefined>;
  formKey?: MaybeRefOrGetter<string | undefined>;
  client: MaybeRefOrGetter<SiteFormClient>;
  locale: MaybeRefOrGetter<string>;
  /** Defaults to `location.pathname` at submit time. */
  pagePath?: MaybeRefOrGetter<string | undefined>;
  messages?: MaybeRefOrGetter<Partial<UiMessages> | undefined>;
}

export interface UseSiteFormReturn {
  form: ComputedRef<SiteFormDefinition | null>;
  status: ComputedRef<SiteFormStatus>;
  values: Record<string, SiteFormValue>;
  /** One message per field id, from the checks here or the platform's `422`. */
  errors: Record<string, string | undefined>;
  /** Messages about the form as a whole: a refused spam check, a rate limit, the network. */
  formErrors: Ref<string[]>;
  /** Bind to the honeypot input the definition names. */
  honeypot: Ref<string>;
  /** Bind to the element the Turnstile widget renders into, shown while `turnstileSiteKey` is set. */
  turnstileRoot: Ref<HTMLElement | null>;
  submitting: Ref<boolean>;
  success: Ref<SiteFormSuccess | null>;
  setValue(id: string, value: SiteFormValue): void;
  submit(): Promise<SiteFormSubmitOutcome>;
  /** Back to an empty form, after a success too. */
  reset(): void;
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = (error as { status: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function failureReason(error: unknown): SiteFormFailureReason {
  const status = statusOf(error);
  if (status === 429) return 'rate-limited';
  if (status === 413) return 'too-large';
  return 'unavailable';
}

function emptyValue(field: SiteFormField): SiteFormValue {
  return isBooleanField(field) ? false : '';
}

/** One Eldra form's state, checks, honeypot, Turnstile and submission; `SiteForm` is drawn from it. */
export function useSiteForm(options: UseSiteFormOptions): UseSiteFormReturn {
  const m = useMessages(() => toValue(options.messages));

  const fetched = shallowRef<EldraFormDefinition | null>(null);
  const loading = ref(false);
  const mounted = ref(false);
  let readId = 0;

  const raw = computed(() => toValue(options.definition) ?? fetched.value);
  const form = computed<SiteFormDefinition | null>(() => {
    const definition = raw.value;
    if (!definition) return null;
    try {
      return localizeSiteForm(definition, toValue(options.locale));
    } catch {
      return null;
    }
  });

  const status = computed<SiteFormStatus>(() => {
    if (form.value) return 'ready';
    if (raw.value) return 'failed';
    const key = toValue(options.formKey);
    if (key && (loading.value || !mounted.value)) return 'loading';
    return 'failed';
  });

  async function read(key: string): Promise<void> {
    const id = ++readId;
    loading.value = true;
    try {
      const definition = await toValue(options.client).forms.get(key);
      if (id === readId) fetched.value = definition;
    } catch {
      if (id === readId) fetched.value = null;
    } finally {
      if (id === readId) loading.value = false;
    }
  }

  onMounted(() => {
    mounted.value = true;
    watch(
      () => [toValue(options.definition), toValue(options.formKey)] as const,
      ([definition, key]) => {
        if (definition || !key) {
          readId++;
          loading.value = false;
          return;
        }
        if (fetched.value?.key !== key) void read(key);
      },
      { immediate: true }
    );
  });

  const values = reactive<Record<string, SiteFormValue>>({});
  const errors = reactive<Record<string, string | undefined>>({});
  const formErrors = ref<string[]>([]);
  const honeypot = ref('');
  const submitting = ref(false);
  const success = ref<SiteFormSuccess | null>(null);
  let submissionId = 0;
  const turnstileRoot = ref<HTMLElement | null>(null);

  const turnstileKey = computed(() =>
    success.value ? null : (form.value?.turnstileSiteKey ?? null)
  );
  const turnstile = useTurnstile(turnstileKey, turnstileRoot);

  function clear(): void {
    submissionId += 1;
    submitting.value = false;
    for (const id of Object.keys(values)) delete values[id];
    for (const id of Object.keys(errors)) delete errors[id];
    formErrors.value = [];
    honeypot.value = '';
    success.value = null;
  }

  watch(
    () => form.value?.key,
    () => clear()
  );
  watch(
    () => form.value?.fields,
    (fields) => {
      const ids = new Set((fields ?? []).map((field) => field.id));
      for (const id of Object.keys(values)) if (!ids.has(id)) delete values[id];
      for (const field of fields ?? []) {
        const current = values[field.id];
        const wantsBoolean = isBooleanField(field);
        if (current === undefined || (typeof current === 'boolean') !== wantsBoolean) {
          values[field.id] = emptyValue(field);
        }
      }
    },
    { immediate: true }
  );

  function setValue(id: string, value: SiteFormValue): void {
    values[id] = value;
    errors[id] = undefined;
  }

  function validate(definition: SiteFormDefinition): boolean {
    let valid = true;
    for (const field of definition.fields) {
      const message = validateSiteFormValue(field, values[field.id], m.value);
      errors[field.id] = message ?? undefined;
      if (message !== null) valid = false;
    }
    return valid;
  }

  function showRefusal(
    definition: SiteFormDefinition,
    fieldMessages: Record<string, string[]>,
    formMessages: string[]
  ): void {
    const rendered = new Set(definition.fields.map((field) => field.id));
    for (const field of definition.fields) errors[field.id] = fieldMessages[field.id]?.[0];
    const orphaned = Object.entries(fieldMessages)
      .filter(([id]) => !rendered.has(id))
      .flatMap(([, messages]) => messages);
    const summary = [...formMessages, ...orphaned];
    const marksAField = definition.fields.some((field) => errors[field.id] !== undefined);
    formErrors.value = summary.length > 0 || marksAField ? summary : [m.value.formRefused];
  }

  async function submit(): Promise<SiteFormSubmitOutcome> {
    const definition = form.value;
    if (!definition || submitting.value || success.value) return { kind: 'ignored' };
    formErrors.value = [];
    if (!validate(definition)) return { kind: 'invalid' };
    if (definition.turnstileSiteKey !== null && turnstile.token.value === null) {
      formErrors.value = [
        turnstile.failed.value ? m.value.formSpamCheckFailed : m.value.formSpamCheckRequired,
      ];
      return { kind: 'invalid' };
    }

    const submission: Record<string, SiteFormValue> = {};
    for (const field of definition.fields) submission[field.id] = values[field.id] ?? '';
    const token = turnstile.token.value;
    const pagePath =
      toValue(options.pagePath) ?? (typeof window === 'undefined' ? '/' : window.location.pathname);

    const id = ++submissionId;
    submitting.value = true;
    let answer: Awaited<ReturnType<SiteFormClient['forms']['submit']>>;
    try {
      answer = await toValue(options.client).forms.submit(definition.key, {
        values: submission,
        locale: toValue(options.locale),
        pagePath,
        ...(token ? { turnstileToken: token } : {}),
        ...(honeypot.value ? { hp: honeypot.value } : {}),
      });
    } catch (cause) {
      if (id !== submissionId) return { kind: 'ignored' };
      submitting.value = false;
      turnstile.reset();
      const reason = failureReason(cause);
      formErrors.value = [
        reason === 'rate-limited'
          ? m.value.formRateLimited
          : reason === 'too-large'
            ? m.value.formTooLarge
            : m.value.formUnavailable,
      ];
      return { kind: 'failed', failure: { reason, cause } };
    }
    if (id !== submissionId) return { kind: 'ignored' };
    submitting.value = false;

    if (answer.status === 'ok') {
      success.value = { pending: answer.pending, redirect: definition.successRedirect };
      return { kind: 'success', success: success.value };
    }
    turnstile.reset();
    showRefusal(definition, answer.errors, answer.form);
    return { kind: 'failed', failure: { reason: 'refused' } };
  }

  function reset(): void {
    const fields = form.value?.fields ?? [];
    clear();
    for (const field of fields) values[field.id] = emptyValue(field);
  }

  return {
    form,
    status,
    values,
    errors,
    formErrors,
    honeypot,
    turnstileRoot,
    submitting,
    success,
    setValue,
    submit,
    reset,
  };
}
