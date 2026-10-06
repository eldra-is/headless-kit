import type { EldraRetryOptions } from './clientTypes';

/**
 * Retrying a read the gateway refused *for now*.
 *
 * The web gateway rate-limits a client by requests per minute. A static build
 * of a real site is thousands of reads from one address in a few minutes, so a
 * `generate` run meets that limit routinely: the gateway answers `429`, the
 * route the read belonged to cannot be resolved, and a prerender configured to
 * fail on an error (which it should be — the alternative is an artifact
 * silently missing pages) takes the whole build down. The same is true of a
 * `503` while the gateway is restarting, and of a connection the network drops
 * under a long build.
 *
 * None of those is an answer: asking again a moment later gets one. So the
 * client asks again — but only for a request that may safely be repeated, and
 * only for a status that says "not now" rather than "no".
 *
 * The same rules exist in `@eldrajs/sdk`'s own transport, because the two
 * packages have independent HTTP layers on purpose: neither may import the
 * other (a framework-free public package imports nothing outside its own
 * folder), and a static build reads through both — pages and route templates
 * here, commerce documents there. Keep the two in step.
 */

/** Total attempts, including the first: at most five tries per request. */
export const DEFAULT_RETRY_ATTEMPTS = 5;
/** First backoff window, doubling per attempt. */
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;
/** Ceiling on the *computed* backoff. A `Retry-After` is honoured beyond it. */
export const DEFAULT_RETRY_MAX_DELAY_MS = 5_000;

/**
 * Ceiling on a honoured `Retry-After`. The header is the gateway's own answer
 * and is followed as given — but a build must not be hostage to one: a limit
 * counted per minute never needs longer than this, and a header that asks for
 * an hour (a misconfiguration, or a proxy in front of the gateway) would
 * otherwise hang a build with nothing said.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

/** `429` is the rate limit itself; `503` is a gateway that is not up yet. */
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 503]);

/**
 * Methods that may be repeated. Idempotence is the whole test: a `POST` that
 * timed out may well have been applied, so asking again could duplicate it.
 * Every gateway *read* is one of these.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Transport failures worth repeating. `fetch` reports a dropped connection as a
 * `TypeError` (undici's `fetch failed`, whose `cause` carries the real code),
 * and a raw socket error carries one of these codes directly.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

export interface ResolvedRetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * The policy a client was built with, with every unset or nonsensical value
 * filled in. `attempts` counts the first try, so `1` — and `0`, which is what a
 * consumer writes to mean "do not retry" — is one request and no waiting.
 */
export function resolveRetryPolicy(options?: EldraRetryOptions): ResolvedRetryPolicy {
  return {
    attempts: positive(options?.attempts, DEFAULT_RETRY_ATTEMPTS, 1),
    baseDelayMs: positive(options?.baseDelayMs, DEFAULT_RETRY_BASE_DELAY_MS, 0),
    maxDelayMs: positive(options?.maxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS, 0),
  };
}

function positive(value: number | undefined, fallback: number, floor: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(floor, value);
}

export function isIdempotentMethod(method: string | undefined): boolean {
  return IDEMPOTENT_METHODS.has((method ?? 'GET').toUpperCase());
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Whether this rejection is the caller's own abort rather than a failure. */
export function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { name?: unknown }).name === 'AbortError'
  );
}

export function isRetryableFetchError(cause: unknown): boolean {
  if (isAbortError(cause)) return false;
  if (cause instanceof TypeError) return true;
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && RETRYABLE_ERROR_CODES.has(code);
}

/**
 * `Retry-After` as milliseconds to wait, or `null` when the header is absent or
 * is neither a delay in seconds nor an HTTP-date. An HTTP-date already in the
 * past is "now", never a negative wait.
 */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (raw === '') return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return clampRetryAfter(Number(raw) * 1000);
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return null;
  return clampRetryAfter(date - nowMs);
}

function clampRetryAfter(ms: number): number {
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms));
}

/**
 * `baseDelayMs × 2^attempt`, capped, with equal jitter: half the window is
 * fixed and half is random, so several builds (or several reads of one build)
 * throttled by the same burst do not all come back in the same millisecond.
 * `attempt` is zero-based — the index of the try that just failed.
 */
export function backoffDelayMs(
  attempt: number,
  policy: ResolvedRetryPolicy,
  random: () => number = Math.random
): number {
  const window = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  return window / 2 + random() * (window / 2);
}

/** Test seams: the two sources of non-determinism, injectable. */
export interface RetryDeps {
  random?: () => number;
  now?: () => number;
}

/**
 * `fetch`, repeated while the answer is "not now".
 *
 * The caller's `AbortSignal` ends it immediately, during a wait as much as
 * during a request: the rejection is the signal's own reason, so an aborted
 * read is indistinguishable from one `fetch` aborted itself. A response that is
 * going to be retried has its body released first — an unread body keeps the
 * connection open, and a build makes thousands of these.
 */
export async function fetchWithRetry(
  doFetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  policy: ResolvedRetryPolicy,
  deps: RetryDeps = {}
): Promise<Response> {
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const signal = (init.signal ?? undefined) as AbortSignal | undefined;
  const mayRetry = policy.attempts > 1 && isIdempotentMethod(init.method);

  for (let attempt = 0; ; attempt += 1) {
    const lastAttempt = attempt >= policy.attempts - 1;
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      if (!mayRetry || lastAttempt || !isRetryableFetchError(cause)) throw cause;
      await wait(backoffDelayMs(attempt, policy, random), signal);
      continue;
    }
    if (!mayRetry || lastAttempt || !isRetryableStatus(response.status)) return response;
    const retryAfter = parseRetryAfter(headerOf(response, 'retry-after'), now());
    releaseBody(response);
    await wait(retryAfter ?? backoffDelayMs(attempt, policy, random), signal);
  }
}

function headerOf(response: Response, name: string): string | null {
  const headers = (response as { headers?: { get?: (key: string) => string | null } }).headers;
  return headers?.get?.(name) ?? null;
}

function releaseBody(response: Response): void {
  try {
    const body = (response as { body?: { cancel?: () => Promise<unknown> } | null }).body;
    void body?.cancel?.().catch(() => {
      // Releasing a body is housekeeping: nothing here can act on its failure.
    });
  } catch {
    // A response without a readable body (a test double, an already-read one)
    // has nothing to release.
  }
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortReason(signal));
      return;
    }
    let onAbort: (() => void) | undefined;
    const timer = setTimeout(() => {
      if (onAbort !== undefined) signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal !== undefined) {
      onAbort = () => {
        clearTimeout(timer);
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function abortReason(signal: AbortSignal): unknown {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason !== undefined) return reason;
  return new DOMException('This operation was aborted', 'AbortError');
}
