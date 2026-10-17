import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_TIMEOUT_MS,
  readSiteIcons,
  resolveSiteIcons,
  SITE_ICONS_WARNING,
  type SiteIconsReader,
  type SiteIconsSetting,
} from '../src/runtime/siteIcons';

const reader = (request: SiteIconsReader['request']): SiteIconsReader => ({ request });

const SETTING: SiteIconsSetting = {
  revision: 4,
  iconUrl: 'https://cdn.example.test/brand.svg',
  backgroundColor: '#112233',
  themeColor: '#ff6600',
  shortName: 'Sóley',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('readSiteIcons', () => {
  it('passes the platform’s setting through and asks the documented path', async () => {
    const warn = vi.fn();
    const request = vi.fn(async () => SETTING);

    await expect(readSiteIcons(reader(request as never), warn)).resolves.toEqual(SETTING);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: '/site/v1/site-icons' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an unset icon as an answer, not a failure', async () => {
    const warn = vi.fn();
    const unset = { ...SETTING, iconUrl: null, themeColor: null, shortName: null };

    await expect(
      readSiteIcons(
        reader(async () => unset),
        warn
      )
    ).resolves.toEqual(unset);
    expect(warn).not.toHaveBeenCalled();
  });

  it('normalizes colour case and trims and cuts the short name to 12 characters', async () => {
    const result = await readSiteIcons(
      reader(async () => ({
        ...SETTING,
        backgroundColor: '#AABBCC',
        shortName: '  A very long short name  ',
      })),
      vi.fn()
    );

    expect(result?.backgroundColor).toBe('#aabbcc');
    expect(result?.shortName).toBe('A very long');
  });

  it('warns once and answers null with no client at all', async () => {
    const warn = vi.fn();

    await expect(readSiteIcons(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(SITE_ICONS_WARNING);
  });

  it('warns once with the cause when the reader throws', async () => {
    const warn = vi.fn();

    await expect(
      readSiteIcons(
        reader(async () => {
          throw new Error('503 Service Unavailable');
        }),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`${SITE_ICONS_WARNING} (503 Service Unavailable)`);
  });

  it.each([
    ['not an object', 'nope'],
    ['no revision', { ...SETTING, revision: undefined }],
    ['a bad background colour', { ...SETTING, backgroundColor: 'red' }],
    ['a bad theme colour', { ...SETTING, themeColor: '#fff' }],
    ['a non-string icon url', { ...SETTING, iconUrl: 7 }],
    ['a non-string short name', { ...SETTING, shortName: 7 }],
  ])('rejects a response with %s as unusable', async (_name, response) => {
    const warn = vi.fn();

    await expect(
      readSiteIcons(
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
    const pending = readSiteIcons(
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
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(`timed out after ${READ_TIMEOUT_MS}ms`);
  });
});

describe('resolveSiteIcons', () => {
  it('answers null — leave the theme alone — when nothing is set', () => {
    expect(resolveSiteIcons(null, { siteName: 'Acme' })).toBeNull();
    expect(resolveSiteIcons({ ...SETTING, iconUrl: null }, { siteName: 'Acme' })).toBeNull();
  });

  it('keeps the merchant’s own values', () => {
    expect(
      resolveSiteIcons(SETTING, { siteName: 'Acme Store', primaryToken: '#000000' })
    ).toMatchObject({
      themeColor: '#ff6600',
      shortName: 'Sóley',
      name: 'Acme Store',
      backgroundColor: '#112233',
    });
  });

  it('falls back to the primary token and the site name, cut to 12 characters', () => {
    expect(
      resolveSiteIcons(
        { ...SETTING, themeColor: null, shortName: null },
        { siteName: 'Acme Outdoor Supplies', primaryToken: '#4f46e5' }
      )
    ).toMatchObject({
      themeColor: '#4f46e5',
      shortName: 'Acme Outdoor',
      name: 'Acme Outdoor Supplies',
    });
  });

  it('leaves the theme colour and names empty when there is nothing to default to', () => {
    expect(
      resolveSiteIcons({ ...SETTING, themeColor: null, shortName: null }, { primaryToken: 'blue' })
    ).toMatchObject({ themeColor: null, shortName: null, name: null });
  });
});
