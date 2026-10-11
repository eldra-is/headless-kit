import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { describe, expect, it, vi } from 'vitest';
import eldraTheme from '../plugin';
import type { ThemeManifest } from '../types';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function copyFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `eldra-plugin-${name}-`));
  cpSync(fixture(name), root, { recursive: true });
  writeFileSync(
    join(root, 'entry.js'),
    [
      "import 'virtual:eldra/tokens.css';",
      "import manifest from 'virtual:eldra/manifest';",
      "import blocks from 'virtual:eldra/blocks';",
      "import blockFields from 'virtual:eldra/block-fields';",
      'console.log(manifest.theme.name, Object.keys(blocks), JSON.stringify(blockFields));',
    ].join('\n')
  );
  return root;
}

const vueStub: Plugin = {
  name: 'test-vue-stub',
  transform(_code, id) {
    if (id.endsWith('.vue')) return 'export default {}';
    return null;
  },
};

async function buildTheme(root: string): Promise<void> {
  await build({
    root,
    logLevel: 'silent',
    plugins: [eldraTheme({ framework: 'nuxt' }), vueStub],
    build: {
      minify: false,
      outDir: 'dist',
      rollupOptions: { input: join(root, 'entry.js') },
    },
  });
}

describe('eldraTheme Vite plugin', () => {
  it('writes and emits the manifest, emits previews, and resolves both virtual modules', async () => {
    const root = copyFixture('valid-theme');
    const preview = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    writeFileSync(join(root, 'blocks', 'hero', 'preview.png'), preview);

    await buildTheme(root);

    const committed = JSON.parse(readFileSync(join(root, '.eldra', 'manifest.json'), 'utf8')) as {
      blocks: Array<{ apiId: string; previewImage: string | null }>;
    };
    const emitted = JSON.parse(
      readFileSync(join(root, 'dist', '.eldra', 'manifest.json'), 'utf8')
    ) as {
      blocks: Array<{ apiId: string; previewImage: string | null }>;
    };
    expect(emitted).toEqual(committed);
    expect(emitted.blocks.find((block) => block.apiId === 'hero')?.previewImage).toBe(
      '.eldra/previews/hero.png'
    );
    expect(Array.from(readFileSync(join(root, 'dist', '.eldra', 'previews', 'hero.png')))).toEqual(
      Array.from(preview)
    );

    const javascript = readJavaScript(join(root, 'dist'));
    expect(javascript).toContain('marketing-theme');
    expect(javascript).toContain('"footer"');
    expect(javascript).toContain('"hero"');
    expect(readCss(join(root, 'dist'))).toContain('--eldra-color-primary:#4f46e5');
  });

  it('resolves virtual:eldra/block-fields to fieldId/type/localized/metadata only, per block apiId', async () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    const source = plugin.load('\0virtual:eldra/block-fields') ?? '';
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    )) as {
      default: Record<
        string,
        Array<{
          fieldId: string;
          type: string;
          localized?: boolean;
          metadata?: Record<string, unknown>;
        }>
      >;
    };
    const result = module.default;

    expect(Object.keys(result)).toEqual(['footer', 'hero']);
    // `localized` is carried (only when true) so EldraRichText can default an
    // omitted `locale` prop to the preview's active content locale.
    expect(result.hero).toEqual([
      { fieldId: 'heading', type: 'string', localized: true },
      { fieldId: 'subheading', type: 'text', localized: true },
    ]);
    expect(result.footer).toEqual([{ fieldId: 'copyright', type: 'string' }]);
  });

  it('resolves virtual:eldra/blocks to one JSON.stringify([apiId, path]) slice per entry, byte-identical to the naive two-call construction', async () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    const source = plugin.load('\0virtual:eldra/blocks') ?? '';

    // Independent oracle: the pre-fix shape, built by interpolating two separate
    // `JSON.stringify` calls per entry. `blockImportLine` changes *how* the string
    // is assembled (one `JSON.stringify` of the whole `[apiId, path]` pair, sliced
    // apart, rather than two calls glued together by hand) — never *what* it
    // outputs, which this proves byte-for-byte.
    const blocksDir = join(root, 'blocks');
    const naive = ['footer', 'hero']
      .map(
        (apiId) =>
          `  ${JSON.stringify(apiId)}: () => import(${JSON.stringify(join(blocksDir, apiId, 'Block.vue'))})`
      )
      .join(',\n');
    expect(source).toBe(`export default {\n${naive}\n};`);

    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    )) as { default: Record<string, () => Promise<unknown>> };
    expect(Object.keys(module.default)).toEqual(['footer', 'hero']);
  });

  it('resolves virtual:eldra/messages to an empty English catalogue when the theme ships no i18n/ directory', () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    expect(plugin.load('\0virtual:eldra/messages')).toBe(
      'export default {"defaultLocale":"en-US","locales":{}};'
    );
  });

  it("resolves virtual:eldra/messages to the manifest's own message catalogue", async () => {
    const root = copyFixture('theme-with-messages');
    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    const source = plugin.load('\0virtual:eldra/messages') ?? '';
    const loaded = (await import(
      `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
    )) as { default: { defaultLocale: string; locales: Record<string, Record<string, string>> } };
    expect(loaded.default).toEqual({
      defaultLocale: 'en-US',
      locales: {
        'en-US': {
          'header.menu': 'Menu',
          'cart.empty.title': 'Your cart is empty',
          'items.count': '{count} items',
        },
        'is-IS': {
          'header.menu': 'Valmynd',
          'cart.empty.title': 'Karfan þín er tóm',
          'items.count': '{count} hlutir',
        },
      },
    });
  });

  it('transforms virtual:eldra/messages through options.resolveMessages when the caller sets one', async () => {
    const root = copyFixture('theme-with-messages');
    const resolveMessages = vi.fn((themeMessages: ThemeManifest['messages']) => ({
      defaultLocale: 'fr-FR',
      locales: {
        'fr-FR': { 'header.menu': 'Overridden', keys: Object.keys(themeMessages!.locales) },
      },
    }));
    const plugin = eldraTheme({
      framework: 'nuxt',
      themeDir: root,
      resolveMessages: resolveMessages as never,
    }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    expect(plugin.load('\0virtual:eldra/messages')).toBe(
      'export default {"defaultLocale":"fr-FR","locales":{"fr-FR":{"header.menu":"Overridden","keys":["en-US","is-IS"]}}};'
    );
    // Called with the manifest's own messages — the untransformed input the module already serves.
    expect(resolveMessages).toHaveBeenCalledWith({
      defaultLocale: 'en-US',
      locales: expect.objectContaining({
        'en-US': expect.any(Object),
        'is-IS': expect.any(Object),
      }),
    });
  });

  it('transforms virtual:eldra/tokens.css through options.resolveTokens when the caller sets one', async () => {
    const root = copyFixture('valid-theme');
    const resolveTokens = vi.fn(() => ({
      colors: { primary: { label: 'Primary', value: '#ff6600', allowSiteOverride: true } },
      containers: {
        narrow: { label: 'Narrow', maxWidth: '32rem', gutter: { normal: '1rem' } },
        content: { label: 'Content', maxWidth: '48rem', gutter: { normal: '1.5rem' } },
        wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
        full: { label: 'Full', maxWidth: 'none', gutter: { normal: '0px' } },
      },
    }));
    const plugin = eldraTheme({
      framework: 'nuxt',
      themeDir: root,
      resolveTokens: resolveTokens as never,
    }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    const css = plugin.load('\0virtual:eldra/tokens.css') ?? '';
    expect(css).toContain('--eldra-color-primary:#ff6600;');
    expect(css).toContain('--eldra-container-content-max-width:48rem;');
    // The theme's own unmerged tokens.json value must not leak through.
    expect(css).not.toContain('#4f46e5');
    // Called with the manifest's own tokens — the theme's raw, as-authored tokens.json.
    expect(resolveTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: expect.objectContaining({ primary: expect.any(Object) }),
        containers: expect.objectContaining({ narrow: expect.any(Object) }),
      })
    );
  });

  it('resolves virtual:eldra/breakpoints to the defaults, and never puts breakpoints on the persisted/emitted manifest', async () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    expect(plugin.load('\0virtual:eldra/breakpoints')).toBe(
      'export default {"tablet":768,"normal":1024};'
    );

    await buildTheme(root);
    const committed = readFileSync(join(root, '.eldra', 'manifest.json'), 'utf8');
    const emitted = readFileSync(join(root, 'dist', '.eldra', 'manifest.json'), 'utf8');
    // Core's site-service ingest validates the uploaded manifest strictly and
    // rejects an unrecognized top-level key — breakpoints must never reach it.
    expect(committed).not.toContain('breakpoints');
    expect(emitted).not.toContain('breakpoints');
  });

  it('resolves virtual:eldra/breakpoints to a theme-configured pair, still without touching the manifest', () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({
      framework: 'nuxt',
      themeDir: root,
      breakpoints: { tablet: 600, normal: 900 },
    }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'build', logger: { error: vi.fn() } });
    plugin.buildStart();

    expect(plugin.load('\0virtual:eldra/breakpoints')).toBe(
      'export default {"tablet":600,"normal":900};'
    );
    const manifestSource = plugin.load('\0virtual:eldra/manifest') ?? 'export default null;';
    const manifestJson = manifestSource.replace(/^export default /, '').replace(/;$/, '');
    const manifest = JSON.parse(manifestJson) as Record<string, unknown> | null;
    expect(manifest).not.toHaveProperty('breakpoints');
  });

  it('fails a production build with precise scanner errors', async () => {
    const root = copyFixture('invalid-theme');
    await expect(buildTheme(root)).rejects.toThrow(/blocks\/bad\/block\.json: apiId/);
    expect(existsSync(join(root, 'dist', '.eldra', 'manifest.json'))).toBe(false);
  });

  it('compiles literal Tailwind v4 color utilities against runtime-overridable variables', async () => {
    const root = copyFixture('valid-theme');
    symlinkSync(
      fileURLToPath(new URL('../../node_modules', import.meta.url)),
      join(root, 'node_modules'),
      'dir'
    );
    writeFileSync(
      join(root, 'entry.js'),
      [
        "import 'virtual:eldra/tailwind-theme.css';",
        'document.body.innerHTML = \'<div class="bg-primary text-primary border-primary"></div>\';',
      ].join('\n')
    );

    await build({
      root,
      logLevel: 'silent',
      plugins: [eldraTheme({ framework: 'nuxt', tailwind: true }), tailwindcss(), vueStub],
      build: { minify: false, outDir: 'dist', rollupOptions: { input: join(root, 'entry.js') } },
    });

    const css = readCss(join(root, 'dist'));
    expect(css).toContain('--color-primary: var(--eldra-color-primary)');
    expect(css).toMatch(/\.bg-primary\s*\{[^}]*background-color:\s*var\(--color-primary\)/s);
    expect(css).toMatch(/\.text-primary\s*\{[^}]*color:\s*var\(--color-primary\)/s);
    expect(css).toMatch(/\.border-primary\s*\{[^}]*border-color:\s*var\(--color-primary\)/s);
    expect(css).toContain('--eldra-color-primary: #4f46e5');
    expect(css).not.toContain('bg-${');
  });

  it('keeps Tailwind disabled by default and reports missing opt-in dependencies', () => {
    const root = copyFixture('valid-theme');
    const plugin = eldraTheme({ tailwind: true, themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'serve', logger: { error: vi.fn() } });
    expect(() => plugin.buildStart()).toThrow(/install tailwindcss@\^4 or set tailwind: false/);
  });

  it('rejects an installed incompatible Tailwind major with an actionable error', async () => {
    const root = copyFixture('valid-theme');
    const packageDir = join(root, 'node_modules', 'tailwindcss');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name: 'tailwindcss', version: '3.4.17', main: 'index.js' })
    );
    writeFileSync(join(packageDir, 'index.js'), 'module.exports = {};');
    await expect(
      build({
        root,
        logLevel: 'silent',
        plugins: [eldraTheme({ tailwind: true }), vueStub],
        build: { outDir: 'dist', rollupOptions: { input: join(root, 'entry.js') } },
      })
    ).rejects.toThrow(/requires tailwindcss major 4 \(found 3\.4\.17\)/);
  });

  it('rescans tokens and invalidates generic and Tailwind virtual CSS on HMR', () => {
    const root = copyFixture('valid-theme');
    const tokensPath = join(root, 'tokens.json');
    const base = JSON.parse(readFileSync(tokensPath, 'utf8')) as {
      colors: Record<string, unknown>;
      containers: Record<string, unknown>;
    };
    writeFileSync(
      tokensPath,
      JSON.stringify({
        ...base,
        colors: {
          primary: { label: 'Primary A', value: '#112233', allowSiteOverride: true },
          'theme-a-only': { label: 'Theme A only', value: '#abcdef' },
        },
      })
    );

    const plugin = eldraTheme({ framework: 'nuxt', themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'serve', logger: { error: vi.fn() } });
    plugin.buildStart();
    expect(plugin.load('\0virtual:eldra/tokens.css')).toContain('--eldra-color-primary:#112233;');

    writeFileSync(
      tokensPath,
      JSON.stringify({
        ...base,
        colors: {
          primary: { label: 'Primary B', value: '#445566', allowSiteOverride: true },
          'theme-b-only': { label: 'Theme B only', value: '#fedcba' },
        },
      })
    );
    const invalidated: string[] = [];
    const reload = vi.fn();
    plugin.handleHotUpdate({
      file: tokensPath,
      server: {
        moduleGraph: {
          getModuleById: (id) => ({ id }),
          invalidateModule: (module) => invalidated.push(module.id),
        },
        ws: { send: reload },
      },
    });

    expect(invalidated).toEqual([
      '\0virtual:eldra/manifest',
      '\0virtual:eldra/blocks',
      '\0virtual:eldra/block-fields',
      '\0virtual:eldra/breakpoints',
      '\0virtual:eldra/tokens.css',
      '\0virtual:eldra/tailwind-theme.css',
      '\0virtual:eldra/messages',
    ]);
    expect(reload).toHaveBeenCalledWith({ type: 'full-reload' });
    const generic = plugin.load('\0virtual:eldra/tokens.css') ?? '';
    const tailwind = plugin.load('\0virtual:eldra/tailwind-theme.css') ?? '';
    expect(generic).toContain('--eldra-color-primary:#445566;');
    expect(generic).toContain('--eldra-color-theme-b-only:#fedcba;');
    expect(generic).not.toContain('theme-a-only');
    expect(tailwind).toContain('--color-theme-b-only:var(--eldra-color-theme-b-only);');
    expect(tailwind).not.toContain('theme-a-only');
  });
});

interface CallablePlugin {
  configResolved(config: {
    root: string;
    command: 'serve' | 'build';
    logger: { error(message: string): void };
  }): void;
  buildStart(): void;
  load(id: string): string | null;
  handleHotUpdate(context: {
    file: string;
    server: {
      moduleGraph: {
        getModuleById(id: string): { id: string } | undefined;
        invalidateModule(module: { id: string }): void;
      };
      ws: { send(payload: { type: string }): void };
    };
  }): [] | undefined;
}

function readJavaScript(directory: string): string {
  let output = '';
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output += readJavaScript(path);
    else if (name.endsWith('.js')) output += readFileSync(path, 'utf8');
  }
  return output;
}

function readCss(directory: string): string {
  let output = '';
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output += readCss(path);
    else if (name.endsWith('.css')) output += readFileSync(path, 'utf8');
  }
  return output;
}

describe('migration history in the Vite plugin', () => {
  const writeHero = (root: string, version: number, from?: string) => {
    writeFileSync(
      join(root, 'blocks/hero/block.json'),
      JSON.stringify({
        apiId: 'hero',
        name: 'Hero',
        version,
        fields: [{ fieldId: version === 1 ? 'titl' : 'title', name: 'Title', type: 'string' }],
        ...(from === undefined
          ? {}
          : { migrations: [{ version, renames: [{ from, to: 'title' }] }] }),
      })
    );
  };

  it('uses the previous local manifest before overwriting and permits unchanged redeploys', async () => {
    const root = copyFixture('valid-theme');
    writeHero(root, 1);
    await buildTheme(root);
    const path = join(root, '.eldra/manifest.json');
    const before = readFileSync(path, 'utf8');
    writeHero(root, 2, 'missing');
    await expect(buildTheme(root)).rejects.toThrow(/migration source/);
    expect(readFileSync(path, 'utf8')).toBe(before);
    writeHero(root, 2, 'titl');
    await buildTheme(root);
    const accepted = readFileSync(path, 'utf8');
    expect(
      JSON.parse(accepted).blocks.find((b: { apiId: string }) => b.apiId === 'hero').migrations
    ).toEqual([{ version: 2, renames: [{ from: 'titl', to: 'title' }] }]);
    await buildTheme(root);
    expect(readFileSync(path, 'utf8')).toBe(accepted);
  });

  it('accepts structurally valid migrations on a fresh CI checkout without history', async () => {
    const root = copyFixture('valid-theme');
    writeHero(root, 2, 'titl');
    await expect(buildTheme(root)).resolves.toBeUndefined();
  });

  it('rejects undecodable nested storage in local history and preserves the file', async () => {
    const root = copyFixture('valid-theme');
    const writeNestedHero = (version: number) =>
      writeFileSync(
        join(root, 'blocks/hero/block.json'),
        JSON.stringify({
          apiId: 'hero',
          name: 'Hero',
          version,
          fields: [
            {
              fieldId: version === 1 ? 'titl' : 'title',
              name: 'Title',
              type: 'composite',
              metadata: { fields: [{ fieldId: 'image', name: 'Image', type: 'media' }] },
            },
          ],
          ...(version === 1
            ? {}
            : { migrations: [{ version, renames: [{ from: 'titl', to: 'title' }] }] }),
        })
      );
    writeNestedHero(1);
    await buildTheme(root);
    const path = join(root, '.eldra/manifest.json');
    const history = JSON.parse(readFileSync(path, 'utf8')) as ThemeManifest;
    history.blocks.find((b) => b.apiId === 'hero')!.fields = [
      {
        fieldId: 'titl',
        name: 'Title',
        type: 'composite',
        metadata: { fields: [{ fieldId: 'image', name: 'Image', type: 'media', metadata: [] }] },
      },
    ];
    const corrupted = JSON.stringify(history);
    writeFileSync(path, corrupted);
    writeNestedHero(2);
    await expect(buildTheme(root)).rejects.toThrow(
      /previous manifest:.*invalid recursive field storage shape/
    );
    expect(readFileSync(path, 'utf8')).toBe(corrupted);
  });

  it.each([
    '{broken',
    '{"manifestVersion":1,"manifestVersion":1,"blocks":[]}',
    '{"manifestVersion":99,"blocks":[]}',
    '{"manifestVersion":1,"blocks":[null]}',
  ])('fails clearly and preserves invalid local history: %s', async (raw) => {
    const root = copyFixture('valid-theme');
    mkdirSync(join(root, '.eldra'), { recursive: true });
    const path = join(root, '.eldra/manifest.json');
    writeFileSync(path, raw);
    await expect(buildTheme(root)).rejects.toThrow(/manifest/);
    expect(readFileSync(path, 'utf8')).toBe(raw);
  });

  it('checks dev rescans against the last validated local schema', () => {
    const root = copyFixture('valid-theme');
    writeHero(root, 1);
    const log = vi.fn();
    const plugin = eldraTheme({ themeDir: root }) as unknown as CallablePlugin;
    plugin.configResolved({ root, command: 'serve', logger: { error: log } });
    plugin.buildStart();
    const before = readFileSync(join(root, '.eldra/manifest.json'), 'utf8');
    writeHero(root, 2, 'missing');
    plugin.handleHotUpdate({
      file: join(root, 'blocks/hero/block.json'),
      server: {
        moduleGraph: { getModuleById: () => undefined, invalidateModule: vi.fn() },
        ws: { send: vi.fn() },
      },
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('migration source'));
    expect(readFileSync(join(root, '.eldra/manifest.json'), 'utf8')).toBe(before);
  });
});
