import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEldraClient } from '../client';
import { EldraClientError } from '../clientTypes';
import {
  backoffDelayMs,
  fetchWithRetry,
  isIdempotentMethod,
  isRetryableFetchError,
  parseRetryAfter,
  resolveRetryPolicy,
} from '../retry';

const GATEWAY = 'https://gateway.example.test';
const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function entry(id = 'entry-1'): Response {
  return new Response(JSON.stringify({ id, data: {} }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function refusal(status: number, retryAfter?: string): Response {
  return new Response('too many requests; slow down and try again', {
    status,
    headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
  });
}

describe('retry policy', () => {
  it('fills in the documented defaults', () => {
    expect(resolveRetryPolicy()).toEqual({ attempts: 5, baseDelayMs: 250, maxDelayMs: 5_000 });
  });

  it('treats attempts: 0 as "one request, no retrying"', () => {
    expect(resolveRetryPolicy({ attempts: 0 }).attempts).toBe(1);
  });

  it('ignores a nonsensical value rather than waiting forever on it', () => {
    expect(resolveRetryPolicy({ attempts: Number.NaN, baseDelayMs: -1 })).toEqual({
      attempts: 5,
      baseDelayMs: 0,
      maxDelayMs: 5_000,
    });
  });

  it('only repeats idempotent methods', () => {
    expect(isIdempotentMethod(undefined)).toBe(true);
    expect(isIdempotentMethod('get')).toBe(true);
    expect(isIdempotentMethod('HEAD')).toBe(true);
    expect(isIdempotentMethod('POST')).toBe(false);
    expect(isIdempotentMethod('PATCH')).toBe(false);
  });

  it('doubles the backoff window and caps it', () => {
    const policy = resolveRetryPolicy();
    const upper = (attempt: number) => backoffDelayMs(attempt, policy, () => 1);
    expect([0, 1, 2, 3, 4, 5].map(upper)).toEqual([250, 500, 1000, 2000, 4000, 5000]);
    // Equal jitter: never less than half the window, never more than it.
    expect(backoffDelayMs(2, policy, () => 0)).toBe(500);
  });

  it('separates a network failure from a malformed request', () => {
    expect(isRetryableFetchError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableFetchError(new TypeError('Failed to fetch'))).toBe(true);
    expect(
      isRetryableFetchError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
    ).toBe(true);
    // Malformed, not transient: every one of these fails the same way forever,
    // so repeating it only spends a build's time on a bug that cannot succeed.
    expect(isRetryableFetchError(new TypeError('Failed to parse URL from not a url'))).toBe(false);
    expect(
      isRetryableFetchError(
        new TypeError('Headers.append: "bad header" is an invalid header name.')
      )
    ).toBe(false);
    expect(isRetryableFetchError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      false
    );
  });

  it('reads Retry-After as seconds or as an HTTP-date', () => {
    const now = Date.parse('2026-10-06T23:30:00Z');
    expect(parseRetryAfter('2', now)).toBe(2000);
    expect(parseRetryAfter(' 30 ', now)).toBe(30_000);
    expect(parseRetryAfter('Tue, 06 Oct 2026 23:30:05 GMT', now)).toBe(5000);
    // A date already past is "now", never a negative wait.
    expect(parseRetryAfter('Tue, 06 Oct 2026 23:29:00 GMT', now)).toBe(0);
    // Capped, so a misconfigured header cannot hang a build.
    expect(parseRetryAfter('3600', now)).toBe(60_000);
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter('soon', now)).toBeNull();
  });
});

describe('createEldraClient retrying', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function client(retry?: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number }) {
    return createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      retry,
      fetch: fetchMock as unknown as typeof fetch,
    });
  }

  it('retries a 429 once and waits exactly the Retry-After it was given', async () => {
    fetchMock.mockResolvedValueOnce(refusal(429, '2')).mockResolvedValueOnce(entry());

    const pending = client().getEntry('page', 'entry-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // One millisecond short of the header's two seconds: still waiting.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toMatchObject({ id: 'entry-1' });
  });

  it('falls back to the exponential backoff when no Retry-After is sent', async () => {
    fetchMock.mockResolvedValueOnce(refusal(503)).mockResolvedValueOnce(entry());

    const pending = client().getEntry('page', 'entry-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Equal jitter puts the first wait between 125 ms and 250 ms.
    await vi.advanceTimersByTimeAsync(124);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(126);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toMatchObject({ id: 'entry-1' });
  });

  it('surfaces the final 429 once the attempts are spent', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));

    const pending = client().getEntry('page', 'entry-1');
    const assertion = expect(pending).rejects.toBeInstanceOf(EldraClientError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    // Five attempts, the first included — not a sixth.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('reports the refusal as the gateway sent it', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));
    const pending = client({ attempts: 2 }).getEntry('page', 'entry-1');
    const assertion = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a non-idempotent request', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));

    const pending = client().resolveEntryList({ schemas: ['page'] });
    const assertion = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('never retries a 404', async () => {
    fetchMock.mockImplementation(() => new Response('no such entry', { status: 404 }));

    const pending = client().getEntry('page', 'missing');
    const assertion = expect(pending).rejects.toMatchObject({ status: 404 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a malformed request, which would fail identically every time', async () => {
    const malformed = new TypeError('Failed to parse URL from not a url');
    fetchMock.mockRejectedValue(malformed);

    const pending = client().getEntry('page', 'entry-1');
    const assertion = expect(pending).rejects.toBe(malformed);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped connection and resolves once it comes back', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce(entry());

    const pending = client().getEntry('page', 'entry-1');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toMatchObject({ id: 'entry-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry at all with attempts: 0', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));

    const pending = client({ attempts: 0 }).getEntry('page', 'entry-1');
    const assertion = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWithRetry and the caller’s signal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with the abort reason when the signal fires during the backoff', async () => {
    const doFetch = vi.fn().mockImplementation(() => refusal(429, '30'));
    const controller = new AbortController();
    const reason = new Error('build cancelled');

    const pending = fetchWithRetry(
      doFetch as unknown as typeof globalThis.fetch,
      `${GATEWAY}/cms/v1/schema/page/entry`,
      { method: 'GET', signal: controller.signal },
      resolveRetryPolicy()
    );
    const assertion = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(doFetch).toHaveBeenCalledTimes(1);

    controller.abort(reason);
    await assertion;
    // Aborted mid-wait: the second attempt was never made.
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when the signal is already aborted', async () => {
    const doFetch = vi.fn().mockImplementation(() => refusal(429));
    const controller = new AbortController();
    controller.abort(new Error('gone'));

    const pending = fetchWithRetry(
      doFetch as unknown as typeof globalThis.fetch,
      `${GATEWAY}/cms/v1/schema/page/entry`,
      { method: 'GET', signal: controller.signal },
      resolveRetryPolicy()
    );
    const assertion = expect(pending).rejects.toThrow('gone');
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    // The first attempt is `fetch`'s own to refuse; the retry is this layer's.
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
});
