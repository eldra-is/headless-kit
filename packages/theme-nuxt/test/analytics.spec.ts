// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installTrackerScript,
  parseEventOrigin,
  resolveAnalyticsConfig,
  setupAnalytics,
  shouldReport,
} from '../src/runtime/analytics';

const base = { option: undefined, env: {}, dev: false, production: true, orgId: 'org-1' } as const;

describe('resolveAnalyticsConfig', () => {
  it('reports on a production build with an organisation', () => {
    expect(resolveAnalyticsConfig({ ...base })).toEqual({ enabled: true, eventOrigin: null });
  });

  it.each([
    ['dev server', { dev: true }],
    ['preview build', { production: false }],
    ['no organisation', { orgId: '' }],
    ['option false', { option: false as const }],
    ['option enabled:false', { option: { enabled: false } }],
    ['ELDRA_ANALYTICS=off', { env: { ELDRA_ANALYTICS: 'OFF' } }],
  ])('does not report: %s', (_name, patch) => {
    expect(resolveAnalyticsConfig({ ...base, ...patch }).enabled).toBe(false);
  });

  it('takes a valid eventOrigin from the option, and the env override wins', () => {
    expect(
      resolveAnalyticsConfig({ ...base, option: { eventOrigin: 'https://shop.example' } })
    ).toMatchObject({ eventOrigin: 'https://shop.example' });
    expect(
      resolveAnalyticsConfig({
        ...base,
        option: { eventOrigin: 'https://shop.example' },
        env: { ELDRA_ANALYTICS_ORIGIN: 'https://stats.example' },
      }).eventOrigin
    ).toBe('https://stats.example');
  });

  it('ignores an invalid eventOrigin with a warning and keeps reporting', () => {
    const warn = vi.fn();
    const config = resolveAnalyticsConfig({
      ...base,
      option: { eventOrigin: 'https://shop.example/path' },
      warn,
    });
    expect(config).toEqual({ enabled: true, eventOrigin: null });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('parseEventOrigin', () => {
  it('accepts only bare http(s) origins', () => {
    expect(parseEventOrigin('https://a.example')).toBe('https://a.example');
    expect(parseEventOrigin('https://a.example:8443')).toBe('https://a.example:8443');
    for (const bad of ['a.example', 'https://a.example/', 'https://a.example/x', 'ftp://a.example'])
      expect(parseEventOrigin(bad)).toBeNull();
  });
});

describe('shouldReport', () => {
  const on = { enabled: true, eventOrigin: null };
  it('needs a browser, no dev server, an enabled build and no Studio frame', () => {
    const input = { client: true, dev: false, config: on, studioPreviewFrame: false };
    expect(shouldReport(input)).toBe(true);
    expect(shouldReport({ ...input, client: false })).toBe(false);
    expect(shouldReport({ ...input, dev: true })).toBe(false);
    expect(shouldReport({ ...input, config: { ...on, enabled: false } })).toBe(false);
    expect(shouldReport({ ...input, config: undefined })).toBe(false);
    expect(shouldReport({ ...input, studioPreviewFrame: true })).toBe(false);
  });
});

describe('setupAnalytics (the plugin body)', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });
  const input = {
    client: true,
    dev: false,
    config: { enabled: true, eventOrigin: null },
    isFrame: false,
    gatewayUrl: 'https://gw.example',
    orgId: 'org-1',
    doc: document,
  };

  it('installs the tag and sends through the tracker on a production document', () => {
    const eldra = vi.fn();
    const analytics = setupAnalytics({ ...input, win: { eldra } });
    expect(document.head.querySelector('script')).not.toBeNull();
    analytics.track('x');
    expect(eldra).toHaveBeenCalledOnce();
  });

  it.each([
    ['a Studio preview frame', { isFrame: true }],
    ['a dev server', { dev: true }],
    ['a preview build', { config: { enabled: false, eventOrigin: null } }],
  ])('adds no tag and sends nothing in %s', (_name, patch) => {
    const eldra = vi.fn();
    const analytics = setupAnalytics({ ...input, ...patch, win: { eldra } });
    analytics.track('x');
    expect(document.head.querySelector('script')).toBeNull();
    expect(eldra).not.toHaveBeenCalled();
    expect(analytics.enabled).toBe(false);
  });
});

describe('installTrackerScript', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });
  const config = { gatewayUrl: 'https://gw.example', orgId: 'org-1', eventOrigin: null };

  it('appends the tracker tag once and calls back on load', () => {
    const onLoad = vi.fn();
    expect(installTrackerScript(document, config, onLoad)).toBe(true);
    const tag = document.head.querySelector('script') as HTMLScriptElement;
    expect(tag.src).toBe('https://gw.example/js/script.js');
    expect(tag.getAttribute('data-org')).toBe('org-1');
    expect(tag.hasAttribute('data-api')).toBe(false);
    expect(tag.crossOrigin).toBe('anonymous');
    tag.dispatchEvent(new Event('load'));
    expect(onLoad).toHaveBeenCalledOnce();
    expect(installTrackerScript(document, config, onLoad)).toBe(false);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('maps eventOrigin to data-api', () => {
    installTrackerScript(document, { ...config, eventOrigin: 'https://shop.example' }, vi.fn());
    expect(document.head.querySelector('script')?.getAttribute('data-api')).toBe(
      'https://shop.example'
    );
  });

  it('adds nothing without an organisation', () => {
    expect(installTrackerScript(document, { ...config, orgId: '' }, vi.fn())).toBe(false);
    expect(document.head.querySelector('script')).toBeNull();
  });
});
