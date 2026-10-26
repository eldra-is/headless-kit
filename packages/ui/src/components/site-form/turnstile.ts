import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once per page; a failed load is forgotten so the next form retries. */
function loadTurnstile(): Promise<TurnstileApi> {
  const win = window as TurnstileWindow;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      win.turnstile ? resolve(win.turnstile) : reject(new Error('Turnstile did not start'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Turnstile could not load'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

/** Cloudflare Turnstile in `container` while `siteKey` is set; nothing loads without one. */
export function useTurnstile(siteKey: Ref<string | null>, container: Ref<HTMLElement | null>) {
  const token = ref<string | null>(null);
  const failed = ref(false);
  let api: TurnstileApi | null = null;
  let widgetId: string | null = null;

  async function mount(): Promise<void> {
    const element = container.value;
    const key = siteKey.value;
    if (typeof window === 'undefined' || !element || !key || widgetId !== null) return;
    try {
      api = await loadTurnstile();
      if (container.value !== element || siteKey.value !== key || widgetId !== null) return;
      widgetId = api.render(element, {
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
    const id = widgetId;
    widgetId = null;
    token.value = null;
    if (api && id !== null) {
      try {
        api.remove(id);
      } catch {
        // The widget's element may already be gone with the form.
      }
    }
  }

  function reset(): void {
    token.value = null;
    if (api && widgetId !== null) {
      try {
        api.reset(widgetId);
      } catch {
        failed.value = true;
      }
    }
  }

  watch([siteKey, container], ([key, element], [previousKey, previousElement]) => {
    if (widgetId !== null && (key !== previousKey || element !== previousElement)) remove();
    void mount();
  });
  onBeforeUnmount(remove);

  return { token, failed, reset };
}

/** Test seam: forgets the page-wide script promise. */
export function resetTurnstileLoaderForTests(): void {
  scriptPromise = null;
}
