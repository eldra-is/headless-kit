import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStorefront } from './useStorefront';
import { useTurnstile } from './useTurnstile';

/**
 * The spam protection of a platform form for a block that renders its own fields (`contact`,
 * `newsletter`, the footer's sign-up): the honeypot and the Cloudflare Turnstile the merchant may
 * turn on, both read from the form's definition (`forms.definition`), the way `blocks/form` does.
 * Without it Core rejects every submission of a form that has Turnstile on.
 *
 * A block renders `<FormHoneypot v-model="honeypot" :name="honeypotField" />` and, when `siteKey`
 * is set, an element bound to `turnstileRoot`; before it submits it asks `challenge()` (a message
 * to show, or `null` to go ahead) and spreads `signals()` into the submission. A definition that
 * has not loaded is not a reason to block: the platform decides.
 *
 * @param formKey the key of the form; empty reads nothing (a block that is not showing the form)
 */
export function useFormSpam(formKey: Ref<string>) {
  const { t } = useI18n();
  const definition = useStorefront().forms.definition(formKey);

  const honeypot = ref('');
  const turnstileRoot = ref<HTMLElement | null>(null);
  const honeypotField = computed(() => definition.data.value?.honeypotField ?? null);
  const siteKey = computed(() => definition.data.value?.turnstileSiteKey ?? null);
  /** The platform's consent sentence of a subscribing form (`{shop}` filled in, page locale), or ''. */
  const consentSentence = computed(() => (definition.data.value?.consentText ?? '').trim());
  const turnstile = useTurnstile(siteKey, turnstileRoot);

  /** Why the visitor cannot submit yet (Turnstile is on and not passed), or `null`. */
  function challenge(): string | null {
    if (siteKey.value === null || turnstile.token.value !== null) return null;
    return turnstile.failed.value ? t('form.turnstileFailed') : t('form.turnstileRequired');
  }

  /** The spam signals to send with a submission: a token is single-use, so reset after it. */
  function signals(): { turnstileToken?: string; hp?: string } {
    return {
      ...(turnstile.token.value ? { turnstileToken: turnstile.token.value } : {}),
      ...(honeypot.value ? { hp: honeypot.value } : {}),
    };
  }

  return {
    honeypot,
    honeypotField,
    siteKey,
    consentSentence,
    turnstileRoot,
    challenge,
    signals,
    reset: turnstile.reset,
  };
}
