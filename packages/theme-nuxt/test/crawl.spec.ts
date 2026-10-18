import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CRAWL_WARNING,
  READ_TIMEOUT_MS,
  readCrawlSettings,
  type CrawlReader,
} from '../src/runtime/crawl';

const reader = (request: CrawlReader['request']): CrawlReader => ({ request });

const SETTING = { revision: 4, siteUrl: 'https://shop.example', robotsExtra: 'Disallow: /cart' };

afterEach(() => {
  vi.useRealTimers();
});

describe('readCrawlSettings', () => {
  it('passes the platform’s setting through and asks the documented path', async () => {
    const warn = vi.fn();
    const request = vi.fn(async () => SETTING);

    await expect(readCrawlSettings(reader(request as never), warn)).resolves.toEqual(SETTING);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: '/site/v1/crawl' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an unset url and no merchant lines as an answer, not a failure', async () => {
    const warn = vi.fn();

    await expect(
      readCrawlSettings(
        reader(async () => ({ revision: 1, siteUrl: null }) as never),
        warn
      )
    ).resolves.toEqual({ revision: 1, siteUrl: null, robotsExtra: '' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('reduces the site url to its origin', async () => {
    const result = await readCrawlSettings(
      reader(async () => ({ ...SETTING, siteUrl: 'https://shop.example/some/path/' }) as never),
      vi.fn()
    );
    expect(result?.siteUrl).toBe('https://shop.example');
  });

  it('warns once and answers null with no client at all', async () => {
    const warn = vi.fn();

    await expect(readCrawlSettings(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(CRAWL_WARNING);
  });

  it('warns once with the cause when the reader throws', async () => {
    const warn = vi.fn();

    await expect(
      readCrawlSettings(
        reader(async () => {
          throw new Error('503 Service Unavailable');
        }),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`${CRAWL_WARNING} (503 Service Unavailable)`);
  });

  it.each([
    ['not an object', 'nope'],
    ['no revision', { ...SETTING, revision: undefined }],
    ['a non-string site url', { ...SETTING, siteUrl: 7 }],
    ['a site url that is not a URL', { ...SETTING, siteUrl: 'shop' }],
    ['a non-http site url', { ...SETTING, siteUrl: 'ftp://shop.example' }],
    ['non-string robots lines', { ...SETTING, robotsExtra: 7 }],
  ])('rejects a response with %s as unusable', async (_name, response) => {
    const warn = vi.fn();

    await expect(
      readCrawlSettings(
        reader(async () => response as never),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('unusable response');
  });

  it('gives up after the read timeout and aborts the request', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const pending = readCrawlSettings(
      reader(
        (options) =>
          new Promise((_resolve, reject) => {
            signal = options.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(signal?.reason));
          })
      ),
      warn
    );

    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledWith(`${CRAWL_WARNING} (timed out after ${READ_TIMEOUT_MS}ms)`);
  });
});
