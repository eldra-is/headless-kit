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
import { starterTemplateRoles, starterTemplates, stripSeedMedia } from '../app/templates';

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
        'cta',
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
        'collection',
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
        'sourceCollection',
        'limit',
        'viewAllLabel',
        'viewAllHref',
        'showSwatches',
        'background',
      ],
      'collection-grid': [
        'collection',
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
    // Core's `list` field type accepts no validators at all — a manifest that declares even
    // `required` on one is rejected at deploy ("list fields do not support the required
    // validator"), so the "at least one" intent lives in the field's `helpText` instead.
    expect(galleryItems?.validators).toBeUndefined();
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
    // The seeds and roles `nuxt.config.ts` declares reach the manifest the build writes — the
    // artifact `eldra-theme deploy` uploads and Core seeds a site from. The scan-level
    // assertions live in "seeded templates" below; this one proves the config wiring.
    const built = JSON.parse(readFileSync(output('.eldra/manifest.json'), 'utf8')) as {
      templates?: Array<{ routePattern: string }>;
      templateRoles?: { header?: { apiId: string }; footer?: { apiId: string } };
    };
    expect(built.templates?.map((template) => template.routePattern)).toEqual([
      '/products/:slug',
      '/collections/:slug',
      '/',
    ]);
    expect([built.templateRoles?.header?.apiId, built.templateRoles?.footer?.apiId]).toEqual([
      'navigation',
      'footer',
    ]);
    expect(readFileSync(output('_headers'), 'utf8')).toContain(
      "frame-ancestors 'self' https://localhost:4311"
    );
    // A build with no credentials cannot know what the store sells in, and says so in the one place
    // that matters: the runtime config baked into every page carries no currency, rather than one
    // the theme picked. It reads `""` and not `null` because that is what Nuxt serialises a null
    // public-runtime-config value as — `locale` beside it does the same — which is exactly why
    // `toStorefrontCommerce` treats an empty string as "the store published nothing" rather than as
    // a malformed record. `@eldrajs/theme-nuxt` warns once; the page then renders plain numbers.
    expect(readFileSync(output('index.html'), 'utf8')).toContain('commerce:""');
    expect(result.stderr + result.stdout).toContain('the store publishes no currency');

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

    // `/cart` is the theme's own route (`app/pages/cart.vue`), the destination the header's bag
    // names whenever no cart drawer is mounted. Nothing gateway-driven ever lists it, so it is
    // prerendered by name from `nuxt.config.ts`; without that file a static host answers 404 and
    // the bag lands every shopper on the not-found shell, whatever the app would have rendered.
    // Asserted on the *credential-free* build on purpose: a cart route that needed a gateway to
    // exist would be no route at all.
    const cart = readFileSync(output(join('cart', 'index.html')), 'utf8');
    expect(cart).not.toContain('data-eldra-not-found');
    expect(cart).toContain('Your cart');
    expect(cart).toContain('Your cart is empty');
    // The prerendered route list the deployed site reads back at runtime
    // (`@eldrajs/theme-nuxt`'s `staticRoutes.ts`) has to carry it too.
    const metaDir = output(join('_nuxt', 'builds', 'meta'));
    const [metaFile] = readdirSync(metaDir);
    const buildMeta = JSON.parse(readFileSync(join(metaDir, metaFile ?? ''), 'utf8')) as {
      prerendered: string[];
    };
    expect(buildMeta.prerendered).toContain('/cart');

    // `/search` is the theme's own route too (`app/pages/search.vue`) — the destination every
    // `SearchBar`/`SearchModal` submit and every "View all" link in the search block names. One file
    // answers every `?q=`: the query is client-side state the page reads after hydration, so this
    // HTML is the *idle* state and must not claim, in the artifact a static host serves, to have
    // found nothing. Asserted on the credential-free build on purpose: a search route that needed a
    // gateway to exist would be no route at all.
    const search = readFileSync(output(join('search', 'index.html')), 'utf8');
    expect(search).not.toContain('data-eldra-not-found');
    expect(search).toContain('What are you looking for?');
    expect(search).not.toContain('No results for');
    expect(buildMeta.prerendered).toContain('/search');
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
  it('declares no validators on any list field, at any depth — Core rejects every one of them at deploy', () => {
    const result = scanTheme({ themeDir: templateDir, framework: 'nuxt' });
    const offenders: string[] = [];
    const walk = (fields: ThemeBlockManifestField[], path: string) => {
      for (const field of fields) {
        const at = `${path}${field.fieldId}`;
        if (field.type === 'list' && field.validators !== undefined) offenders.push(at);
        const item = field.metadata?.item as ThemeBlockManifestField | undefined;
        const nested = (field.metadata?.fields ?? item?.metadata?.fields) as
          | ThemeBlockManifestField[]
          | undefined;
        if (nested !== undefined) walk(nested, `${at}.`);
      }
    };
    for (const block of result.manifest!.blocks) walk(block.fields, `${block.apiId}.`);
    expect(offenders).toEqual([]);
  });
});

/** Every shipped `.vue` and `.ts` module under one block directory (never its `__tests__/`). */
function blockSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...blockSourceFiles(full));
    else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface ThemeBlockManifestField {
  fieldId: string;
  type: string;
  validators?: { required?: boolean };
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

describe('seeded templates (app/templates.ts)', () => {
  // The seeds and roles as the theme declares them in `nuxt.config.ts`, put through the very
  // scanner the build runs — so every assertion below is about what lands in
  // `.eldra/manifest.json` and, from there, in the deploy Core seeds a site from.
  const scanned = scanTheme({
    themeDir: templateDir,
    framework: 'nuxt',
    templates: starterTemplates(),
    templateRoles: starterTemplateRoles(),
  });

  /** The blocks of one `pages/<name>.page.json` fixture in order, minus the two role blocks. */
  const fixtureBlocks = (name: string): string[] =>
    (
      JSON.parse(readFileSync(join(templateDir, 'pages', `${name}.page.json`), 'utf8')) as {
        blocks: Array<{ apiId: string; id: string }>;
      }
    ).blocks
      .filter((block) => block.apiId !== 'navigation' && block.apiId !== 'footer')
      .map((block) => `${block.apiId}#${block.id}`);

  it('seeds exactly the product, collection and home templates', () => {
    const templates = scanned.manifest!.templates!;
    expect(
      templates.map((template) => [template.routePattern, template.schemaApiId, template.title])
    ).toEqual([
      ['/products/:slug', 'catalog:product', 'Product'],
      ['/collections/:slug', 'catalog:collection', 'Collection'],
      ['/', 'home', 'Home'],
    ]);
  });

  it('seeds each sample page’s blocks, in order, minus the two role blocks', () => {
    const templates = scanned.manifest!.templates!;
    const seeded = (index: number) =>
      templates[index]!.blocks.map((block) => `${block.apiId}#${block.id}`);
    expect(seeded(0)).toEqual(fixtureBlocks('product'));
    expect(seeded(1)).toEqual(fixtureBlocks('collection'));
    expect(seeded(2)).toEqual(fixtureBlocks('home'));
    // Guards the filter itself: the fixtures do carry a navigation and a footer block, so an
    // empty filter would still make the three assertions above pass.
    expect(seeded(0)).not.toContain('navigation#product-navigation');
    expect(seeded(0)).not.toContain('footer#product-footer');
    // And each seed's generated layout frames those blocks with the two roles, in one column.
    for (const [index, template] of templates.entries()) {
      const placed = template.layout.root.children.map((child) =>
        child.type === 'reusable' ? child.role : child.entryId
      );
      expect(placed).toEqual([
        'header',
        ...templates[index]!.blocks.map((block) => block.id),
        'footer',
      ]);
    }
  });

  it('pins no product or collection into a catalog seed, and takes the title from the route', () => {
    // The live failure this guards: every seeded product page rendered the
    // fixture's own product, because `product-detail.productHandle` (and the
    // collection blocks' own collection field) won over the route the template
    // was resolved by.
    const templates = scanned.manifest!.templates!;
    const catalogSeeds = templates.filter((template) => template.schemaApiId !== 'home');
    expect(catalogSeeds).toHaveLength(2);

    const pinned: Record<string, readonly string[]> = {
      'product-detail': ['productHandle'],
      'collection-header': ['collection', 'title', 'description'],
      'collection-grid': ['collection'],
      'product-carousel': ['viewAllHref'],
    };
    for (const template of catalogSeeds) {
      for (const block of template.blocks) {
        for (const fieldId of pinned[block.apiId] ?? []) {
          expect(`${block.apiId}.${fieldId}`).toBe(`${block.apiId}.${fieldId}`);
          expect(Object.hasOwn(block.data, fieldId)).toBe(false);
        }
      }
    }

    // The home seed keeps its carousel's collection: there is no route context
    // on `/` for the block to fall back to, and the carousel has no route
    // fallback at all. A theme cannot know the organisation's collection ids, so
    // it names the collection by slug and Core resolves it on deploy.
    const home = templates.find((template) => template.schemaApiId === 'home')!;
    const carousel = home.blocks.find((block) => block.apiId === 'product-carousel')!;
    expect(carousel.data.sourceCollection).toEqual({
      _type: 'collection',
      slug: 'the-winter-edit',
    });
    expect(Object.hasOwn(carousel.data, 'sourceHandle')).toBe(false);

    // Breadcrumbs: Home and nothing else in the data, with the current page's
    // own title bound on the layout node instead of the fixture's product name.
    for (const template of catalogSeeds) {
      const crumbs = template.blocks.find((block) => block.apiId === 'breadcrumbs')!;
      expect(crumbs.data.trail).toEqual([]);
      expect(crumbs.data.showHome).toBe(true);
      expect(Object.hasOwn(crumbs.data, 'currentTitle')).toBe(false);
      const node = template.layout.root.children.find(
        (child) => child.type === 'block' && child.entryId === crumbs.id
      );
      expect(node).toMatchObject({ templates: { currentTitle: '{{ title }}' } });
    }

    // The collection header carries the same treatment for the fields that are
    // the collection's own: emptied here, bound to the routed collection's
    // title on the node. Its `description` is rich text, which a text template
    // cannot render, so it is only emptied — the block falls back to the
    // collection's own description anyway.
    const collection = templates.find((template) => template.schemaApiId === 'catalog:collection')!;
    const header = collection.blocks.find((block) => block.apiId === 'collection-header')!;
    expect(Object.hasOwn(header.data, 'title')).toBe(false);
    expect(Object.hasOwn(header.data, 'description')).toBe(false);
    expect(header.data.trail).toEqual([]);
    expect(header.data.subcollections).toEqual([]);
    expect(
      collection.layout.root.children.find(
        (child) => child.type === 'block' && child.entryId === header.id
      )
    ).toMatchObject({ templates: { title: '{{ title }}' } });
  });

  it('names the sample pages’ own product and collection nowhere in a catalog seed', () => {
    // The blunt guard behind the per-field assertions above: a catalog template
    // renders whatever its `:slug` resolved to, so the fixture's product and
    // collection must not survive anywhere in its blocks — not in a handle, a
    // title, a trail, a link, or a paragraph of tab copy. The home seed is
    // exempt: it names them the way any hand-authored home page does.
    const templates = scanned.manifest!.templates!;
    const named = /merino|winter edit|the-winter-edit/i;
    for (const template of templates.filter((entry) => entry.schemaApiId !== 'home')) {
      for (const block of template.blocks) {
        expect({ block: block.apiId, named: named.test(JSON.stringify(block.data)) }).toEqual({
          block: block.apiId,
          named: false,
        });
      }
    }
    // And the guard guards something: the fixtures do name them, and the home
    // seed still does.
    const home = templates.find((template) => template.schemaApiId === 'home')!;
    expect(named.test(JSON.stringify(home.blocks))).toBe(true);
  });

  it('carries the navigation and footer role data the seeds place', () => {
    const roles = scanned.manifest!.templateRoles!;
    expect(roles.header?.apiId).toBe('navigation');
    expect(roles.footer?.apiId).toBe('footer');
    // Real data, not an empty stub: the home fixture's own header and footer settings.
    expect(roles.header?.data.brandText).toBe('Northwind Goods');
    expect(roles.header?.data.showSearch).toBe(true);
    expect(roles.footer?.data.description).toEqual(expect.stringContaining('small workshops'));
  });

  it('seeds a header and footer with no destinations at all', () => {
    // A theme cannot know an organisation's own pages, collections or policies, so it ships none:
    // every seeded link would resolve to nothing on a fresh org and render as a label or a bare
    // path to a page that does not exist. The *fields* stay — an author fills them in Studio — and
    // `blocks/*/mock.json` keeps its demo rows, because that is the state of a block an author has
    // just inserted, not the state a deploy seeds.
    const roles = scanned.manifest!.templateRoles!;
    expect(roles.header!.data.links).toEqual([]);
    expect(roles.header!.data.cta).toBeUndefined();
    expect(roles.header!.data.ctaLabel).toBeUndefined();
    // No customer accounts yet, so the account control is off until a store turns it on.
    expect(roles.header!.data.showAccount).toBe(false);
    expect(roles.footer!.data.groups).toEqual([]);
    expect(roles.footer!.data.links).toEqual([]);
    expect(roles.footer!.data.legalLinks).toEqual([]);
    expect(roles.footer!.data.social).toEqual([]);

    // And the same is true of every page fixture the seeds are built from, not just the home one
    // the roles happen to come from.
    for (const name of ['home', 'product', 'collection', 'article']) {
      const fixture = JSON.parse(
        readFileSync(join(templateDir, 'pages', `${name}.page.json`), 'utf8')
      ) as { blocks: Array<{ apiId: string; data: Record<string, unknown> }> };
      const header = fixture.blocks.find((block) => block.apiId === 'navigation')!;
      const footer = fixture.blocks.find((block) => block.apiId === 'footer')!;
      expect({
        page: name,
        links: header.data.links,
        showAccount: header.data.showAccount,
      }).toEqual({ page: name, links: [], showAccount: false });
      expect({ page: name, groups: footer.data.groups, legal: footer.data.legalLinks }).toEqual({
        page: name,
        groups: [],
        legal: [],
      });
    }
  });

  it('declares showAccount off by default, so a header entry that omits it has no account control', () => {
    const navigation = scanned.manifest!.blocks.find((block) => block.apiId === 'navigation')!;
    const showAccount = navigation.fields.find((field) => field.fieldId === 'showAccount')!;
    expect(showAccount.default).toBe(false);
    // The setting itself stays, so a store with customer accounts can turn it on.
    expect(showAccount.type).toBe('bool');
  });

  it('seeds Core-valid data: every seed block and both roles pass the mock.json rules', () => {
    // `scanTheme` runs `templates[].blocks[].data` and `templateRoles.*.data` through exactly the
    // walk it applies to every block's `mock.json` — the rule `eldra-theme validate` enforces —
    // so an error here is a seed the CMS would 400 on deploy.
    expect(scanned.errors).toEqual([]);

    // And proven directly, because an empty error list would also be what a scanner that never
    // looked at the seeds returns: the sample pages carry demo imagery
    // (`{assetId: "demo-hero", url, altText, width, height}`) in `hero.image`, `hero.slides[]`,
    // `split-content.rows[]`, `testimonials.items[]`, `collection-header.image` and `cta.image` —
    // none of it may survive into a seed.
    const seeded = JSON.stringify([scanned.manifest!.templates, scanned.manifest!.templateRoles]);
    // A media value's own `url` key, not the `url` a `link` value legitimately carries for
    // `kind: "url"` — so the match is the demo asset's shape, and a header's `/journal` link is
    // left alone.
    expect(seeded).not.toMatch(/"assetId"\s*:\s*"demo-/);
    expect(seeded).not.toContain('"altText"');
    expect(seeded).not.toContain('demo-');
    // The non-media copy of those same blocks is still there, so the strip took the media and
    // not the block.
    expect(scanned.manifest!.templateRoles!.header!.data.brandText).toBe('Northwind Goods');
  });

  it('strips exactly the media values the CMS refuses, at every nesting depth', () => {
    const asset = '3f1c5a2e-9b4d-4c7a-8e21-0d6f4b9c1a55';
    const fields = [
      { fieldId: 'heading', type: 'string' },
      { fieldId: 'image', type: 'media' },
      { fieldId: 'logo', type: 'media' },
      { fieldId: 'shots', type: 'media', metadata: { multiple: true } },
      {
        fieldId: 'seo',
        type: 'composite',
        metadata: { fields: [{ fieldId: 'share', type: 'media' }] },
      },
      { fieldId: 'photos', type: 'list', metadata: { item: { fieldId: 'item', type: 'media' } } },
      {
        fieldId: 'links',
        type: 'list',
        metadata: {
          item: {
            fieldId: 'item',
            type: 'composite',
            metadata: {
              fields: [
                { fieldId: 'label', type: 'string' },
                {
                  fieldId: 'features',
                  type: 'list',
                  metadata: {
                    item: {
                      fieldId: 'item',
                      type: 'composite',
                      metadata: { fields: [{ fieldId: 'image', type: 'media' }] },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ];
    const data = {
      heading: 'Kept',
      image: { assetId: 'demo-hero', url: '/demo/hero.svg', altText: 'Hero' },
      logo: { assetId: asset, framing: { x: 0.5 } },
      shots: [{ assetId: asset }, { assetId: 'demo-2', url: '/demo/2.svg' }],
      seo: { share: { assetId: 'demo-share', url: '/demo/share.svg' } },
      photos: [{ assetId: 'demo-a', url: '/demo/a.svg' }],
      links: [{ label: 'Shop', features: [{ image: { assetId: 'demo-f', url: '/demo/f.svg' } }] }],
      untyped: { assetId: 'demo-x', url: '/demo/x.svg' },
    };
    const stripped = stripSeedMedia(data, fields, 'demo-block');

    expect(stripped.heading).toBe('Kept');
    // A write-valid value is a real asset the theme meant to seed — kept, `framing` included.
    expect(stripped.logo).toEqual({ assetId: asset, framing: { x: 0.5 } });
    expect(stripped.shots).toEqual([{ assetId: asset }]);
    // Everything else is dropped rather than blanked: absent is what the CMS accepts.
    expect(Object.hasOwn(stripped, 'image')).toBe(false);
    expect(stripped.seo).toEqual({});
    expect(Object.hasOwn(stripped, 'photos')).toBe(false);
    expect(stripped.links).toEqual([{ label: 'Shop', features: [{}] }]);
    // A key no field declares is data the walk never reaches, and is left alone — the block's
    // field list is the only thing that decides what a media value is.
    expect(stripped.untyped).toEqual({ assetId: 'demo-x', url: '/demo/x.svg' });
    // Pure: the caller's fixture is never mutated.
    expect(data.image).toEqual({ assetId: 'demo-hero', url: '/demo/hero.svg', altText: 'Hero' });
  });

  /**
   * Core creates a seed's block entries **published**, so a seed has to satisfy publish
   * validation as well as the write-side media rule — and a published entry cannot omit a value
   * for a `required` field. There is nothing to invent for a media field, so the only honest
   * moves are: drop the list item that carried it, or refuse to seed the block at all.
   */
  it('drops a list item whose required media cannot be seeded, and refuses a block whose own is', () => {
    const required = { required: true };
    const fields = [
      {
        fieldId: 'slides',
        type: 'list',
        metadata: {
          item: {
            fieldId: 'item',
            type: 'composite',
            metadata: {
              fields: [
                { fieldId: 'caption', type: 'string' },
                { fieldId: 'image', type: 'media', validators: required },
              ],
            },
          },
        },
      },
      {
        fieldId: 'people',
        type: 'list',
        metadata: {
          item: {
            fieldId: 'item',
            type: 'composite',
            metadata: {
              fields: [
                { fieldId: 'name', type: 'string' },
                { fieldId: 'avatar', type: 'media' },
              ],
            },
          },
        },
      },
    ];
    const stripped = stripSeedMedia(
      {
        slides: [
          { caption: 'Demo', image: { assetId: 'demo-1', url: '/demo/1.svg' } },
          { caption: 'Real', image: { assetId: '3f1c5a2e-9b4d-4c7a-8e21-0d6f4b9c1a55' } },
          { caption: 'Missing' },
        ],
        people: [{ name: 'Ada', avatar: { assetId: 'demo-2', url: '/demo/2.svg' } }],
      },
      fields,
      'demo-block'
    );
    // The item whose required image was stripped goes, and so does the one that never had it.
    // The item carrying a real asset id stays, image and all.
    expect(stripped.slides).toEqual([
      { caption: 'Real', image: { assetId: '3f1c5a2e-9b4d-4c7a-8e21-0d6f4b9c1a55' } },
    ]);
    // An *optional* media field in a list item only costs the field, never the item.
    expect(stripped.people).toEqual([{ name: 'Ada' }]);

    // At the top level of a block there is no item to drop, so the block is unseedable and the
    // build fails rather than seeding an entry Core refuses to publish. Same for a required media
    // inside a non-list `composite`: a composite is one value, so it has nothing to drop either.
    const topLevel = [{ fieldId: 'image', type: 'media', validators: required }];
    expect(() =>
      stripSeedMedia({ image: { assetId: 'demo-1', url: '/demo/1.svg' } }, topLevel, 'wallpaper')
    ).toThrow(/wallpaper: cannot be seeded .* "image"/);
    // Absent is just as unpublishable as stripped, so it is refused the same way.
    expect(() => stripSeedMedia({}, topLevel, 'wallpaper')).toThrow(/"image"/);
    expect(() =>
      stripSeedMedia(
        { seo: { share: { assetId: 'demo-1', url: '/demo/1.svg' } } },
        [
          {
            fieldId: 'seo',
            type: 'composite',
            metadata: { fields: [{ fieldId: 'share', type: 'media', validators: required }] },
          },
        ],
        'wallpaper'
      )
    ).toThrow(/"seo.share"/);
  });

  it('seeds no list item that is missing a required media field', () => {
    // The `hero` seed is the live case: all four of the home fixture's slides require an image,
    // and all four carry demo imagery, so the seeded hero renders with an empty slideshow rather
    // than four entries Core would refuse to publish. (Its `mock.json` omits `slides` entirely,
    // which is the same shape an author gets on insert.)
    const home = scanned.manifest!.templates!.find((template) => template.schemaApiId === 'home')!;
    const hero = home.blocks.find((block) => block.apiId === 'hero')!;
    expect(hero.data.slides).toEqual([]);

    // And the rule generally, walked against each block's own declared field types: no seed
    // block (or role) may carry a list item without a value for a media field the block marks
    // required, because Core creates these entries published.
    const offenders: string[] = [];
    const byApiId = new Map(scanned.manifest!.blocks.map((block) => [block.apiId, block.fields]));
    const walk = (
      fields: ThemeBlockManifestField[],
      data: Record<string, unknown>,
      at: string
    ): void => {
      for (const field of fields) {
        const value = data[field.fieldId];
        const path = `${at}.${field.fieldId}`;
        if (
          field.type === 'media' &&
          field.validators?.required === true &&
          !Object.hasOwn(data, field.fieldId)
        ) {
          offenders.push(path);
        }
        if (field.type === 'composite' && isPlainRecord(value)) {
          walk(field.metadata?.fields ?? [], value, path);
        }
        if (field.type === 'list' && Array.isArray(value)) {
          const item = field.metadata?.item;
          if (item?.type !== 'composite') continue;
          value.forEach((entry, index) => {
            if (isPlainRecord(entry)) walk(item.metadata?.fields ?? [], entry, `${path}[${index}]`);
          });
        }
      }
    };
    const seeded: Array<[string, string, Record<string, unknown>]> = [
      ...scanned.manifest!.templates!.flatMap((template) =>
        template.blocks.map(
          (block) =>
            [block.apiId, `${template.routePattern} ${block.id}`, block.data] as [
              string,
              string,
              Record<string, unknown>,
            ]
        )
      ),
      ['navigation', 'templateRoles.header', scanned.manifest!.templateRoles!.header!.data],
      ['footer', 'templateRoles.footer', scanned.manifest!.templateRoles!.footer!.data],
    ];
    for (const [apiId, where, data] of seeded) walk(byApiId.get(apiId) ?? [], data, where);

    expect(offenders).toEqual([]);
    // Guards the scan itself: the starter declares required media in two list items
    // (`hero.slides[].image`, `gallery.items[].image`), and `hero` is seeded.
    expect([...byApiId.values()].flatMap((fields) => requiredListMediaFieldIds(fields))).toContain(
      'slides[].image'
    );
  });
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `<list>[].<media>` path under one block whose media item is `required`. */
function requiredListMediaFieldIds(fields: ThemeBlockManifestField[], prefix = ''): string[] {
  const out: string[] = [];
  for (const field of fields) {
    const path = prefix === '' ? field.fieldId : `${prefix}.${field.fieldId}`;
    if (field.type === 'media' && field.validators?.required === true) out.push(path);
    const item = field.metadata?.item;
    if (item?.type === 'composite') {
      out.push(...requiredListMediaFieldIds(item.metadata?.fields ?? [], `${path}[]`));
    }
    if (field.type === 'composite') {
      out.push(...requiredListMediaFieldIds(field.metadata?.fields ?? [], path));
    }
  }
  return out;
}
