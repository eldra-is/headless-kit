import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_TIMEOUT_MS,
  readSiteProfile,
  resolveSiteProfile,
  SITE_PROFILE_WARNING,
  type SiteProfileReader,
  type SiteProfileSetting,
} from '../src/runtime/siteProfile';

const reader = (request: SiteProfileReader['request']): SiteProfileReader => ({ request });

const SETTING: SiteProfileSetting = {
  revision: 3,
  name: 'Acme Ltd',
  logoUrl: 'https://media.example.test/logo.png',
  sameAs: ['https://social.example.test/acme'],
  contact: { email: 'hi@acme.test', telephone: '+3545551234' },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('readSiteProfile', () => {
  it('passes the platform’s profile through and asks the documented path', async () => {
    const warn = vi.fn();
    const request = vi.fn(async () => SETTING);

    await expect(readSiteProfile(reader(request as never), warn)).resolves.toEqual(SETTING);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/site/v1/site-profile' })
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an empty profile as an answer, not a failure', async () => {
    const warn = vi.fn();
    const empty = {
      revision: 1,
      name: null,
      logoUrl: null,
      sameAs: [],
      contact: { email: null, telephone: null },
    };

    await expect(
      readSiteProfile(
        reader(async () => empty),
        warn
      )
    ).resolves.toEqual(empty);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops a non-https link and logo instead of writing it, and trims text', async () => {
    const result = await readSiteProfile(
      reader(async () => ({
        ...SETTING,
        name: '  Acme  ',
        logoUrl: 'http://media.example.test/logo.png',
        sameAs: ['https://a.example.test/x', 'http://b.example.test/y', 'not a url'],
      })),
      vi.fn()
    );
    expect(result).toMatchObject({
      name: 'Acme',
      logoUrl: null,
      sameAs: ['https://a.example.test/x'],
    });
  });

  it('warns once and answers null for no client, a failure and a malformed answer', async () => {
    for (const r of [
      null,
      reader(async () => {
        throw new Error('503');
      }),
      reader(async () => ({ revision: 1, name: 4 })),
      reader(async () => ({ ...SETTING, sameAs: 'https://x.test' })),
      reader(async () => 'nope'),
    ]) {
      const warn = vi.fn();
      await expect(readSiteProfile(r as never, warn)).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain(SITE_PROFILE_WARNING);
    }
  });

  it('gives up after the read timeout', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const pending = readSiteProfile(
      reader(
        (options) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
          })
      ),
      warn
    );
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBeNull();
    expect(warn.mock.calls[0]![0]).toContain('timed out');
  });
});

describe('resolveSiteProfile', () => {
  const defaults = { siteName: 'Site', iconLogoUrl: 'https://media.example.test/icon-512' };

  it('keeps what the merchant set', () => {
    expect(resolveSiteProfile(SETTING, defaults)).toEqual({
      name: 'Acme Ltd',
      logoUrl: 'https://media.example.test/logo.png',
      sameAs: ['https://social.example.test/acme'],
      contact: { email: 'hi@acme.test', telephone: '+3545551234' },
    });
  });

  it('falls back to the site name and the icon, and still answers with no profile at all', () => {
    expect(resolveSiteProfile({ ...SETTING, name: null, logoUrl: null }, defaults)).toMatchObject({
      name: 'Site',
      logoUrl: 'https://media.example.test/icon-512',
    });
    expect(resolveSiteProfile(null, defaults)).toEqual({
      name: 'Site',
      logoUrl: 'https://media.example.test/icon-512',
      sameAs: [],
      contact: { email: null, telephone: null },
    });
  });
});
