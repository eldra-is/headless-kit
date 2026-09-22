import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { execa } from 'execa';
import { scanTheme } from '../../../packages/vite-plugin-theme/src/scan';
import { encodeStega } from '@eldrajs/theme-core/stega';
import { safeHref } from '../app/utils/links';

const templateDir = fileURLToPath(new URL('..', import.meta.url));
const cli = fileURLToPath(new URL('../../../packages/theme-cli/dist/cli.js', import.meta.url));
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
const expectedBlocks = [
  'article',
  'cta',
  'faq',
  'feature-grid',
  'footer',
  'gallery',
  'hero',
  'image',
  'navigation',
  'testimonials',
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

  it('validates all ten contract blocks and includes design tokens', () => {
    const result = scanTheme({ themeDir: templateDir, framework: 'nuxt' });
    expect(result.errors).toEqual([]);
    expect(result.manifest?.blocks.map((block) => block.apiId).sort()).toEqual(expectedBlocks);
    expect(result.manifest?.tokens.colors.primary.value).toBe('#4f46e5');
    const fields = Object.fromEntries(
      result.manifest!.blocks.map((block) => [
        block.apiId,
        block.fields.map((field) => field.fieldId),
      ])
    );
    expect(fields).toMatchObject({
      hero: ['heading', 'subheading', 'image', 'ctaLabel', 'ctaHref', 'align'],
      navigation: ['brand', 'links'],
      footer: ['copyright', 'columns'],
      article: ['title', 'author', 'coverImage', 'body'],
      image: ['image', 'caption', 'fullWidth'],
      gallery: ['title', 'images'],
      cta: ['heading', 'body', 'buttonLabel', 'buttonHref', 'variant'],
      'feature-grid': ['heading', 'features'],
      testimonials: ['heading', 'items'],
      faq: ['heading', 'items'],
    });

    // Starter mocks cannot carry organization-specific asset IDs. Keep media
    // fields with asset-free mock values optional so a freshly inserted block
    // is publishable before an editor selects an asset.
    const imageBlock = result.manifest!.blocks.find((block) => block.apiId === 'image')!;
    const imageField = imageBlock.fields.find((field) => field.fieldId === 'image');
    expect(imageField?.validators?.required).not.toBe(true);
    expect(imageField?.metadata?.multiple).toBe(false);
    const articleBlock = result.manifest!.blocks.find((block) => block.apiId === 'article')!;
    expect(
      articleBlock.fields.find((field) => field.fieldId === 'coverImage')?.metadata?.multiple
    ).toBe(false);
    const galleryBlock = result.manifest!.blocks.find((block) => block.apiId === 'gallery')!;
    const galleryItems = galleryBlock.fields.find((field) => field.fieldId === 'images');
    const galleryImage = galleryItems?.metadata?.item?.metadata?.fields?.find(
      (field) => field.fieldId === 'image'
    );
    expect(galleryImage?.validators?.required).not.toBe(true);
    expect(galleryImage?.metadata?.multiple).toBe(false);

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
        ELDRA_STUDIO_ORIGIN: 'https://default-org.local.eldra.app:3000',
      },
      reject: false,
      timeout: 300_000,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(readFileSync(join(templateDir, '.output', 'public', '_headers'), 'utf8')).toContain(
      "frame-ancestors 'self' https://default-org.local.eldra.app:3000"
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
      expect(validated.stdout).toContain('10 blocks valid');

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
