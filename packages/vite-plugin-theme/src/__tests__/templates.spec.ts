import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanTheme } from '../scan';
import {
  seedLayout,
  validatePageSeeds,
  validateTemplateRoles,
  validateTemplateSeeds,
} from '../templates';
import type {
  DeclaredPageSeed,
  DeclaredPageSeedBlock,
  DeclaredSeed,
  DeclaredTemplateSeed,
  ManifestTemplateRoles,
} from '../types';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const blocks = [
  {
    apiId: 'hero',
    fields: [{ fieldId: 'heading', name: 'Heading', type: 'string' }],
  },
  {
    apiId: 'gallery',
    fields: [{ fieldId: 'image', name: 'Image', type: 'media' }],
  },
];

const heroSeed = (): DeclaredTemplateSeed => ({
  routePattern: '/products/:slug',
  schemaApiId: 'catalog:product',
  title: 'Product',
  blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' } }],
});

const validate = (seeds: DeclaredTemplateSeed[]) => {
  const errors: string[] = [];
  const templates = validateTemplateSeeds(seeds, blocks, errors);
  return { templates, errors };
};

/** Every half of the same declared list, in the order the scan runs them: the
 *  templates, then the roles (a page seed's region placement needs them), then
 *  the page seeds. */
const validateSeeds = (seeds: DeclaredSeed[], roles: ManifestTemplateRoles = bothRoles()) => {
  const errors: string[] = [];
  const templates = validateTemplateSeeds(seeds, blocks, errors);
  const templateRoles = validateTemplateRoles(roles, blocks, templates, errors);
  const pageSeeds = validatePageSeeds(seeds, blocks, templates, templateRoles, errors);
  return { templates, pageSeeds, errors };
};

/** The roles a template seed's layout and a page seed's `@header`/`@footer`
 *  placements both resolve against — declared by default, since every template
 *  seed places them and `validateTemplateRoles` requires them once placed. */
const bothRoles = (): ManifestTemplateRoles => ({
  header: { apiId: 'hero', data: {} },
  footer: { apiId: 'hero', data: {} },
});

const cartSeed = (): DeclaredPageSeed => ({
  page: { slug: 'cart' },
  title: 'Your cart',
  blocks: [{ apiId: 'hero', data: { heading: 'Your cart' }, required: true }],
});

const validateRoles = (roles: ManifestTemplateRoles | undefined, seeds: DeclaredTemplateSeed[]) => {
  const seedErrors: string[] = [];
  const templates = validateTemplateSeeds(seeds, blocks, seedErrors);
  const errors: string[] = [];
  const roleData = validateTemplateRoles(roles, blocks, templates, errors);
  return { roles: roleData, errors };
};

describe('validateTemplateSeeds', () => {
  it('generates a column layout with the header and footer roles around the blocks', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'story', apiId: 'hero', data: { heading: 'Our story' } });
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout).toEqual({
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'role-header', type: 'reusable', role: 'header' },
          { id: 'hero-1', type: 'block', entryId: 'hero-1' },
          { id: 'story', type: 'block', entryId: 'story' },
          { id: 'role-footer', type: 'reusable', role: 'footer' },
        ],
      },
    });
  });

  it('omits the header role when header is false, and never emits the header/footer booleans', () => {
    const { templates, errors } = validate([{ ...heroSeed(), header: false }]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      { id: 'hero-1', type: 'block', entryId: 'hero-1' },
      { id: 'role-footer', type: 'reusable', role: 'footer' },
    ]);
    expect(templates[0]).not.toHaveProperty('header');
    expect(templates[0]).not.toHaveProperty('footer');
  });

  it('omits the footer role when footer is false', () => {
    const { templates, errors } = validate([{ ...heroSeed(), footer: false }]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      { id: 'role-header', type: 'reusable', role: 'header' },
      { id: 'hero-1', type: 'block', entryId: 'hero-1' },
    ]);
  });

  it('errors on a seed block whose data fails the block field validation the scanner applies to mock.json', () => {
    const seed = heroSeed();
    seed.blocks.push({
      id: 'gallery-1',
      apiId: 'gallery',
      data: { image: { assetId: 'demo-hero', url: '/demo/hero.png' } },
    });
    const { errors } = validate([seed]);

    expect(errors).toEqual([
      'templates[0].blocks[1].data — image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('accepts a write-valid media seed', () => {
    const seed = heroSeed();
    seed.blocks.push({
      id: 'gallery-1',
      apiId: 'gallery',
      data: { image: { assetId: '3f0b6b3e-5f1a-4a1e-9c2f-0b6d9f8a1c22' } },
    });

    expect(validate([seed]).errors).toEqual([]);
  });

  it('errors on a seed block naming an apiId the theme does not ship', () => {
    const seed = heroSeed();
    seed.blocks = [{ id: 'gone-1', apiId: 'gone', data: {} }];

    expect(validate([seed]).errors).toEqual([
      'templates[0].blocks[0].apiId — unknown block "gone"',
    ]);
  });

  it('errors on duplicate block ids within a seed', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'hero-1', apiId: 'hero', data: { heading: 'Again' } });

    expect(validate([seed]).errors).toEqual(['templates[0].blocks[1].id — duplicate id "hero-1"']);
  });

  it('errors on a block id that is not a valid node id', () => {
    const seed = heroSeed();
    seed.blocks = [{ id: 'Hero_1', apiId: 'hero', data: {} }];

    expect(validate([seed]).errors).toEqual([
      'templates[0].blocks[0].id — invalid id "Hero_1" (expected ^[a-z][a-z0-9-]{0,47}$)',
    ]);
  });

  it('errors above eight seeds and validates only the first eight', () => {
    const seeds = Array.from({ length: 9 }, (_, index) => ({
      ...heroSeed(),
      routePattern: `/p${index}/:slug`,
    }));
    const { templates, errors } = validate(seeds);

    expect(errors).toEqual(['templates: contains 9 templates — exceeds 8']);
    expect(templates).toHaveLength(8);
  });

  it('errors on an unknown schemaApiId, an invalid routePattern and a duplicate pattern', () => {
    const { errors } = validate([
      { ...heroSeed(), schemaApiId: 'page' as DeclaredTemplateSeed['schemaApiId'] },
      { ...heroSeed(), routePattern: 'products/:slug' },
      heroSeed(),
      { ...heroSeed(), title: '  ' },
    ]);

    expect(errors).toEqual([
      'templates[0].schemaApiId — must be "catalog:product", "catalog:collection" or "home" (a static page seed names `page: { slug }` instead)',
      'templates[1].routePattern — a catalog template needs a static prefix and one ":slug" parameter (got "products/:slug")',
      'templates[2].routePattern — duplicate pattern "/products/:slug"',
      'templates[3].title — must contain 1..80 characters',
      'templates[3].routePattern — duplicate pattern "/products/:slug"',
    ]);
  });

  it('holds the home seed to the site root', () => {
    const home = (routePattern: string): DeclaredTemplateSeed => ({
      ...heroSeed(),
      routePattern,
      schemaApiId: 'home',
      title: 'Home',
    });

    expect(validate([home('/')]).errors).toEqual([]);
    expect(validate([home('/home')]).errors).toEqual([
      'templates[0].routePattern — the home seed must be "/" (got "/home")',
    ]);
  });

  it('holds a catalog seed to one ":slug" parameter', () => {
    const catalog = (routePattern: string): DeclaredTemplateSeed => ({
      ...heroSeed(),
      routePattern,
      schemaApiId: 'catalog:collection',
    });

    expect(validate([catalog('/collections/:slug')]).errors).toEqual([]);
    expect(validate([catalog('/collections/:handle')]).errors).toEqual([
      'templates[0].routePattern — a catalog template is resolved by slug, so its parameter must be ":slug" (got ":handle")',
    ]);
    expect(validate([catalog('/collections')]).errors).toEqual([
      'templates[0].routePattern — a catalog template needs a static prefix and one ":slug" parameter (got "/collections")',
    ]);
    expect(validate([catalog('/')]).errors).toEqual([
      'templates[0].routePattern — a catalog template needs a static prefix and one ":slug" parameter (got "/")',
    ]);
  });

  it('names the index of a seed or a seed block that is not an object', () => {
    const seed = heroSeed();
    seed.blocks = [
      null,
      { id: 'hero-1', apiId: 'hero', data: { heading: 'Hi' } },
    ] as unknown as DeclaredTemplateSeed['blocks'];
    const { errors } = validate([null as unknown as DeclaredTemplateSeed, seed]);

    expect(errors).toEqual([
      'templates[0] — must be an object',
      'templates[1].blocks[0] — must be an object',
    ]);
  });

  it('errors on seed block data that is not an object', () => {
    const seed = heroSeed();
    seed.blocks = [
      { id: 'hero-1', apiId: 'hero', data: 'Buy this' },
    ] as unknown as DeclaredTemplateSeed['blocks'];

    expect(validate([seed]).errors).toEqual(['templates[0].blocks[0].data — must be an object']);
  });

  it('errors on a seed with no blocks', () => {
    const seed = heroSeed();
    seed.blocks = [];

    expect(validate([seed]).errors).toEqual(['templates[0].blocks — must declare 1..50 blocks']);
  });

  it('carries a seed block’s templates and bindings onto its generated layout node', () => {
    const seed = heroSeed();
    seed.blocks = [
      {
        id: 'hero-1',
        apiId: 'hero',
        data: { heading: 'Buy this' },
        templates: { heading: '{{ title }}' },
        bindings: { heading: 'title' },
      },
    ];
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      { id: 'role-header', type: 'reusable', role: 'header' },
      {
        id: 'hero-1',
        type: 'block',
        entryId: 'hero-1',
        templates: { heading: '{{ title }}' },
        bindings: { heading: 'title' },
      },
      { id: 'role-footer', type: 'reusable', role: 'footer' },
    ]);
    // The maps belong to the node, never to the block the CMS entry is written
    // from: `blocks[]` still carries exactly the three keys Core decodes.
    expect(templates[0]?.blocks).toEqual([
      { id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' } },
    ]);
  });

  it('carries them onto a declared layout’s node too, matched by entryId', () => {
    const seed = heroSeed();
    seed.blocks = [
      {
        id: 'hero-1',
        apiId: 'hero',
        data: { heading: 'Buy this' },
        templates: { heading: 'Now: {{ title }}' },
      },
    ];
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
      },
    };
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      {
        id: 'hero-node',
        type: 'block',
        entryId: 'hero-1',
        templates: { heading: 'Now: {{ title }}' },
      },
    ]);
  });

  it('emits neither key for a seed block that declares no bindings', () => {
    const { templates } = validate([heroSeed()]);
    const node = templates[0]?.layout.root.children[1];

    expect(node).toEqual({ id: 'hero-1', type: 'block', entryId: 'hero-1' });
    expect(node).not.toHaveProperty('templates');
    expect(node).not.toHaveProperty('bindings');
  });

  it('errors on a target path that is not a path into the block’s own fields', () => {
    const seed = heroSeed();
    seed.blocks = [
      {
        id: 'hero-1',
        apiId: 'hero',
        data: { heading: 'Buy this' },
        templates: { subheading: '{{ title }}', 'Heading.0': '{{ title }}' },
        bindings: { 'heading.0.text': 'title' },
      },
    ];
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([
      `templates[0].blocks[0].templates.subheading — must be a path into hero's fields (expected ${'^[a-z][a-zA-Z0-9]{0,48}(?:\\.(?:[a-z][a-zA-Z0-9]{0,48}|0|[1-9][0-9]*))*$'})`,
      `templates[0].blocks[0].templates.Heading.0 — must be a path into hero's fields (expected ${'^[a-z][a-zA-Z0-9]{0,48}(?:\\.(?:[a-z][a-zA-Z0-9]{0,48}|0|[1-9][0-9]*))*$'})`,
    ]);
    // A list index below a declared field is part of the grammar, so the
    // binding above survives and reaches the node.
    expect(templates[0]?.layout.root.children[1]).toEqual({
      id: 'hero-1',
      type: 'block',
      entryId: 'hero-1',
      bindings: { 'heading.0.text': 'title' },
    });
  });

  it('errors on a binding value that is not a non-empty string, and on a map that is not an object', () => {
    const seed = heroSeed();
    seed.blocks = [
      {
        id: 'hero-1',
        apiId: 'hero',
        data: { heading: 'Buy this' },
        templates: { heading: '' },
        bindings: 'title' as unknown as Record<string, string>,
      },
    ];
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([
      'templates[0].blocks[0].templates.heading — must be a non-empty string',
      'templates[0].blocks[0].bindings — must be an object',
    ]);
    expect(templates[0]?.layout.root.children[1]).toEqual({
      id: 'hero-1',
      type: 'block',
      entryId: 'hero-1',
    });
  });

  it('keeps a declared layout and checks its nodes', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'site-footer', type: 'reusable', role: 'footer' },
        ],
      },
    };
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout).toEqual(seed.layout);
  });

  it('emits only the keys the deploy decodes, dropping anything else a seed carries', () => {
    const seed = { ...heroSeed(), seededBy: 'me' } as unknown as DeclaredTemplateSeed;
    seed.blocks = [
      { id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' }, note: 'why' },
    ] as unknown as DeclaredTemplateSeed['blocks'];
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' }, gap: { normal: '16px' } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1', style: { width: '10px' } }],
      },
    } as unknown as DeclaredTemplateSeed['layout'];
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]).toEqual({
      routePattern: '/products/:slug',
      schemaApiId: 'catalog:product',
      title: 'Product',
      blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' } }],
      layout: {
        version: 1,
        root: {
          id: 'root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
        },
      },
    });
  });

  it('errors on a layout node referencing an undeclared block, an unknown role or a duplicate id', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'ghost', type: 'block', entryId: 'nope' },
          { id: 'ghost', type: 'reusable', role: 'sidebar' as 'header' },
        ],
      },
    };

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout.root.children[1].entryId — no seed block with id "nope"',
      'templates[0].layout.root.children[2].id — duplicate node id "ghost"',
      'templates[0].layout.root.children[2].role — must be "header" or "footer"',
    ]);
  });

  it('errors on a layout version other than 1', () => {
    const seed = heroSeed();
    seed.layout = { version: 2, root: {} } as unknown as DeclaredTemplateSeed['layout'];

    expect(validate([seed]).errors).toEqual(['templates[0].layout.version — must be 1']);
  });

  it('errors on a duplicate role and on a child that is neither a reusable nor a block node', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'top', type: 'reusable', role: 'header' },
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'second-header', type: 'reusable', role: 'header' },
          { id: 'column', type: 'flex', children: [] },
        ],
      },
    } as unknown as DeclaredTemplateSeed['layout'];

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout.root.children[2].role — duplicate role "header"',
      'templates[0].layout.root.children[3].type — must be "reusable" or "block" (got "flex")',
    ]);
  });

  it('errors when a declared layout leaves a seed block unplaced', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'orphan', apiId: 'hero', data: { heading: 'Nowhere' } });
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
      },
    };

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout — seed block "orphan" is not placed in the layout',
    ]);
  });

  it('refuses a declared layout whose root is not a column flex container', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'grid',
        layout: { columns: { normal: 2 } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
      },
    } as unknown as DeclaredTemplateSeed['layout'];

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout.root — must be a flex container with direction.normal "column"',
    ]);
  });
});

describe('validateTemplateRoles', () => {
  it('emits valid roles in manifest shape', () => {
    const { roles, errors } = validateRoles(
      {
        header: { apiId: 'hero', data: { heading: 'Site header' } },
        footer: { apiId: 'hero', data: { heading: 'Site footer' } },
      },
      [heroSeed()]
    );

    expect(errors).toEqual([]);
    expect(roles).toEqual({
      header: { apiId: 'hero', data: { heading: 'Site header' } },
      footer: { apiId: 'hero', data: { heading: 'Site footer' } },
    });
  });

  it('requires a role the default (generated) layout places', () => {
    const { roles, errors } = validateRoles(undefined, [heroSeed()]);

    expect(errors).toEqual([
      'templateRoles.header — required: templates[0] places the header role',
      'templateRoles.footer — required: templates[0] places the footer role',
    ]);
    expect(roles).toBeUndefined();
  });

  it('requires a role a declared layout places, naming the seed that places it', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'site-footer', type: 'reusable', role: 'footer' },
        ],
      },
    };
    const { roles, errors } = validateRoles(undefined, [seed]);

    expect(errors).toEqual([
      'templateRoles.footer — required: templates[0] places the footer role',
    ]);
    expect(roles).toBeUndefined();
  });

  it('does not require a role no seed places', () => {
    const { roles, errors } = validateRoles(undefined, [
      { ...heroSeed(), header: false, footer: false },
    ]);

    expect(errors).toEqual([]);
    expect(roles).toBeUndefined();
  });

  it('errors on a role naming an apiId the theme does not ship', () => {
    const { errors } = validateRoles({ header: { apiId: 'gone', data: {} } }, [heroSeed()]);

    expect(errors).toEqual([
      'templateRoles.header.apiId — unknown block "gone"',
      'templateRoles.footer — required: templates[0] places the footer role',
    ]);
  });

  it("errors on a role's data failing the block field validation the scanner applies to mock.json", () => {
    const { errors } = validateRoles(
      {
        header: {
          apiId: 'gallery',
          data: { image: { assetId: 'demo-hero', url: '/demo/hero.png' } },
        },
        footer: { apiId: 'hero', data: { heading: 'Site footer' } },
      },
      [heroSeed()]
    );

    expect(errors).toEqual([
      'templateRoles.header.data — image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('errors on role data that is not an object', () => {
    const { errors } = validateRoles(
      {
        header: { apiId: 'hero', data: 'nope' } as unknown as {
          apiId: string;
          data: Record<string, unknown>;
        },
        footer: { apiId: 'hero', data: { heading: 'Site footer' } },
      },
      [heroSeed()]
    );

    expect(errors).toEqual(['templateRoles.header.data — must be an object']);
  });

  it('errors on a role that is not an object', () => {
    const { errors } = validateRoles(
      { header: 'nope' as unknown as { apiId: string; data: Record<string, unknown> } },
      [heroSeed()]
    );

    expect(errors).toEqual([
      'templateRoles.header — must be an object',
      'templateRoles.footer — required: templates[0] places the footer role',
    ]);
  });

  it('is undefined when the theme declares no roles and no template references one', () => {
    const { roles, errors } = validateRoles(undefined, []);

    expect(errors).toEqual([]);
    expect(roles).toBeUndefined();
  });
});

describe('seedLayout', () => {
  it('is the layout validateTemplateSeeds generates', () => {
    const seed = heroSeed();

    expect(seedLayout(seed)).toEqual(validate([seed]).templates[0]?.layout);
  });
});

describe('scanTheme templates', () => {
  it('emits the declared templates on the manifest', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        },
      ],
      templateRoles: {
        header: { apiId: 'hero', data: { heading: 'Site header' } },
        footer: { apiId: 'footer', data: { copyright: '© Acme' } },
      },
    });

    expect(errors).toEqual([]);
    expect(manifest?.templates).toEqual([
      {
        routePattern: '/products/:slug',
        schemaApiId: 'catalog:product',
        title: 'Product',
        blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        layout: {
          version: 1,
          root: {
            id: 'root',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              { id: 'role-header', type: 'reusable', role: 'header' },
              { id: 'hero-1', type: 'block', entryId: 'hero-1' },
              { id: 'role-footer', type: 'reusable', role: 'footer' },
            ],
          },
        },
      },
    ]);
    expect(manifest?.templateRoles).toEqual({
      header: { apiId: 'hero', data: { heading: 'Site header' } },
      footer: { apiId: 'footer', data: { copyright: '© Acme' } },
    });
  });

  it('leaves the key off the manifest when the theme declares no templates', () => {
    const { manifest, errors } = scanTheme({ themeDir: fixture('valid-theme') });

    expect(errors).toEqual([]);
    expect(manifest).not.toHaveProperty('templates');
    expect(manifest).not.toHaveProperty('templateRoles');
  });

  it('fails the scan when a seed does not validate against the scanned blocks', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'missing', data: {} }],
        },
      ],
    });

    expect(manifest).toBeNull();
    expect(errors).toContain('templates[0].blocks[0].apiId — unknown block "missing"');
  });

  it('fails the scan when a declared template places a role the theme did not declare', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        },
      ],
      templateRoles: { footer: { apiId: 'footer', data: { copyright: '© Acme' } } },
    });

    expect(manifest).toBeNull();
    expect(errors).toEqual([
      'templateRoles.header — required: templates[0] places the header role',
    ]);
  });

  it('fails the scan when a declared role names an apiId the theme does not ship', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        },
      ],
      templateRoles: {
        header: { apiId: 'nope', data: {} },
        footer: { apiId: 'footer', data: { copyright: '© Acme' } },
      },
    });

    expect(manifest).toBeNull();
    expect(errors).toContain('templateRoles.header.apiId — unknown block "nope"');
  });
});

describe('validatePageSeeds', () => {
  it('emits a page seed as slug, title and its entries in document order', () => {
    const seed = cartSeed();
    seed.blocks = [
      { apiId: 'hero', data: { heading: 'Free shipping' } },
      { role: 'header' },
      { apiId: 'hero', data: { heading: 'Your cart' }, required: true },
      { role: 'footer' },
    ];
    const { pageSeeds, errors } = validateSeeds([seed]);

    expect(errors).toEqual([]);
    expect(pageSeeds).toEqual([
      {
        slug: 'cart',
        title: 'Your cart',
        blocks: [
          { type: 'hero', data: { heading: 'Free shipping' } },
          // A region placement is reserved and carries nothing else: the block
          // behind it is `templateRoles`. It may sit anywhere in the order,
          // which is what lets the announcement bar above precede the header.
          { type: '@header' },
          { type: 'hero', data: { heading: 'Your cart' }, required: true },
          { type: '@footer' },
        ],
      },
    ]);
    // The list *is* the page: no layout, no node ids, no `apiId` — Core builds
    // the one-column layout from this order, and refuses an unknown key.
    expect(Object.keys(pageSeeds[0]!)).toEqual(['slug', 'title', 'blocks']);
    expect(JSON.stringify(pageSeeds)).not.toContain('apiId');
  });

  it('leaves the home seed alone — it is a template entry, never a page seed', () => {
    const home: DeclaredTemplateSeed = {
      routePattern: '/',
      schemaApiId: 'home',
      title: 'Home',
      blocks: [{ id: 'home-hero', apiId: 'hero', data: { heading: 'Made daily' } }],
    };
    const { templates, pageSeeds, errors } = validateSeeds([home, cartSeed()]);

    expect(errors).toEqual([]);
    expect(templates.map((template) => template.schemaApiId)).toEqual(['home']);
    expect(pageSeeds.map((page) => page.slug)).toEqual(['cart']);
  });

  it('refuses the slug "home" while the home template seed owns that page', () => {
    const home: DeclaredTemplateSeed = {
      routePattern: '/',
      schemaApiId: 'home',
      title: 'Home',
      blocks: [{ id: 'home-hero', apiId: 'hero', data: {} }],
    };

    expect(validateSeeds([home, { ...cartSeed(), page: { slug: 'home' } }]).errors).toEqual([
      'templates[1].page.slug — "home" is the home template seed\'s own page: drop that seed or pick another slug',
    ]);
    // Without that template seed nothing owns the slug, so it is an ordinary one.
    expect(validateSeeds([{ ...cartSeed(), page: { slug: 'home' } }]).errors).toEqual([]);
  });

  it('returns no page seeds for a theme that declares only templates', () => {
    const { pageSeeds, errors } = validateSeeds([heroSeed()]);

    expect(errors).toEqual([]);
    expect(pageSeeds).toEqual([]);
  });

  it('validates a page seed block\u2019s data with the same walk a template seed\u2019s goes through', () => {
    const seed = cartSeed();
    seed.blocks.push({
      apiId: 'gallery',
      data: { image: { assetId: 'demo-hero', url: '/demo/hero.png' } },
    });

    expect(validateSeeds([seed]).errors).toEqual([
      'templates[0].blocks[1].data — image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('errors on a seed that names both targets, and on one that names neither', () => {
    const { errors } = validateSeeds([
      { ...heroSeed(), page: { slug: 'cart' } } as unknown as DeclaredSeed,
      { title: 'Nowhere', blocks: [] } as unknown as DeclaredSeed,
    ]);

    expect(errors).toEqual([
      'templates[0] — declares both a template target (schemaApiId) and a page target (page.slug): a seed names one or the other',
      'templates[1].schemaApiId — must be "catalog:product", "catalog:collection" or "home" (a static page seed names `page: { slug }` instead)',
      'templates[1].blocks — must declare 1..50 blocks',
    ]);
  });

  it('holds a page slug to Core\u2019s own rule and refuses a duplicate or an extra key', () => {
    const { errors } = validateSeeds([
      { ...cartSeed(), page: { slug: 'Cart' } },
      { ...cartSeed(), page: { slug: 'my--cart' } },
      cartSeed(),
      cartSeed(),
      { ...cartSeed(), page: { slug: 'wishlist', parent: 'shop' } as DeclaredPageSeed['page'] },
    ]);

    expect(errors).toEqual([
      'templates[0].page.slug — invalid slug "Cart" (expected ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$, at most 64 characters)',
      'templates[1].page.slug — invalid slug "my--cart" (expected ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$, at most 64 characters)',
      'templates[3].page.slug — duplicate slug "cart"',
      'templates[4].page.parent — unknown key (a page seed names only its slug)',
    ]);
  });

  it('errors on a title, an entry list and an entry that are not what a page seed may carry', () => {
    const { errors } = validateSeeds([
      { ...cartSeed(), title: '  ' },
      { ...cartSeed(), page: { slug: 'wishlist' }, blocks: [] },
      {
        ...cartSeed(),
        page: { slug: 'search' },
        blocks: [null as unknown as DeclaredPageSeed['blocks'][number]],
      },
      {
        ...cartSeed(),
        page: { slug: 'journal' },
        blocks: [{ apiId: 'gone', data: {} }],
      },
    ]);

    expect(errors).toEqual([
      'templates[0].title — must contain 1..80 characters',
      'templates[1].blocks — must declare 1..50 entries',
      'templates[2].blocks[0] — must be a block or a region placement',
      'templates[3].blocks[0].apiId — unknown block "gone"',
    ]);
  });

  it('holds a region placement to a declared role, once per page, with nothing else on it', () => {
    const { errors } = validateSeeds(
      [
        {
          ...cartSeed(),
          blocks: [
            { role: 'header' },
            { role: 'header' },
            { role: 'aside' as 'header' },
            { role: 'footer', apiId: 'hero', data: {}, required: true } as never,
          ],
        },
      ],
      { header: { apiId: 'hero', data: {} } }
    );

    expect(errors).toEqual([
      'templates[0].blocks[1].role — duplicate role "header"',
      'templates[0].blocks[2].role — must be "header" or "footer"',
      'templates[0].blocks[3].apiId — a region placement carries only its role (the block behind it is templateRoles.footer)',
      'templates[0].blocks[3].data — a region placement carries only its role (the block behind it is templateRoles.footer)',
      'templates[0].blocks[3].required — a region placement carries only its role (the block behind it is templateRoles.footer)',
      'templates[0].blocks[3].role — placing the footer region needs templateRoles.footer',
    ]);
  });

  /**
   * Core decodes the manifest with unknown fields disallowed, so a key swallowed here fails the
   * **whole** ingest — every block, token and template in that deploy — with a message about a file
   * the theme author never wrote. These three are the tempting ones: `layout`, `header` and
   * `footer` are exactly what a *template* seed takes to steer its generated layout, and a page
   * seed has none of them because its entry list is the page.
   */
  it('refuses a page seed key it does not understand, and says what to do instead', () => {
    const { errors } = validateSeeds([
      {
        ...cartSeed(),
        layout: { version: 1 },
        header: false,
        footer: true,
        somethingElse: 1,
      } as unknown as DeclaredSeed,
    ]);

    expect(errors).toEqual([
      'templates[0].layout — unknown key on a page seed (a page seed declares no layout: its `blocks` are the page, in order)',
      'templates[0].header — unknown key on a page seed (place the region instead: an entry `{ role: "header" }` among the blocks)',
      'templates[0].footer — unknown key on a page seed (place the region instead: an entry `{ role: "footer" }` among the blocks)',
      'templates[0].somethingElse — unknown key on a page seed',
    ]);
  });

  /**
   * `templates` and `bindings` belong to a *route template's* block node, where they resolve
   * against the object the route matched. A page matches no object, so a page seed's block carrying
   * either would be a binding that can never resolve — and a key Core refuses outright.
   */
  it('refuses templates/bindings and a node id on a page seed\u2019s block entry', () => {
    const page = cartSeed();
    page.blocks = [
      {
        id: 'cart-1',
        apiId: 'hero',
        data: {},
        templates: { heading: '{{ title }}' },
        bindings: { heading: 'title' },
      } as unknown as DeclaredPageSeedBlock,
    ];

    expect(validateSeeds([page]).errors).toEqual([
      'templates[0].blocks[0].id — unknown key on a page seed (a page seed emits no node ids — there is no layout to reference one from)',
      "templates[0].blocks[0].templates — unknown key on a page seed (only a route template's block node takes templates: a page matches no object)",
      "templates[0].blocks[0].bindings — unknown key on a page seed (only a route template's block node takes bindings: a page matches no object)",
    ]);
  });

  it('refuses an unknown key on a region placement too, beside the three it explains', () => {
    const page = cartSeed();
    page.blocks = [
      { role: 'header', entryId: 'x' } as unknown as DeclaredPageSeed['blocks'][number],
    ];

    expect(validateSeeds([page]).errors).toEqual([
      'templates[0].blocks[0].entryId — unknown key on a page seed',
    ]);
  });

  it('allows `required` only on a page seed\u2019s blocks, and only as true', () => {
    const template = heroSeed();
    template.blocks = [
      {
        id: 'hero-1',
        apiId: 'hero',
        data: {},
        required: true,
      } as DeclaredTemplateSeed['blocks'][number],
    ];
    const page = cartSeed();
    page.blocks = [{ apiId: 'hero', data: {}, required: false as unknown as true }];

    expect(validateSeeds([template, page]).errors).toEqual([
      "templates[0].blocks[0].required — only a page seed's blocks may be required",
      'templates[1].blocks[0].required — must be true when present (omit it otherwise)',
    ]);
  });

  it('errors above sixteen page seeds and validates only the first sixteen', () => {
    const seeds = Array.from({ length: 17 }, (_, index) => ({
      ...cartSeed(),
      page: { slug: `page-${index}` },
    }));
    const { pageSeeds, errors } = validateSeeds(seeds);

    expect(errors).toEqual(['templates: contains 17 page seeds — exceeds 16']);
    expect(pageSeeds).toHaveLength(16);
  });

  it('counts page seeds against their own cap, never against the templates\u2019 one', () => {
    const seeds: DeclaredSeed[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        ...heroSeed(),
        routePattern: `/p${index}/:slug`,
      })),
      ...Array.from({ length: 16 }, (_, index) => ({
        ...cartSeed(),
        page: { slug: `page-${index}` },
      })),
    ];
    const { templates, pageSeeds, errors } = validateSeeds(seeds);

    expect(errors).toEqual([]);
    expect(templates).toHaveLength(8);
    expect(pageSeeds).toHaveLength(16);
  });
});
