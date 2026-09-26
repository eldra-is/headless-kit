import { shallowRef, type Ref } from 'vue';
import type { ToastAction, ToastVariant } from '../components/toast/types';

export interface ToastOptions {
  /** Icon, colour and default auto-dismiss timing. Default `"success"`. */
  variant?: ToastVariant;
  /** The message. Required — the meaning is always in this text. */
  title: string;
  /** One supporting line. */
  text?: string;
  /** One action: a link (`{ label, href }`) or a button (`{ label, onActivate }`). */
  action?: ToastAction;
  /** Auto-dismiss time in ms; `0` stays until closed. Ignored for `variant: "danger"` — it is
   *  always `0` (spec "Toast" -> Properties, `duration` row: "Danger is always `0`."). Defaults to
   *  the variant's own timing (see `DEFAULT_DURATION` below) when omitted. */
  duration?: number;
  /** Dedupe key: a new toast raised with an `id` already in the queue replaces that toast in
   *  place (same position, a fresh full-length timer) rather than adding a second one. */
  id?: string;
}

/** A resolved, queued toast — what `Toaster`/`Toast` actually render. Every optional field of
 *  `ToastOptions` this carries forward stays optional; `id`, `variant` and `duration` are always
 *  resolved (never `undefined`) by the time an item reaches the queue. */
export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  text?: string;
  action?: ToastAction;
  duration: number;
}

export interface UseToastReturn {
  /** Raises a toast, returning its id (generated unless `options.id` is given) — hand it to a
   *  later `dismiss` to close it early, e.g. once the "Try again" it offered has finished. */
  show(options: ToastOptions): string;
  /** Closes a toast immediately, if it is still in the queue. */
  dismiss(id: string): void;
  /** Empties the queue. */
  clear(): void;
  /** The live queue `Toaster` renders — read-only from here; `Toaster` alone removes a toast
   *  whose own timer has run out (see its doc comment). */
  toasts: Readonly<Ref<ToastItem[]>>;
}

/**
 * Spec "Toast" -> Variants, the "Timing" column: success 6s, warning 10s, danger "stays until
 * closed" — folded into `0` here so `duration <= 0` means "no timer" everywhere this is read,
 * matching the Properties table's own `duration: 0` = "stays until closed".
 */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 6000,
  warning: 10000,
  danger: 0,
};

/** Spec "Toast" -> Behaviour & motion: "At most three at once; the newest is at the bottom; the
 *  oldest leaves when a fourth arrives." */
const MAX_TOASTS = 3;

let counter = 0;

/** Not `useUiId` (Vue's `useId()`): this store is module-level, outside any component's `setup()`,
 *  so there is no active component instance for `useId()` to key off. A plain incrementing counter
 *  is enough — nothing here ever runs on the server (see this file's own doc comment below), so
 *  there is no hydration mismatch to worry about either. */
function generateId(): string {
  counter += 1;
  return `eldra-toast-${counter}`;
}

function resolveDuration(variant: ToastVariant, duration: number | undefined): number {
  if (variant === 'danger') return 0;
  return duration ?? DEFAULT_DURATION[variant];
}

/**
 * The one toast queue for the whole app — a module-level store, not a `provide`d instance, the
 * same shape `dialogStack.ts` uses for the single modal slot. The design spec's region is "placed
 * once in the app layout" (spec "Toast" -> Properties), and a toast is often raised from code with
 * no `provide`/`inject` ancestry to a `Toaster` at all (a fetch error handler, a cart store) — so
 * the hand-off is a plain shared reference every caller reads and writes, exactly `TOAST_HOST_KEY`'s
 * own reasoning (see `dialogStack.ts`).
 *
 * **SSR-safe**: nothing here touches `window`/`document`, and no timer starts at this layer —
 * `Toaster.vue` (the one mounted, client-side host) owns every timer, pausing and resuming them on
 * hover/focus, per its own doc comment. A `show()` called before any `Toaster` has mounted (or
 * during SSR) just queues the item; it renders the moment a `Toaster` exists to read `toasts` from.
 */
const toasts = shallowRef<ToastItem[]>([]);

function show(options: ToastOptions): string {
  const variant = options.variant ?? 'success';
  const id = options.id ?? generateId();
  const item: ToastItem = {
    id,
    variant,
    title: options.title,
    text: options.text,
    action: options.action,
    duration: resolveDuration(variant, options.duration),
  };

  const existingIndex = toasts.value.findIndex((toast) => toast.id === id);
  if (existingIndex !== -1) {
    // Dedupe (spec "Toast" -> Properties, `id` row): "a new toast with the same id replaces the
    // old one" — in place, not moved to the end, so a toast an app keeps re-showing (a live
    // progress update) does not keep hopping to the bottom of the stack.
    const next = toasts.value.slice();
    next[existingIndex] = item;
    toasts.value = next;
    return id;
  }

  const next = [...toasts.value, item];
  // "the oldest leaves when a fourth arrives" — drop from the front, keep the `MAX_TOASTS` most
  // recent, so the newest (just pushed, at the end) always survives.
  toasts.value = next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
  return id;
}

function dismiss(id: string): void {
  if (!toasts.value.some((toast) => toast.id === id)) return;
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

function clear(): void {
  toasts.value = [];
}

/**
 * The toast queue (design spec "Toast"). `show`/`dismiss`/`clear` mutate the one module-level
 * queue every call to `useToast()` shares — see the store's own comment above for why this is not
 * a `provide`d instance. `toasts` is what a `Toaster` renders.
 *
 * ```ts
 * const toast = useToast();
 * toast.show({ variant: 'success', title: 'Added to cart', action: { label: 'View cart (3)', href: '/cart' } });
 * ```
 */
export function useToast(): UseToastReturn {
  return { show, dismiss, clear, toasts: toasts as Readonly<Ref<ToastItem[]>> };
}
