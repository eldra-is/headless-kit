import { reactive } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEldraLinkState, type EldraContext } from '../context';
import { applyResolvedDesignTokens } from '../useEldraPreview';

const containers = {
  narrow: { label: 'Narrow', maxWidth: '40rem', gutter: { normal: '2rem' } },
  content: { label: 'Content', maxWidth: '64rem', gutter: { normal: '2rem' } },
  wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
  full: { label: 'Full', maxWidth: 'none', gutter: { normal: '2rem' } },
};

function context(): EldraContext {
  return {
    client: {} as EldraContext['client'],
    designTokens: reactive({ colors: {}, containers: {} }),
    links: createEldraLinkState(),
    preview: reactive({
      active: true,
      mode: 'edit',
      locale: 'en-US',
      sourceDrafts: {},
      drafts: {},
      draftSchemaApiIds: {},
      refreshRevision: 0,
      revision: 0,
      designTokensRevision: 1,
      tokenRevision: 0,
      richTextRenderRevision: 0,
      editorSupportsSlots: false,
    }),
  };
}

describe('live design-token catalogs', () => {
  beforeEach(() => {
    document.head.innerHTML = '<style data-eldra-layout-styles nonce="request-nonce"></style>';
  });

  it('atomically applies a newer closed catalog through nonce-bearing generic CSS', () => {
    const target = context();
    expect(
      applyResolvedDesignTokens(target, {
        revision: 2,
        resolved: {
          colors: { primary: { label: 'Primary', value: '#112233', allowSiteOverride: true } },
          containers,
        },
      })
    ).toBe(true);
    expect(target.designTokens.colors.primary?.value).toBe('#112233');
    const style = document.querySelector<HTMLStyleElement>(
      '[data-eldra-live-design-token-styles]'
    )!;
    expect(style.nonce).toBe('request-nonce');
    expect(style.textContent).toContain('--eldra-color-primary:#112233;');
  });

  it('ignores stale, malformed, and oversized updates without partial mutation', () => {
    const target = context();
    const original = JSON.parse(JSON.stringify(target.designTokens));
    expect(
      applyResolvedDesignTokens(target, {
        revision: 1,
        resolved: { colors: {}, containers: {} },
      })
    ).toBe(false);
    expect(
      applyResolvedDesignTokens(target, {
        revision: 2,
        resolved: {
          colors: { attack: { label: 'Attack', value: 'var(--x)' } },
          containers,
        },
      })
    ).toBe(false);
    expect(
      applyResolvedDesignTokens(target, {
        revision: 2,
        resolved: {
          colors: { huge: { label: 'x'.repeat(70_000), value: '#000000' } },
          containers,
        },
      })
    ).toBe(false);
    expect(target.designTokens).toEqual(original);
    expect(target.preview.designTokensRevision).toBe(1);
  });

  it('switches complete catalogs, removes prior theme ids, and refuses stale rollback', () => {
    const target = context();
    Object.assign(target.designTokens.colors, {
      primary: { label: 'Primary A', value: '#112233', allowSiteOverride: true },
      'theme-a-only': { label: 'Theme A only', value: '#abcdef' },
    });
    Object.assign(target.designTokens.containers, containers, {
      'theme-a-only': { label: 'Theme A only', maxWidth: '72rem', gutter: { normal: '2rem' } },
    });
    target.designTokens.allowCustomColors = true;
    target.preview.designTokensRevision = 4;

    const themeB = {
      colors: {
        primary: { label: 'Primary B', value: '#445566', allowSiteOverride: true },
        'theme-b-only': { label: 'Theme B only', value: '#fedcba' },
      },
      containers: {
        ...containers,
        content: { label: 'Content B', maxWidth: '48rem', gutter: { normal: '3rem' } },
      },
    };
    expect(applyResolvedDesignTokens(target, { revision: 5, resolved: themeB })).toBe(true);
    expect(target.designTokens.colors['theme-a-only']).toBeUndefined();
    expect(target.designTokens.containers['theme-a-only']).toBeUndefined();
    expect(target.designTokens.colors['theme-b-only']?.value).toBe('#fedcba');
    expect(target.designTokens.allowCustomColors).toBeUndefined();
    const style = document.querySelector<HTMLStyleElement>(
      '[data-eldra-live-design-token-styles]'
    )!;
    expect(style.dataset.eldraDesignTokenRevision).toBe('5');
    expect(style.textContent).toContain('--eldra-color-primary:#445566;');
    expect(style.textContent).toContain('--eldra-color-theme-a-only:initial;');
    expect(style.textContent).toContain('--color-theme-a-only:initial;');
    expect(style.textContent).toContain('--eldra-container-theme-a-only-max-width:initial;');
    expect(style.textContent).toContain('--eldra-container-theme-a-only-gutter-normal:initial;');
    expect(style.textContent).toContain('--eldra-container-theme-a-only-gutter-tablet:initial;');
    expect(style.textContent).toContain('--eldra-container-theme-a-only-gutter-mobile:initial;');
    expect(style.textContent).not.toContain('--eldra-color-theme-a-only:#abcdef;');

    expect(
      applyResolvedDesignTokens(target, {
        revision: 4,
        resolved: {
          colors: { primary: { label: 'Primary A', value: '#112233' } },
          containers,
          allowCustomColors: true,
        },
      })
    ).toBe(false);
    expect(target.designTokens.colors.primary?.value).toBe('#445566');
    expect(style.textContent).toContain('--eldra-color-primary:#445566;');
  });

  it('keeps static tombstones across A to B to C switches without tombstoning reintroduced ids', () => {
    const target = context();
    Object.assign(target.designTokens.colors, {
      'stays-removed': { label: 'Stays removed', value: '#abcdef' },
      reintroduced: { label: 'Reintroduced A', value: '#112233' },
    });
    Object.assign(target.designTokens.containers, containers, {
      'stays-removed': { label: 'Stays removed', maxWidth: '72rem', gutter: { normal: '2rem' } },
      reintroduced: { label: 'Reintroduced A', maxWidth: '60rem', gutter: { normal: '1rem' } },
    });

    expect(
      applyResolvedDesignTokens(target, {
        revision: 2,
        resolved: {
          colors: { transient: { label: 'Transient', value: '#445566' } },
          containers,
        },
      })
    ).toBe(true);
    expect(
      applyResolvedDesignTokens(target, {
        revision: 3,
        resolved: {
          colors: {
            reintroduced: { label: 'Reintroduced C', value: '#778899' },
          },
          containers: {
            ...containers,
            reintroduced: {
              label: 'Reintroduced C',
              maxWidth: '48rem',
              gutter: { normal: '3rem' },
            },
          },
        },
      })
    ).toBe(true);

    const style = document.querySelector<HTMLStyleElement>(
      '[data-eldra-live-design-token-styles]'
    )!;
    expect(style.dataset.eldraDesignTokenRevision).toBe('3');
    expect(style.textContent).toContain('--eldra-color-stays-removed:initial;');
    expect(style.textContent).toContain('--color-stays-removed:initial;');
    expect(style.textContent).toContain('--eldra-container-stays-removed-max-width:initial;');
    expect(style.textContent).toContain('--eldra-container-stays-removed-gutter-normal:initial;');
    expect(style.textContent).toContain('--eldra-container-stays-removed-gutter-tablet:initial;');
    expect(style.textContent).toContain('--eldra-container-stays-removed-gutter-mobile:initial;');
    expect(style.textContent).toContain('--eldra-color-reintroduced:#778899;');
    expect(style.textContent).toContain('--eldra-container-reintroduced-max-width:48rem;');
    expect(style.textContent).not.toContain('--eldra-color-reintroduced:initial;');
    expect(style.textContent).not.toContain('--color-reintroduced:initial;');
    expect(style.textContent).not.toContain('--eldra-container-reintroduced-max-width:initial;');
  });
});
