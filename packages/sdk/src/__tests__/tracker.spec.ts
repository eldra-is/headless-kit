import { describe, expect, it } from 'vitest';
import { analyticsTrackerScript } from '../tracker';

describe('analyticsTrackerScript', () => {
  it('points the tracker at the origin of the configured api base url', () => {
    expect(
      analyticsTrackerScript({
        orgId: 'org-123',
        apiBaseUrl: 'https://web.staging.eu.eldra.app/api/',
      })
    ).toEqual({
      src: 'https://web.staging.eu.eldra.app/js/script.js',
      defer: true,
      crossorigin: 'anonymous',
      'data-org': 'org-123',
    });
  });

  it('defaults to the production gateway and reads the org id from env', () => {
    const script = analyticsTrackerScript({ env: { NUXT_PUBLIC_ELDRA_ORG_ID: 'org-env' } });
    expect(script?.src).toBe('https://web.eldra.app/js/script.js');
    expect(script?.['data-org']).toBe('org-env');
  });

  it('returns nothing without an org id so a build can opt out', () => {
    expect(analyticsTrackerScript({ apiBaseUrl: 'https://web.eldra.app/api' })).toBeUndefined();
    expect(analyticsTrackerScript({ orgId: () => undefined })).toBeUndefined();
  });

  it('passes a first-party proxy origin through as data-api', () => {
    expect(
      analyticsTrackerScript({ orgId: 'org-123', eventOrigin: 'https://shop.example.is' })?.[
        'data-api'
      ]
    ).toBe('https://shop.example.is');
  });
});
