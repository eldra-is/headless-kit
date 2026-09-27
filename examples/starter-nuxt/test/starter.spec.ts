import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
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
  'article-list',
  'breadcrumbs',
  'cart',
  'collection-grid',
  'collection-header',
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
  'order-status',
  'pricing-table',
  'product-carousel',
  'product-detail',
  'quote',
  'rich-text',
  'search',
  'split-content',
  'stats',
  'tabs',
  'team',
  'testimonials',
  'timeline',
  'trust-strip',
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
    const expectedFields: Record<string, string[]> = {
      // Every one of the 33 blocks has its field list here — the map used to cover 31, leaving
      // `announcement-bar` and `newsletter` with only the manifest version rule behind a field
      // rename or reorder, not the explicit list every sibling block has.
      'announcement-bar': ['variant', 'message', 'linkLabel', 'linkHref', 'dismissable'],
      newsletter: [
        'variant',
        'heading',
        'text',
        'fieldLabel',
        'placeholder',
        'buttonLabel',
        'consent',
        'requireConsentCheckbox',
        'consentCheckboxLabel',
        'successTitle',
        'successText',
        'list',
        'sectionBackground',
      ],
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
      'collection-header': [
        'collectionHandle',
        'variant',
        'title',
        'description',
        'image',
        'showCount',
        'showBreadcrumb',
        'trail',
        'subcollections',
      ],
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
      'trust-strip': [
        'variant',
        'items',
        'mobileLayout',
        'showPayments',
        'paymentsLabel',
        'payments',
        'background',
      ],
      'article-list': [
        'variant',
        'heading',
        'viewAllLabel',
        'viewAllHref',
        'source',
        'categoryHref',
        'items',
        'perPage',
        'showFilters',
        'filters',
        'showPagination',
        'showExcerpt',
        'emptyTitle',
        'emptyText',
      ],
      'product-carousel': [
        'heading',
        'variant',
        'sourceHandle',
        'limit',
        'viewAllLabel',
        'viewAllHref',
        'showSwatches',
        'background',
      ],
      'collection-grid': [
        'collectionHandle',
        'variant',
        'columns',
        'pageSize',
        'paginationStyle',
        'sortOptions',
        'filters',
        'showColumnSelect',
        'emptyTitle',
        'emptyText',
      ],
      'product-detail': [
        'productHandle',
        'variant',
        'showRating',
        'showQuantity',
        'showWishlist',
        'lowStockThreshold',
        'perks',
        'tabs',
        'sizeGuideLabel',
        'sizeGuideHref',
        'stickyBar',
        'showCategory',
      ],
      search: [
        'variant',
        'heading',
        'placeholder',
        'types',
        'suggestionsPerGroup',
        'popularSearches',
        'noResultsCollection',
      ],
      cart: [
        'variant',
        'freeShippingThreshold',
        'showDiscountField',
        'showPaymentIcons',
        'note',
        'emptyTitle',
        'emptyText',
        'emptyLinkLabel',
        'emptyLinkHref',
      ],
      'order-status': [
        'variant',
        'processingTitle',
        'processingText',
        'shippedTitle',
        'deliveredTitle',
        'deliveredText',
        'delayedTitle',
        'cancelledTitle',
        'returnLinkLabel',
        'returnLinkHref',
        'shopAgainLinkLabel',
        'shopAgainLinkHref',
        'helpLinks',
      ],
    };
    expect(fields).toMatchObject(expectedFields);
    // And the map covers every block, so a new one cannot land without its field list.
    expect(Object.keys(expectedFields).sort()).toEqual([...expectedBlocks].sort());

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
  /**
   * The name→icon-component adapter lives in exactly one place
   * (`app/composables/iconComponent.ts`). It used to be copy-pasted into eight blocks — nine copies
   * of one fragile regex over Tabler's markup, in a codebase the customer is expected to edit — and
   * the copies also dropped what routing through `@eldrajs/ui`'s `Icon` adds: the spec's stroke
   * width, the four sizes and the decorative/labelled ARIA state. This keeps it at one.
   */
  it('no block re-implements the Tabler markup transform or hand-rolls an icon <svg>', () => {
    const blocksDir = join(templateDir, 'blocks');
    const reimplemented: string[] = [];
    const handRolled: string[] = [];

    for (const apiId of expectedBlocks) {
      for (const file of blockSourceFiles(join(blocksDir, apiId))) {
        const source = readFileSync(file, 'utf8');
        const where = file.slice(blocksDir.length + 1);
        // The transform: the `<svg …>` head strip that `tablerSvgBody` owns.
        if (source.includes('<svg\\b[^>]*>')) reimplemented.push(where);
        // A hand-written icon element in a template: an `<svg` with a `viewBox`, which is what a
        // copied Tabler path looks like. `EldraIcon`/`iconComponent` is the only way icons render.
        if (/<svg[\s\n][^>]*viewBox/.test(source)) handRolled.push(where);
      }
    }

    expect(
      reimplemented,
      'use `tablerSvgBody`/`renderTablerSvg` from `app/composables/iconComponent.ts` instead of ' +
        "re-implementing Tabler's markup transform"
    ).toEqual([]);
    expect(
      handRolled,
      'render icons through `EldraIcon` (a template) or `iconComponent()` (a package prop that ' +
        'takes a component) — never a hand-written `<svg>` with a copied path'
    ).toEqual([]);
  });

  /**
   * The constraint every customer block is judged by — "no Nuxt globals, no `@eldrajs/sdk`, no
   * auto-imports in `blocks/**`" (`docs/starter-kit.md`) — had nothing guarding it:
   * `test/deps.spec.ts` only checks that bare specifiers resolve to this package's own
   * `package.json`, which a Nuxt auto-import never appears in at all. A block that reaches for
   * `useRoute()` still renders in the Nuxt app and only breaks in Storybook, so this is exactly the
   * kind of drift review catches late or not at all.
   */
  it('no block uses a Nuxt global, an auto-import or @eldrajs/sdk', () => {
    const blocksDir = join(templateDir, 'blocks');
    // `useStorefront()` is deliberately not here: it is a plain `inject()` off `STOREFRONT_KEY`
    // (`app/composables/useStorefront.ts`), imported explicitly like every other `app/**` helper.
    const FORBIDDEN = [
      'useRoute(',
      'useRouter(',
      'useHead(',
      'useSeoMeta(',
      'useFetch(',
      'useAsyncData(',
      'useState(',
      'useRuntimeConfig(',
      'useNuxtApp(',
      '$fetch(',
      '<NuxtLink',
      "from '@eldrajs/sdk'",
      "from '#imports'",
      "from '#app'",
    ];
    const offenders: string[] = [];

    for (const apiId of expectedBlocks) {
      for (const file of blockSourceFiles(join(blocksDir, apiId))) {
        const source = readFileSync(file, 'utf8');
        for (const needle of FORBIDDEN) {
          // Only real code, never prose: every one of these blocks documents the rule in its own
          // comments, so a bare substring scan would flag the documentation.
          const inCode = source
            .split('\n')
            .filter((line) => !/^\s*(\*|\/\/|<!--)/.test(line))
            .join('\n');
          if (inCode.includes(needle)) {
            offenders.push(`${file.slice(blocksDir.length + 1)} uses ${needle}`);
          }
        }
      }
    }

    expect(
      offenders,
      'blocks/** may not use a Nuxt global, a Nuxt auto-import or `@eldrajs/sdk` — every `vue`/' +
        '`@eldrajs/*` import is explicit, which is what lets a block render in Storybook with no ' +
        'Nuxt build step. Route a same-site link through `app/components/EldraRouterLink.vue`, and ' +
        'commerce data through `useStorefront()`.'
    ).toEqual([]);
  });

  /**
   * `metadata.framing` is a promise to the editor: Studio shows framing controls for that field, and
   * the render honours them only if it goes through this theme's `UiImage`, which is what emits the
   * `data-eldra-framing*` markers and applies the focal point/zoom. `article-list` declared framing
   * on `items[].image` and then mapped the media into `ContentCard`'s `image` *prop* — a component
   * that exposes no media slot, so the theme can never render that image itself — leaving an editor
   * with controls the page ignored. The metadata is gone from that field now (see
   * `blocks/article-list/Block.vue`'s "Three documented package limits"), and this keeps the
   * promise honest for every block: declare framing only where `UiImage` does the rendering.
   */
  it('every block declaring metadata.framing renders through UiImage', () => {
    const blocksDir = join(templateDir, 'blocks');
    const offenders: string[] = [];
    let framingFields = 0;

    for (const apiId of expectedBlocks) {
      const manifest = JSON.parse(
        readFileSync(join(blocksDir, apiId, 'block.json'), 'utf8')
      ) as ThemeBlockManifest;
      const declared = framingFieldIds(manifest.fields ?? []);
      framingFields += declared.length;
      if (declared.length === 0) continue;
      const source = blockSourceFiles(join(blocksDir, apiId))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');
      if (!source.includes('UiImage')) {
        offenders.push(`${apiId} (${declared.join(', ')})`);
      }
    }

    // Guards the scan itself: fourteen media fields opt into framing across the block set.
    expect(framingFields).toBeGreaterThanOrEqual(14);
    expect(
      offenders,
      'a field with `metadata.framing` must be rendered through `app/components/ui/UiImage.vue` — ' +
        'it is what emits the `data-eldra-framing*` markers Studio keys off; otherwise drop the ' +
        'metadata rather than offering a control the render ignores'
    ).toEqual([]);
  });

  /**
   * A rich-text field cannot declare its own heading outline: `metadata.toolbar`'s `heading` control
   * is one level-agnostic id, so an editor can insert any level anywhere. The page owns the outline,
   * so each block passes `EldraRichText`'s `minHeadingLevel` floor for the place its own document
   * sits in (the clamping itself lives in `@eldrajs/theme-core`'s `clampHeadingLevel`). That prop
   * landed with exactly one of the nine call sites using it, which left an `h1` typed into an
   * article body producing a second `<h1>` on the article page — the very invariant
   * `test/pages/article.spec.ts` asserts, passing only because the fixture happens to use levels
   * 2/2/2/3. The floor is a per-call-site decision, so it cannot be enforced inside the component;
   * this scans the source instead, the same shape as `packages/ui`'s own hygiene spec. Each floor's
   * *value* is argued in a comment next to the call site it belongs to, and
   * `test/richText.spec.ts` asserts the behaviour for `article`.
   */
  it('every EldraRichText call site in blocks/** passes a min-heading-level', () => {
    const blocksDir = join(templateDir, 'blocks');
    const offenders: string[] = [];
    let callSites = 0;

    for (const apiId of expectedBlocks) {
      for (const file of blockSourceFiles(join(blocksDir, apiId))) {
        const source = readFileSync(file, 'utf8');
        // Each `<EldraRichText …>` element up to its closing `/>` — the theme never writes it with
        // a separate closing tag.
        for (const match of source.matchAll(/<EldraRichText\b[\s\S]*?\/>/g)) {
          callSites += 1;
          if (!match[0].includes('min-heading-level')) {
            offenders.push(file.slice(blocksDir.length + 1));
          }
        }
      }
    }

    // Guards the scan itself: the starter renders rich text in nine places today.
    expect(callSites).toBeGreaterThanOrEqual(9);
    expect(
      offenders,
      'a rich-text document has no heading outline of its own — pass `:min-heading-level` for the ' +
        'level the document sits under in this block, and say why in a comment next to it'
    ).toEqual([]);
  });
});

/** Every shipped `.vue` under one block directory (never its `__tests__/`). */
function blockSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...blockSourceFiles(full));
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

interface ThemeBlockManifestField {
  fieldId: string;
  type: string;
  metadata?: {
    framing?: boolean;
    item?: ThemeBlockManifestField;
    fields?: ThemeBlockManifestField[];
  };
}
interface ThemeBlockManifest {
  fields?: ThemeBlockManifestField[];
}

/** Every `media` field id under one block that opts into framing, nested fields included. */
function framingFieldIds(fields: ThemeBlockManifestField[], prefix = ''): string[] {
  const out: string[] = [];
  for (const field of fields) {
    const path = prefix === '' ? field.fieldId : `${prefix}.${field.fieldId}`;
    if (field.type === 'media' && field.metadata?.framing === true) out.push(path);
    const item = field.metadata?.item;
    if (item !== undefined) out.push(...framingFieldIds([item], path));
    const nested = field.metadata?.fields;
    if (nested !== undefined) out.push(...framingFieldIds(nested, path));
  }
  return out;
}
