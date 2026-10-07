import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEldraClient, EldraHttpError } from '../client';
import {
  backoffDelayMs,
  isRetryableFetchError,
  parseRetryAfter,
  resolveRetryPolicy,
} from '../retry';

const API = 'https://api.example.test/api';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function refusal(status: number, retryAfter?: string): Response {
  return new Response(JSON.stringify({ code: 'TOO_MANY_REQUESTS' }), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
    },
  });
}

describe('sdk retry policy', () => {
  it('fills in the documented defaults', () => {
    expect(resolveRetryPolicy()).toEqual({ attempts: 5, baseDelayMs: 250, maxDelayMs: 5_000 });
    expect(resolveRetryPolicy({ attempts: 0 }).attempts).toBe(1);
  });

  it('doubles the backoff window, caps it, and reads Retry-After', () => {
    const policy = resolveRetryPolicy();
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, policy, () => 1))).toEqual([
      250, 500, 1000, 2000, 4000, 5000,
    ]);
    const now = Date.parse('2026-10-06T23:30:00Z');
    expect(parseRetryAfter('2', now)).toBe(2000);
    expect(parseRetryAfter('Tue, 06 Oct 2026 23:30:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe('sdk client retrying', () => {
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
      apiBaseUrl: API,
      orgId: 'org-123',
      retry,
      fetch: fetchMock as unknown as typeof fetch,
    });
  }

  it('retries a 429 once and waits exactly the Retry-After it was given', async () => {
    fetchMock.mockResolvedValueOnce(refusal(429, '2')).mockResolvedValueOnce(json({ data: [] }));

    const pending = client().cms.list('blog-post');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toEqual({ data: [] });
  });

  it('retries a 503 on the exponential backoff when no Retry-After is sent', async () => {
    fetchMock
      .mockImplementationOnce(() => refusal(503))
      .mockImplementationOnce(() => json({ data: [] }));

    const pending = client().catalog.listProducts();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Equal jitter puts the first wait between 125 ms and 250 ms.
    await vi.advanceTimersByTimeAsync(124);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(126);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(pending).resolves.toEqual({ data: [] });
  });

  it('retries a dropped connection and resolves once it comes back', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))
      .mockImplementationOnce(() => json({ data: [] }));

    const pending = client().catalog.listProducts();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries a malformed request, which would fail identically every time', async () => {
    const malformed = new TypeError('Failed to parse URL from not a url');
    fetchMock.mockRejectedValue(malformed);

    const pending = client().catalog.listProducts();
    const assertion = expect(pending).rejects.toBe(malformed);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the final 429 once the attempts are spent', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));

    const pending = client().catalog.listProducts();
    const assertion = expect(pending).rejects.toBeInstanceOf(EldraHttpError);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('never retries a non-idempotent request', async () => {
    fetchMock.mockImplementation(() => refusal(429, '1'));

    const pending = client().cart.addItem({ productId: 'p-1', variantId: 'v-1', quantity: 1 });
    const assertion = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a 404', async () => {
    fetchMock.mockImplementation(() => new Response('nope', { status: 404 }));

    const pending = client().catalog.getProduct('missing');
    const assertion = expect(pending).rejects.toMatchObject({ status: 404 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with the abort reason when the signal fires during the backoff', async () => {
    fetchMock.mockImplementation(() => refusal(429, '30'));
    const controller = new AbortController();
    const reason = new Error('build cancelled');

    const pending = client().request({
      path: '/cms/v1/schema/page/entry',
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort(reason);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry at all with attempts: 0', async () => {
    fetchMock.mockImplementation(() => refusal(503));

    const pending = client({ attempts: 0 }).catalog.listProducts();
    const assertion = expect(pending).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a consumer-supplied httpClient alone', async () => {
    const httpClient = vi.fn().mockRejectedValue(new Error('mine to retry'));
    const pending = createEldraClient({ apiBaseUrl: API, orgId: 'org-123', httpClient }).cms.list(
      'blog-post'
    );
    const assertion = expect(pending).rejects.toThrow('mine to retry');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(httpClient).toHaveBeenCalledTimes(1);
  });
});

describe('the two copies of the policy', () => {
  it('separates a network failure from a malformed request', () => {
    expect(isRetryableFetchError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableFetchError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableFetchError(new TypeError('Load failed'))).toBe(true);
    expect(
      isRetryableFetchError(
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
        })
      )
    ).toBe(true);
    // Malformed, not transient: every one of these fails the same way forever.
    expect(isRetryableFetchError(new TypeError('Failed to parse URL from not a url'))).toBe(false);
    expect(
      isRetryableFetchError(
        new TypeError('Headers.append: "bad header" is an invalid header name.')
      )
    ).toBe(false);
    expect(
      isRetryableFetchError(new TypeError('Request with GET/HEAD method cannot have body.'))
    ).toBe(false);
    expect(isRetryableFetchError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      false
    );
  });

  /**
   * `@eldrajs/theme-core` carries the same module, because the two packages have
   * independent HTTP layers and neither may import the other. Both files say
   * "keep the two in step"; this is what makes that safe. Everything after each
   * file's own header comment — the import line and the paragraph naming the
   * other package — must be byte-identical, so a rule fixed in one and not the
   * other fails here rather than in a build six months from now.
   */
  it('is byte-identical to theme-core’s, below the header comment', () => {
    const body = (path: string): string => {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      const headerEnd = source.indexOf('*/\n');
      expect(headerEnd).toBeGreaterThan(0);
      return source.slice(headerEnd + 3);
    };

    expect(body('../retry.ts')).toBe(body('../../../theme-core/src/retry.ts'));
  });
});
