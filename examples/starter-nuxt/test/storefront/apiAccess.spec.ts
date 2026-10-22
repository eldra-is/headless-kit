import { describe, expect, it } from 'vitest';
import { createStorefrontApiAccess } from '../../app/storefront/apiAccess';

const CONFIG = {
  gatewayUrl: 'https://origin.example/api',
  publicApiUrl: 'https://edge.example/api',
  orgId: 'org-1',
};

describe('storefront API access (WS-407)', () => {
  it('the server and the build use ELDRA_GATEWAY_URL, so the build token never reaches the public base', () => {
    expect(createStorefrontApiAccess(CONFIG, false).apiBaseUrl).toBe(CONFIG.gatewayUrl);
  });

  it('the browser uses ELDRA_PUBLIC_API_URL when it is set', () => {
    expect(createStorefrontApiAccess(CONFIG, true).apiBaseUrl).toBe(CONFIG.publicApiUrl);
  });

  it('the browser falls back to ELDRA_GATEWAY_URL when it is unset or blank', () => {
    for (const publicApiUrl of [undefined, '', '  ']) {
      expect(createStorefrontApiAccess({ ...CONFIG, publicApiUrl }, true).apiBaseUrl).toBe(
        CONFIG.gatewayUrl
      );
    }
  });

  it('has no base at all for a site without credentials', () => {
    expect(createStorefrontApiAccess(undefined, true).apiBaseUrl).toBeUndefined();
  });
});

describe('storefront shared reads (WS-406)', () => {
  function keys(config: typeof CONFIG, name: string, locale: string | undefined) {
    const seen: Array<string | null> = [];
    const { shared } = createStorefrontApiAccess(config, false, (scope, _name, load) => {
      seen.push(scope === null ? null : `${scope}|${_name}`);
      return load();
    });
    void shared(name, async () => 1, locale);
    return seen[0];
  }

  it('keys on gateway, organisation, locale and read name', () => {
    const base = keys(CONFIG, 'categories', 'is-IS');
    expect(base).toBe('https://origin.example/api|org-1|is-IS|categories');
    expect(keys({ ...CONFIG, orgId: 'org-2' }, 'categories', 'is-IS')).not.toBe(base);
    expect(keys(CONFIG, 'categories', 'en-US')).not.toBe(base);
    expect(keys(CONFIG, 'categories', undefined)).toBe(
      'https://origin.example/api|org-1||categories'
    );
  });

  it('never shares a read without a gateway and organisation to key on', () => {
    expect(keys({ ...CONFIG, orgId: '' }, 'categories', undefined)).toBeNull();
  });

  it('keys by the origin gateway, not the browser base', () => {
    const seen: Array<string | null> = [];
    const { shared } = createStorefrontApiAccess(CONFIG, true, (scope, _name, load) => {
      seen.push(scope);
      return load();
    });
    void shared('categories', async () => 1, undefined);
    expect(seen[0]).toContain(CONFIG.gatewayUrl);
  });
});
