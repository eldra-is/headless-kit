// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { linkTargetKeys, resolveLink, safeLinkHref, type LinkRouteContext } from '../links';
import { encodeStega, type StegaMeta } from '../stega';

const META: StegaMeta = { entryId: 'e1', fieldPath: 'links', locale: null };

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const ARTICLE_ID = '44444444-4444-4444-8444-444444444444';

/** The starter's own two catalog templates, plus one entry template. */
const templates = [
  {
    id: 't-product',
    data: { schemaApiId: 'catalog:product', routePattern: '/products/:slug', slugField: 'slug' },
  },
  {
    id: 't-collection',
    data: {
      schemaApiId: 'catalog:collection',
      routePattern: '/collections/:slug',
      slugField: 'slug',
    },
  },
  {
    id: 't-article',
    data: { schemaApiId: 'article', routePattern: '/journal/:slug', slugField: 'slug' },
  },
];

const pages = [
  { id: 'p-home', data: { slug: 'home' } },
  { id: 'p-about', data: { slug: 'about' } },
  { id: 'p-team', data: { slug: 'team', parent: 'p-about' } },
];

function context(overrides: Partial<LinkRouteContext> = {}): LinkRouteContext {
  return {
    pages,
    templates,
    targets: new Map([
      [`product:${PRODUCT_ID}`, { slug: 'ash-glaze-mug', title: 'Ash glaze mug' }],
      [`collection:${COLLECTION_ID}`, { slug: 'knitwear', title: 'Knitwear' }],
      [`category:${CATEGORY_ID}`, { slug: 'tableware', title: 'Tableware' }],
      [
        `entry:${ARTICLE_ID}`,
        { slug: 'carding-wool', title: 'Carding wool', schemaApiId: 'article' },
      ],
    ]),
    ...overrides,
  };
}

describe('resolveLink — one branch per kind', () => {
  it("resolves a product through the site's own /products/:slug template", () => {
    expect(
      resolveLink({ kind: 'product', target: { _type: 'product', id: PRODUCT_ID } }, context())
    ).toEqual({
      href: '/products/ash-glaze-mug',
      label: 'Ash glaze mug',
      newTab: false,
      group: null,
      children: [],
    });
  });

  it('resolves a collection through /collections/:slug — the kind is the only difference', () => {
    expect(
      resolveLink(
        { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
        context()
      )?.href
    ).toBe('/collections/knitwear');
  });

  it('keys a product and a collection with the same id separately', () => {
    const sameId = context({
      targets: new Map([
        [`product:${PRODUCT_ID}`, { slug: 'a-product' }],
        [`collection:${PRODUCT_ID}`, { slug: 'a-collection' }],
      ]),
    });
    expect(
      resolveLink({ kind: 'product', target: { _type: 'product', id: PRODUCT_ID } }, sameId)?.href
    ).toBe('/products/a-product');
    expect(
      resolveLink({ kind: 'collection', target: { _type: 'collection', id: PRODUCT_ID } }, sameId)
        ?.href
    ).toBe('/collections/a-collection');
  });

  it("resolves an entry through the template serving the target's own schema", () => {
    expect(
      resolveLink({ kind: 'entry', target: { _type: 'entry', id: ARTICLE_ID } }, context())?.href
    ).toBe('/journal/carding-wool');
  });

  it('resolves a page through the page tree, parents included', () => {
    const targets = new Map([['page:p-team', { title: 'The team' }]]);
    expect(
      resolveLink({ kind: 'page', target: { _type: 'page', id: 'p-team' } }, context({ targets }))
    ).toEqual({
      href: '/about/team',
      label: 'The team',
      newTab: false,
      group: null,
      children: [],
    });
  });

  it("resolves a page from the site's own page list, with or without a targets entry", () => {
    // A page's path comes from the page tree, not from the target lookup: the
    // lookup only supplies the title a blank label falls back to.
    expect(
      resolveLink(
        { kind: 'page', target: { _type: 'page', id: 'p-about' }, label: 'About' },
        context()
      )
    ).toMatchObject({ href: '/about', label: 'About' });
  });

  it('resolves a url kind through the href allowlist', () => {
    expect(resolveLink({ kind: 'url', url: '/journal', label: 'Journal' }, context())?.href).toBe(
      '/journal'
    );
    expect(resolveLink({ kind: 'url', url: 'javascript:alert(1)' }, context())?.href).toBeNull();
  });

  it('resolves a heading to a label and its children, and never to an href', () => {
    expect(
      resolveLink(
        {
          kind: 'none',
          label: 'Shop',
          children: [{ kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } }],
        },
        context()
      )
    ).toEqual({
      href: null,
      label: 'Shop',
      newTab: false,
      group: null,
      children: [
        {
          href: '/collections/knitwear',
          label: 'Knitwear',
          newTab: false,
          group: null,
          children: [],
        },
      ],
    });
  });

  it('resolves a category, so a theme that ships the route needs no further change', () => {
    const withCategoryRoute = context({
      templates: [
        ...templates,
        {
          id: 't-category',
          data: {
            schemaApiId: 'catalog:category',
            routePattern: '/categories/:slug',
            slugField: 'slug',
          },
        },
      ],
    });
    expect(
      resolveLink(
        { kind: 'category', target: { _type: 'category', id: CATEGORY_ID } },
        withCategoryRoute
      )?.href
    ).toBe('/categories/tableware');
  });

  /**
   * **A catch-all template is addressed by the target's whole canonical path.** A category route is
   * canonical-only (`/categories/<root>/<child>`), so a leaf slug on its own is a path the site
   * answers with its not-found shell — a link that looks live and 404s. The target's `path` is what
   * resolves it, and a target that carries none resolves to no href at all, which a theme renders
   * as plain text.
   */
  it('builds a catch-all category href from the target path, and nothing without one', () => {
    const catchAllTemplates = [
      ...templates,
      {
        id: 't-category',
        data: {
          schemaApiId: 'catalog:category',
          routePattern: '/categories/:path*',
          slugField: 'path',
        },
      },
    ];
    const link = { kind: 'category', target: { _type: 'category', id: CATEGORY_ID } };

    const placed = context({
      templates: catchAllTemplates,
      targets: new Map([
        [
          `category:${CATEGORY_ID}`,
          { slug: 'bilstolar', title: 'Bílstólar', path: 'billinn/bilstolar' },
        ],
      ]),
    });
    expect(resolveLink(link, placed)?.href).toBe('/categories/billinn/bilstolar');

    const unplaced = context({ templates: catchAllTemplates });
    expect(resolveLink(link, unplaced)).toEqual({
      href: null,
      label: 'Tableware',
      newTab: false,
      group: null,
      children: [],
    });
  });
});

describe('resolveLink — everything that does not resolve', () => {
  it.each([
    ['a value that is not an object', 'https://example.com'],
    ['a value with no kind', { target: { _type: 'page', id: 'p-about' } }],
    ['an unknown kind', { kind: 'blog', url: '/journal' }],
  ])('returns null for %s', (_label, value) => {
    expect(resolveLink(value, context())).toBeNull();
  });

  it('renders no href when the target is not in the context at all', () => {
    const resolved = resolveLink(
      { kind: 'collection', target: { _type: 'collection', id: 'deleted' }, label: 'Knitwear' },
      context()
    );
    expect(resolved).toEqual({
      href: null,
      label: 'Knitwear',
      newTab: false,
      group: null,
      children: [],
    });
  });

  it('renders no href when the target is known but carries no slug', () => {
    const targets = new Map([[`collection:${COLLECTION_ID}`, { title: 'Knitwear' }]]);
    expect(
      resolveLink(
        { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
        context({ targets })
      )
    ).toEqual({ href: null, label: 'Knitwear', newTab: false, group: null, children: [] });
  });

  it('renders no href when no route template serves the kind', () => {
    expect(
      resolveLink({ kind: 'category', target: { _type: 'category', id: CATEGORY_ID } }, context())
        ?.href
    ).toBeNull();
  });

  it('renders no href for an entry whose schema has no template, or that reports no schema', () => {
    const targets = new Map([
      [`entry:${ARTICLE_ID}`, { slug: 'x', schemaApiId: 'recipe' }],
      ['entry:no-schema', { slug: 'y' }],
    ]);
    expect(
      resolveLink(
        { kind: 'entry', target: { _type: 'entry', id: ARTICLE_ID } },
        context({ targets })
      )?.href
    ).toBeNull();
    expect(
      resolveLink(
        { kind: 'entry', target: { _type: 'entry', id: 'no-schema' } },
        context({ targets })
      )?.href
    ).toBeNull();
  });

  it('renders no href for a page the site does not have, and for a target with no id', () => {
    const targets = new Map([['page:gone', {}]]);
    expect(
      resolveLink({ kind: 'page', target: { _type: 'page', id: 'gone' } }, context({ targets }))
        ?.href
    ).toBeNull();
    expect(
      resolveLink({ kind: 'page', target: { _type: 'page', id: '' } }, context())?.href
    ).toBeNull();
  });

  it("renders no href when the matching template's pattern is unusable", () => {
    const broken = context({
      templates: [
        {
          id: 't',
          data: {
            schemaApiId: 'catalog:collection',
            routePattern: '/collections/',
            slugField: 'slug',
          },
        },
      ],
    });
    expect(
      resolveLink(
        { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
        broken
      )?.href
    ).toBeNull();
  });

  it('renders no href for a slug a path cannot be built from', () => {
    const targets = new Map([[`collection:${COLLECTION_ID}`, { slug: 'winter/knits' }]]);
    expect(
      resolveLink(
        { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
        context({ targets })
      )?.href
    ).toBeNull();
  });
});

describe('resolveLink — label, group, new tab and children', () => {
  it("prefers the value's own label, falls back to the target's title, then to null", () => {
    const own = resolveLink(
      {
        kind: 'collection',
        target: { _type: 'collection', id: COLLECTION_ID },
        label: 'Winter knits',
      },
      context()
    );
    expect(own?.label).toBe('Winter knits');

    const blank = resolveLink(
      { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID }, label: '   ' },
      context()
    );
    expect(blank?.label).toBe('Knitwear');

    expect(resolveLink({ kind: 'url', url: '/journal' }, context())?.label).toBeNull();
  });

  it('reports the new-tab flag and a non-blank group', () => {
    expect(
      resolveLink(
        { kind: 'url', url: 'https://example.com', openInNewTab: true, group: 'Women' },
        context()
      )
    ).toMatchObject({ newTab: true, group: 'Women' });
    expect(resolveLink({ kind: 'url', url: '/a', group: '  ' }, context())?.group).toBeNull();
  });

  it("resolves children one level and ignores a child's own children", () => {
    const resolved = resolveLink(
      {
        kind: 'collection',
        target: { _type: 'collection', id: COLLECTION_ID },
        children: [
          {
            kind: 'product',
            target: { _type: 'product', id: PRODUCT_ID },
            group: 'Women',
            children: [{ kind: 'url', url: '/deeper' }],
          },
          'not a link',
        ],
      },
      context()
    );
    expect(resolved?.children).toEqual([
      {
        href: '/products/ash-glaze-mug',
        label: 'Ash glaze mug',
        newTab: false,
        group: 'Women',
        children: [],
      },
    ]);
  });

  it('keeps the label and group as authored, so a preview can still edit them inline', () => {
    // Only the emptiness test strips: a stripped label would lose the
    // invisible payload Studio's overlay decorates an editable field with.
    const label = encodeStega('Knitwear', META);
    const group = encodeStega('Women', META);
    const resolved = resolveLink({ kind: 'url', url: '/x', label, group }, context());
    expect(resolved?.label).toBe(label);
    expect(resolved?.group).toBe(group);
  });

  it("falls back to the target's title with its own markers intact", () => {
    const title = encodeStega('Knitwear', META);
    const targets = new Map([[`collection:${COLLECTION_ID}`, { slug: 'knitwear', title }]]);
    expect(
      resolveLink(
        { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
        context({ targets })
      )?.label
    ).toBe(title);
  });

  it('strips stega markers out of every string a route is derived from', () => {
    const targets = new Map([
      [`collection:${COLLECTION_ID}`, { slug: encodeStega('knitwear', META) }],
    ]);
    const resolved = resolveLink(
      {
        kind: encodeStega('collection', META),
        target: { _type: encodeStega('collection', META), id: COLLECTION_ID },
        label: encodeStega('Knitwear', META),
      },
      context({ targets })
    );
    expect(resolved?.href).toBe('/collections/knitwear');
  });
});

describe('linkTargetKeys', () => {
  it("collects a value's own target and its children's, deduplicated and in order", () => {
    expect(
      linkTargetKeys({
        kind: 'collection',
        target: { _type: 'collection', id: COLLECTION_ID },
        children: [
          { kind: 'product', target: { _type: 'product', id: PRODUCT_ID } },
          { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } },
          { kind: 'url', url: '/journal' },
        ],
      })
    ).toEqual([`collection:${COLLECTION_ID}`, `product:${PRODUCT_ID}`]);
  });

  it('keys a product and a collection sharing an id as two lookups', () => {
    expect(
      linkTargetKeys({
        kind: 'product',
        target: { _type: 'product', id: PRODUCT_ID },
        children: [{ kind: 'collection', target: { _type: 'collection', id: PRODUCT_ID } }],
      })
    ).toEqual([`product:${PRODUCT_ID}`, `collection:${PRODUCT_ID}`]);
  });

  it('returns nothing for a value that names no target', () => {
    expect(linkTargetKeys({ kind: 'url', url: '/journal' })).toEqual([]);
    expect(linkTargetKeys('https://example.com')).toEqual([]);
    expect(linkTargetKeys({ kind: 'collection', target: { _type: 'collection' } })).toEqual([]);
  });
});

/**
 * The allowlist is the platform write side's, rule for rule. These two tables
 * are that rule's own accept/refuse cases: every row here is a value the write
 * boundary decides the same way, so a drift in either half fails here rather
 * than at deploy time, where an author can only see it as a refusal.
 */
describe('safeLinkHref', () => {
  it.each([
    ['a rooted path', '/collections/knitwear'],
    ['a path with a query', '/search?q=wool'],
    ['an in-page hash that names something', '#main'],
    ['https', 'https://example.com/x'],
    ['http', 'http://example.com/x'],
    ['an uppercase scheme', 'HTTPS://example.com/x'],
    ['mailto', 'mailto:hello@example.com'],
    ['tel', 'tel:+3545550000'],
    ['an uppercase mailto', 'MAILTO:hello@example.com'],
    ['a 2048-byte href', `/${'a'.repeat(2047)}`],
    ['a multi-byte href inside the byte budget', `/${'é'.repeat(1023)}`],
  ])('accepts %s', (_label, href) => {
    expect(safeLinkHref(href)).toBe(href);
  });

  it.each([
    ['a protocol-relative url', '//evil.com'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['a backslash', '/collections\\..\\admin'],
    ['a C0 control character', `/collections/${String.fromCodePoint(0x01)}knitwear`],
    ['a DEL character', `/collections/${String.fromCodePoint(0x7f)}knitwear`],
    ['the first C1 control character', `/collections/${String.fromCodePoint(0x80)}knitwear`],
    ['the C1 next line character', `/collections/${String.fromCodePoint(0x85)}knitwear`],
    ['the last C1 control character', `/collections/${String.fromCodePoint(0x9f)}knitwear`],
    ['a 2049-byte href', `/${'a'.repeat(2048)}`],
    ['2048 UTF-16 units that are more than 2048 bytes', `/${'é'.repeat(2047)}`],
    ['a blank string', '   '],
    ['a bare handle', 'knitwear'],
    ['a non-string', 42],
    ['a scheme with no slashes', 'https:example.com'],
    ['a scheme with one slash', 'http:/example.com'],
    ['a scheme with no host', 'https://'],
    ['a bare hash', '#'],
    ['a bare mailto', 'mailto:'],
    ['a bare tel', 'tel:'],
  ])('rejects %s', (_label, href) => {
    expect(safeLinkHref(href)).toBeNull();
  });

  it('trims and strips stega before deciding', () => {
    expect(safeLinkHref(`  ${encodeStega('/journal', META)}  `)).toBe('/journal');
  });
});
