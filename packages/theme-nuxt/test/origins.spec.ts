import { describe, expect, it } from 'vitest';
import { resolveBridgeOrigins } from '../src/runtime/origins';

describe('resolveBridgeOrigins', () => {
  it('turns an allowed wildcard referrer into an exact bridge origin', () => {
    expect(
      resolveBridgeOrigins(
        ['https://*.eldracms.com'],
        'https://studio.eldracms.com/org/content/pages/1'
      )
    ).toEqual(['https://studio.eldracms.com']);
  });

  it('preserves exact origins and rejects an untrusted referrer', () => {
    expect(
      resolveBridgeOrigins(
        ['https://studio.eldracms.com', 'https://*.eldracms.com'],
        'https://evil.example/iframe-host'
      )
    ).toEqual(['https://studio.eldracms.com']);
  });

  it('does not allow the wildcard apex or a suffix-confusion hostname', () => {
    expect(resolveBridgeOrigins(['https://*.eldracms.com'], 'https://eldracms.com/')).toEqual([]);
    expect(
      resolveBridgeOrigins(['https://*.eldracms.com'], 'https://eldracms.com.evil.test/')
    ).toEqual([]);
  });
});
