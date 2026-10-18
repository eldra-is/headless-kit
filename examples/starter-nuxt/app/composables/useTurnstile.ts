import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    }
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page; a failed load is forgotten so a later form retries. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile missing'));
    };
    script.onerror = () => reject(new Error('turnstile failed to load'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile for one form: renders the widget into `container` once a `siteKey` is
 * known (the merchant turned it on) and exposes the visitor's `token`. Nothing loads without a
 * site key, so a form on a site that never enabled Turnstile makes no third-party request.
 *
 * `token` is `null` until the visitor passes the check, again after it expires, and after
 * `reset()` — which a form calls after every submit, since a token is single-use. `failed` is true
 * when the script or the check could not run, so the form can say so instead of waiting forever.
 * Browser only: on the server (prerender) it does nothing.
 */
export function useTurnstile(siteKey: Ref<string | null>, container: Ref<HTMLElement | null>) {
  const token = ref<string | null>(null);
  const failed = ref(false);
  let api: TurnstileApi | null = null;
  let widgetId: string | null = null;

  async function mount(): Promise<void> {
    if (typeof window === 'undefined' || !siteKey.value || !container.value || widgetId !== null) {
      return;
    }
    const el = container.value;
    const key = siteKey.value;
    try {
      api = await loadTurnstile();
      // The form may have gone away, or changed key, while the script loaded.
      if (container.value !== el || siteKey.value !== key || widgetId !== null) return;
      widgetId = api.render(el, {
        sitekey: key,
        callback: (value) => {
          token.value = value;
          failed.value = false;
        },
        'expired-callback': () => {
          token.value = null;
        },
        'error-callback': () => {
          token.value = null;
          failed.value = true;
        },
      });
    } catch {
      failed.value = true;
    }
  }

  function remove(): void {
    if (api && widgetId !== null) api.remove(widgetId);
    widgetId = null;
    token.value = null;
  }

  function reset(): void {
    token.value = null;
    if (api && widgetId !== null) api.reset(widgetId);
  }

  watch([siteKey, container], () => {
    if (widgetId !== null && (!container.value || !siteKey.value)) remove();
    void mount();
  });
  onBeforeUnmount(remove);

  return { token, failed, reset, mount };
}
