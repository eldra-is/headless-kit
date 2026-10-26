import { describe, expect, it } from 'vitest';
import { createSharedRead } from '../../app/storefront/sharedRead';

const CONFIG = {
  gatewayUrl: 'https://origin.example/api',
  orgId: 'org-1',
};

describe('storefront shared reads (WS-406)', () => {
  function keys(config: typeof CONFIG, name: string, locale: string | undefined) {
    const seen: Array<string | null> = [];
    const shared = createSharedRead(config, (scope, _name, load) => {
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
    const shared = createSharedRead(CONFIG, (scope, _name, load) => {
      seen.push(scope);
      return load();
    });
    void shared('categories', async () => 1, undefined);
    expect(seen[0]).toContain(CONFIG.gatewayUrl);
  });
});
