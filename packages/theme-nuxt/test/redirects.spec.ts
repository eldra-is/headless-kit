import { describe, expect, it, vi } from 'vitest';
import { resolveLocaleRouting } from '../src/runtime/locales';
import {
  MAX_DYNAMIC_REDIRECTS,
  MAX_STATIC_REDIRECTS,
  REDIRECTS_BEGIN,
  REDIRECTS_END,
  REDIRECTS_WARNING,
  buildRedirectsFile,
  readRedirects,
  type RedirectRule,
  type RedirectsReader,
} from '../src/runtime/redirects';

const reader = (request: RedirectsReader['request']): RedirectsReader => ({ request });
const rule = (patch: Partial<RedirectRule> = {}): RedirectRule => ({
  source: '/old',
  destination: '/new',
  status: 301,
  applyToLocales: false,
  ...patch,
});
const single = resolveLocaleRouting(null, 'en-US');
const bilingual = resolveLocaleRouting(
  { default: 'en-US', supported: ['en-US', 'is-IS'] } as never,
  undefined
);

describe('readRedirects', () => {
  it('asks the documented path and passes a whole answer through', async () => {
    const warn = vi.fn();
    const request = vi.fn(async () => ({ revision: 3, rules: [rule()] }));
    await expect(readRedirects(reader(request as never), warn)).resolves.toEqual({
      revision: 3,
      rules: [rule()],
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: '/site/v1/redirects' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats an empty list as an answer, not a failure', async () => {
    const warn = vi.fn();
    await expect(
      readRedirects(reader((async () => ({ revision: 1, rules: [] })) as never), warn)
    ).resolves.toEqual({ revision: 1, rules: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['no client', null],
    [
      'a rejected request',
      reader((async () => {
        throw new Error('boom');
      }) as never),
    ],
    ['a malformed rule', reader((async () => ({ revision: 1, rules: [{ source: 1 }] })) as never)],
    ['a status Core never serves', reader((async () => ({ revision: 1, rules: [rule({ status: 307 as never })] })) as never)],
  ])('warns once and answers null for %s', async (_name, input) => {
    const warn = vi.fn();
    await expect(readRedirects(input, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(REDIRECTS_WARNING);
  });
});

describe('buildRedirectsFile', () => {
  it('writes the platform block first, then the theme’s own file whole', () => {
    const built = buildRedirectsFile([rule()], single, '/a /b 301\n');
    expect(built.content).toBe(
      `${REDIRECTS_BEGIN}\n/old /new 301\n${REDIRECTS_END}\n\n/a /b 301\n`
    );
    expect(built.written).toBe(1);
  });

  it('writes nothing for no rules', () => {
    expect(buildRedirectsFile([], single, '/a /b 301\n').content).toBeNull();
  });

  it('puts exact rules first and wildcards longest first', () => {
    const built = buildRedirectsFile(
      [
        rule({ source: '/a/*', destination: '/x/:splat' }),
        rule({ source: '/a/b/*', destination: '/y/:splat' }),
        rule({ source: '/exact', destination: '/z' }),
      ],
      single
    );
    expect(built.content!.split('\n').slice(1, 4)).toEqual([
      '/exact /z 301',
      '/a/b/* /y/:splat 301',
      '/a/* /x/:splat 301',
    ]);
  });

  it('expands applyToLocales into one rule per prefixed locale, leaving absolute URLs alone', () => {
    const built = buildRedirectsFile(
      [
        rule({ applyToLocales: true }),
        rule({ source: '/ext', destination: 'https://example.com/x', applyToLocales: true }),
        rule({ source: '/w/*', destination: '/v/:splat', applyToLocales: true }),
        rule({ source: '/only', destination: '/dest' }),
      ],
      bilingual
    );
    const lines = built.content!.split('\n');
    expect(lines).toContain('/old /new 301');
    expect(lines).toContain('/is-IS/old /is-IS/new 301');
    expect(lines).toContain('/ext https://example.com/x 301');
    expect(lines).toContain('/is-IS/ext https://example.com/x 301');
    expect(lines).toContain('/is-IS/w/* /is-IS/v/:splat 301');
    expect(lines).toContain('/only /dest 301');
    expect(lines).not.toContain('/is-IS/only /is-IS/dest 301');
  });

  it('skips a rule that is not a valid line', () => {
    const built = buildRedirectsFile(
      [
        rule({ source: 'no-slash' }),
        rule({ source: '/has space' }),
        rule({ destination: 'javascript:alert(1)' }),
        rule({ source: '/ok', destination: '//evil.example' }),
        rule({ source: '/fine', destination: '/there' }),
      ],
      single
    );
    expect(built.written).toBe(1);
    expect(built.warnings).toHaveLength(4);
  });

  it('counts the locale expansion and the theme’s own rules against the caps', () => {
    const statics = Array.from({ length: 1500 }, (_, i) =>
      rule({ source: `/s${i}`, destination: '/d', applyToLocales: true })
    );
    const built = buildRedirectsFile(statics, bilingual);
    // 3000 expanded rules, 2000 fit.
    expect(built.written).toBe(MAX_STATIC_REDIRECTS);
    expect(built.warnings.join('\n')).toContain('1000 static redirect(s) dropped');

    const wild = Array.from({ length: 60 }, (_, i) =>
      rule({ source: `/w${i}/*`, destination: '/d/:splat', applyToLocales: true })
    );
    const themeWild = Array.from({ length: 10 }, (_, i) => `/t${i}/* /x/:splat 301`).join('\n');
    const capped = buildRedirectsFile(wild, bilingual, themeWild);
    expect(capped.written).toBe(MAX_DYNAMIC_REDIRECTS - 10);
    expect(capped.warnings.join('\n')).toContain('wildcard redirect(s) dropped');
  });

  it('writes the same file twice from the same inputs', () => {
    const a = buildRedirectsFile([rule()], single, '/a /b 301\n');
    expect(buildRedirectsFile([rule()], single, '/a /b 301\n')).toEqual(a);
  });
});
