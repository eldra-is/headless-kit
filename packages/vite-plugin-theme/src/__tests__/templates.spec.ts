import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanTheme } from '../scan';
import { seedLayout, validateTemplateRoles, validateTemplateSeeds } from '../templates';
import type { DeclaredTemplateSeed, ManifestTemplateRoles } from '../types';

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
      'templates[0].schemaApiId — must be "catalog:product", "catalog:collection" or "home"',
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
