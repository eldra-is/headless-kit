// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installTrackerScript,
  parseEventOrigin,
  resolveAnalyticsConfig,
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

describe('the plugin keeps a Studio preview frame out of the tracker', () => {
  it('gates on isStudioPreviewFrame (framed by an allowed Studio origin) and the build decision', () => {
    // `window.parent` cannot be redefined in jsdom, so the framed case is covered by
    // `origins.spec.ts` (`resolveBridgeOrigins`) and `shouldReport` above; this pins the wiring.
    const plugin = readFileSync(
      join(__dirname, '..', 'src', 'runtime', 'analyticsPlugin.ts'),
      'utf8'
    );
    expect(plugin).toContain('studioPreviewFrame: isStudioPreviewFrame(cfg.studioOrigins)');
    expect(plugin).toContain('dev: import.meta.dev');
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
