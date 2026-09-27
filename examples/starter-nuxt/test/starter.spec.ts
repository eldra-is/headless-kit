import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { scanTheme } from '@eldrajs/vite-plugin-theme/scan';
import { encodeStega } from '@eldrajs/theme-core/stega';
import { safeHref } from '../app/utils/links';

const templateDir = fileURLToPath(new URL('..', import.meta.url));
// Resolved by package name (a real devDependency of this starter, like a
// customer's `eldra-theme init` copy has too), not a relative reach into the
// monorepo's theme-cli source directory — that sibling does not exist
// outside this monorepo. Requires @eldrajs/theme-cli to already be built
// (`dist/cli.js`), same precondition the root gates already enforce.
const cli = join(
  dirname(createRequire(import.meta.url).resolve('@eldrajs/theme-cli/package.json')),
  'dist',
  'cli.js'
);
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
const expectedBlocks = [
  'announcement-bar',
  'article',
  'breadcrumbs',
  'contact',
  'cta',
  'faq',
  'feature-grid',
  'footer',
  'gallery',
  'hero',
  'image',
  'logo-cloud',
  'navigation',
  'newsletter',
  'pricing-table',
  'quote',
  'rich-text',
  'split-content',
  'stats',
  'tabs',
  'team',
  'testimonials',
  'timeline',
  'video-embed',
];

describe('starter theme', () => {
  it('allows ordinary links and rejects executable or opaque protocols', () => {
    expect(safeHref('/contact')).toBe('/contact');
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('mailto:hello@example.com')).toBe('mailto:hello@example.com');
    expect(safeHref('  #details  ')).toBe('#details');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('//evil.example/path')).toBeNull();
    expect(safeHref('/\\evil.example/path')).toBeNull();
    expect(safeHref('/safe\npath')).toBeNull();
  });

  it('cleans preview metadata before validating ordinary and templated links', () => {
    const meta = { entryId: 'guide-1', fieldPath: 'slug', locale: 'en-US' };
    expect(safeHref('/guides/' + encodeStega('volcanic-coast', meta))).toBe(
      '/guides/volcanic-coast'
    );
    expect(safeHref(encodeStega('/about', meta))).toBe('/about');
    expect(safeHref(encodeStega('javascript:alert(1)', meta))).toBeNull();
    expect(safeHref(encodeStega('//evil.example/path', meta))).toBeNull();
  });

  it('validates every contract block and includes design tokens', () => {
    const result = scanTheme({ themeDir: templateDir, framework: 'nuxt' });
    expect(result.errors).toEqual([]);
    expect(result.manifest?.blocks.map((block) => block.apiId).sort()).toEqual(expectedBlocks);
    // The design spec's brand slot (eldra-starter-spec/tokens.json): a deep
    // ink a customer replaces with their own colour, not a blue.
    expect(result.manifest?.tokens.colors.primary.value).toBe('#24201c');
    // The roles `@eldrajs/ui` needs beyond the original thirteen.
    expect(result.manifest?.tokens.colors['border-strong']?.value).toBe('#7d7466');
    expect(result.manifest?.tokens.colors.focus?.value).toBe('#1c1917');
    expect(result.manifest?.tokens.colors['focus-inner']?.value).toBe('#ffffff');
    expect(result.manifest?.tokens.colors.overlay?.value).toBe('#1c1917b3');
    const fields = Object.fromEntries(
      result.manifest!.blocks.map((block) => [
        block.apiId,
        block.fields.map((field) => field.fieldId),
      ])
    );
    expect(fields).toMatchObject({
      hero: [
        'variant',
        'eyebrow',
        'heading',
        'subheading',
        'image',
        'slides',
        'spacing',
        'primaryCtaLabel',
        'primaryCtaHref',
        'secondaryCtaLabel',
        'secondaryCtaHref',
      ],
      footer: [
        'variant',
        'background',
        'brandText',
        'brandLogo',
        'description',
        'groups',
        'links',
        'showNewsletter',
        'newsletterTitle',
        'newsletterText',
        'social',
        'legalText',
        'legalLinks',
        'showLocale',
        'showCurrency',
      ],
      navigation: [
        'variant',
        'brandText',
        'brandLogo',
        'links',
        'showSearch',
        'searchStyle',
        'showAccount',
        'ctaLabel',
        'ctaHref',
        'sticky',
        'transparentOverHero',
      ],
      article: [
        'title',
        'dek',
        'categoryLabel',
        'categoryHref',
        'publishedAt',
        'readingTime',
        'coverImage',
        'coverCaption',
        'body',
        'authorName',
        'authorRole',
        'authorAvatar',
        'authorBio',
        'authorLinkLabel',
        'authorLinkHref',
        'showByline',
      ],
      image: [
        'image',
        'decorative',
        'aspect',
        'width',
        'caption',
        'captionAlign',
        'linkLabel',
        'linkHref',
      ],
      gallery: ['variant', 'heading', 'intro', 'columns', 'aspect', 'showCaptions', 'items'],
      cta: [
        'variant',
        'eyebrow',
        'heading',
        'text',
        'primaryCtaLabel',
        'primaryCtaHref',
        'secondaryCtaLabel',
        'secondaryCtaHref',
        'image',
      ],
      'feature-grid': [
        'variant',
        'heading',
        'intro',
        'headLinkLabel',
        'headLinkHref',
        'columns',
        'mediaType',
        'items',
      ],
      testimonials: [
        'variant',
        'heading',
        'summary',
        'linkLabel',
        'linkHref',
        'items',
        'sectionBackground',
      ],
      faq: [
        'variant',
        'heading',
        'intro',
        'exclusive',
        'items',
        'contactText',
        'contactLinkLabel',
        'contactLinkHref',
        'sectionBackground',
      ],
      'logo-cloud': ['variant', 'heading', 'logos', 'sectionBackground'],
      breadcrumbs: ['showHome', 'homeLabel', 'trail', 'currentTitle', 'showCurrent', 'container'],
      'split-content': ['startWith', 'rows'],
      quote: [
        'variant',
        'quote',
        'name',
        'role',
        'avatar',
        'image',
        'sourceLinkLabel',
        'sourceLinkHref',
        'sectionBackground',
      ],
      'rich-text': ['heading', 'body', 'alignment', 'container'],
      stats: ['variant', 'heading', 'intro', 'items', 'sectionBackground'],
      'pricing-table': [
        'heading',
        'intro',
        'featureRows',
        'plans',
        'highlightedPlan',
        'highlightLabel',
        'footnote',
        'sectionBackground',
      ],
      contact: [
        'variant',
        'heading',
        'hideHeading',
        'intro',
        'address',
        'hours',
        'phone',
        'email',
        'mapLinkLabel',
        'mapLinkHref',
        'mapEmbed',
        'mapImage',
        'mapNote',
        'formTitle',
        'topics',
        'showOrderNumber',
        'recipient',
        'successText',
      ],
      'video-embed': [
        'variant',
        'heading',
        'intro',
        'videoUrl',
        'videoTitle',
        'duration',
        'poster',
        'caption',
        'transcriptLabel',
        'transcriptHref',
        'privacyNote',
        'sectionBackground',
      ],
      timeline: [
        'variant',
        'heading',
        'intro',
        'linkLabel',
        'linkHref',
        'items',
        'columns',
        'sectionBackground',
      ],
      team: ['heading', 'intro', 'linkLabel', 'linkHref', 'people', 'sectionBackground'],
      tabs: ['heading', 'intro', 'tabs', 'defaultTab', 'sectionBackground'],
    });

    // Starter mocks cannot carry organization-specific asset IDs. Keep media
    // fields with asset-free mock values optional so a freshly inserted block
    // is publishable before an editor selects an asset.
    const imageBlock = result.manifest!.blocks.find((block) => block.apiId === 'image')!;
    const imageField = imageBlock.fields.find((field) => field.fieldId === 'image');
    expect(imageField?.validators?.required).not.toBe(true);
    expect(imageField?.metadata?.multiple).toBe(false);
    const galleryBlock = result.manifest!.blocks.find((block) => block.apiId === 'gallery')!;
    const galleryItems = galleryBlock.fields.find((field) => field.fieldId === 'items');
    expect(galleryItems?.validators?.required).toBe(true);
    const galleryItemImage = galleryItems?.metadata?.item?.metadata?.fields?.find(
      (field) => field.fieldId === 'image'
    );
    expect(galleryItemImage?.validators?.required).toBe(true);
    expect(galleryItemImage?.metadata?.multiple).toBe(false);
    expect(galleryItemImage?.metadata?.framing).toBe(true);

    const heroBlock = result.manifest!.blocks.find((block) => block.apiId === 'hero')!;
    expect(heroBlock.fields.find((field) => field.fieldId === 'image')?.metadata?.multiple).toBe(
      false
    );
    expect(heroBlock.previewImage).toBe('.eldra/previews/hero.png');
    expect(existsSync(join(templateDir, heroBlock.previewImage!))).toBe(true);
    const testimonialsBlock = result.manifest!.blocks.find(
      (block) => block.apiId === 'testimonials'
    )!;
    const testimonialsItems = testimonialsBlock.fields.find((field) => field.fieldId === 'items');
    const avatar = testimonialsItems?.metadata?.item?.metadata?.fields?.find(
      (field) => field.fieldId === 'avatar'
    );
    expect(avatar?.metadata?.multiple).toBe(false);
  });

  it('ships the Nuxt shell, documentation, and all provider deploy workflows', () => {
    for (const path of [
      'nuxt.config.ts',
      'app/app.vue',
      'app/pages/[...slug].vue',
      'README.md',
      '.github/workflows/eldra-deploy.yml',
      '.gitlab-ci.yml',
      'bitbucket-pipelines.yml',
    ])
      expect(existsSync(join(templateDir, path)), path).toBe(true);
    expect(readFileSync(join(templateDir, '.github/workflows/eldra-deploy.yml'), 'utf8')).toContain(
      'github.event.client_payload.deploymentId'
    );
    expect(readFileSync(join(templateDir, '.gitlab-ci.yml'), 'utf8')).toContain(
      'ELDRA_TRIGGER_DEPLOYMENT_ID'
    );
    expect(readFileSync(join(templateDir, 'bitbucket-pipelines.yml'), 'utf8')).toContain(
      'eldra-rebuild'
    );
  });

  it('generates the static shell, manifest, headers, and fallback without gateway credentials', async () => {
    const result = await execa(nuxi, ['generate'], {
      cwd: templateDir,
      env: { ELDRA_GATEWAY_URL: '', ELDRA_ORG_ID: '' },
      reject: false,
      timeout: 300_000,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    const output = (path: string) => join(templateDir, '.output', 'public', path);
    expect(existsSync(output('index.html'))).toBe(true);
    expect(existsSync(output('200.html'))).toBe(true);
    expect(existsSync(output('.eldra/manifest.json'))).toBe(true);
    expect(readFileSync(output('_headers'), 'utf8')).toContain(
      "frame-ancestors 'self' https://localhost:4311"
    );

    // Nitro's own `/404.html` is normally a generic SPA-fallback shell
    // (identical to `200.html`) used by static hosts for unmatched routes —
    // it never goes through the app's catch-all page on its own. Adding
    // `/404` to nitro.prerender.routes makes Nitro *also* render that path
    // through `app/pages/[...slug].vue`, writing it to `404/index.html`
    // (Nitro's convention for extension-less routes); a `prerender:done`
    // hook in nuxt.config.ts then copies that file over the literal
    // `404.html` so static hosts serving the literal path get the styled
    // not-found shell instead of the blank fallback.
    const notFound = readFileSync(output('404.html'), 'utf8');
    expect(notFound).toContain('data-eldra-not-found');
    expect(notFound).toContain('href="/"');
  }, 360_000);

  it('supports an exact authenticated Studio origin override', async () => {
    const result = await execa(nuxi, ['generate'], {
      cwd: templateDir,
      env: {
        ELDRA_GATEWAY_URL: '',
        ELDRA_ORG_ID: '',
        ELDRA_STUDIO_ORIGIN: 'https://studio.example.test:3000',
      },
      reject: false,
      timeout: 300_000,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(readFileSync(join(templateDir, '.output', 'public', '_headers'), 'utf8')).toContain(
      "frame-ancestors 'self' https://studio.example.test:3000"
    );
  }, 360_000);

  it('initializes, validates, and generates a working theme in a scratch directory', async () => {
    const scratchRoot = mkdtempSync(join(tmpdir(), 'eldra-starter-'));
    const themeDir = join(scratchRoot, 'site');
    try {
      const initialized = await execa('node', [cli, 'init', themeDir], { reject: false });
      expect(initialized.exitCode, initialized.stderr).toBe(0);
      const packageJson = JSON.parse(readFileSync(join(themeDir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      expect(packageJson.dependencies['@eldrajs/theme-nuxt']).toBe('^0.1.0');

      // Equivalent to the dependency-install boundary, but deterministic and offline in this monorepo test.
      symlinkSync(join(templateDir, 'node_modules'), join(themeDir, 'node_modules'), 'dir');
      const validated = await execa('node', [cli, 'validate'], { cwd: themeDir, reject: false });
      expect(validated.exitCode, validated.stderr).toBe(0);
      expect(validated.stdout).toContain(`${expectedBlocks.length} blocks valid`);

      const generated = await execa(nuxi, ['generate'], {
        cwd: themeDir,
        env: { ELDRA_GATEWAY_URL: '', ELDRA_ORG_ID: '' },
        reject: false,
        timeout: 300_000,
      });
      expect(generated.exitCode, `${generated.stdout}\n${generated.stderr}`).toBe(0);
      expect(existsSync(join(themeDir, '.output', 'public', 'index.html'))).toBe(true);
      expect(existsSync(join(themeDir, '.output', 'public', '.eldra', 'manifest.json'))).toBe(true);
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  }, 360_000);
});
