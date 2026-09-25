#!/usr/bin/env node
// Packs every public package, installs the tarballs into a fresh project, and proves they resolve
// the way a consumer sees them: at runtime under Node, and under tsc with the two resolvers that
// matter (bundler, node16). Runs against dist, so build first.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const tsc = join(root, 'node_modules', '.bin', 'tsc');

const consumers = {
  '@eldrajs/sdk': {
    runtime: `
      import { createEldraClient, EldraHttpError } from '@eldrajs/sdk';
      import { eldra } from '@eldrajs/sdk/vite';
      assert(typeof createEldraClient === 'function', 'createEldraClient');
      assert(typeof EldraHttpError === 'function', 'EldraHttpError');
      assert(typeof eldra === 'function', 'eldra');
      const client = createEldraClient({ orgId: 'org', apiBaseUrl: 'https://example.invalid/api' });
      assert(typeof client.catalog.listProducts === 'function', 'client.catalog');
      assert(typeof client.cart.addItem === 'function', 'client.cart');
    `,
    types: `
      import { createEldraClient, type EldraClient, type EldraContractResponse } from '@eldrajs/sdk';
      import { eldra } from '@eldrajs/sdk/vite';
      // What the generated .eldra/web-studio/contract.ts does in a real project.
      declare module '@eldrajs/sdk' {
        interface EldraContract {
          paths: {
            '/catalog/v1/products/list': {
              get: { responses: { 200: { content: { 'application/json': { data: { title: string }[] | null } } } } };
            };
          };
        }
      }
      const client: EldraClient = createEldraClient({ orgId: 'org' });
      type Products = EldraContractResponse<'/catalog/v1/products/list', 'get'>;
      const products: Promise<Products> = client.catalog.listProducts();
      export const firstTitle = products.then((p) => p.data?.[0]?.title satisfies string | undefined);
      export const plugin = eldra({ orgId: 'org' });
    `,
  },
  '@eldrajs/rich-text': {
    runtime: `
      import { toHtml, renderTipTapText, normalizeEmbedInput } from '@eldrajs/rich-text';
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<b>' }] }] };
      assert.equal(toHtml(doc), '<p>&lt;b&gt;</p>');
      assert.equal(renderTipTapText(doc).text, '<b>');
      assert.equal(normalizeEmbedInput('https://youtu.be/abc')?.provider, 'youtube');
    `,
    types: `
      import { toHtml, type RichTextDocument, type ToHtmlOptions } from '@eldrajs/rich-text';
      const doc: RichTextDocument = { type: 'doc', content: [] };
      const options: ToHtmlOptions = { nodes: { paragraph: 'div' } };
      export const html: string = toHtml(doc, options);
    `,
  },
  '@eldrajs/vue': {
    runtime: `
      import { RichText, TextRenderer, defaultNodeComponents } from '@eldrajs/vue';
      assert(RichText && typeof RichText === 'object', 'RichText');
      assert(TextRenderer && typeof TextRenderer === 'object', 'TextRenderer');
      assert(typeof defaultNodeComponents.paragraph === 'object', 'defaultNodeComponents');
    `,
    types: `
      import { RichText, type RichTextNodeOverrides } from '@eldrajs/vue';
      export const nodes: RichTextNodeOverrides = { paragraph: { class: 'lead' } };
      export const component = RichText;
    `,
  },
  '@eldrajs/ui': {
    // Proves the package resolves, that the three CSS entries are in the tarball, that a
    // component really is a component on the other side of the build (a Vue SFC that failed to
    // compile still imports fine as a plain object, so the render function is what is asserted),
    // that `./resolver` resolves the `Eldra` prefix, and that `./messages/is-IS` is reachable.
    runtime: `
      import { existsSync } from 'node:fs';
      import { createRequire } from 'node:module';
      import * as ui from '@eldrajs/ui';
      import { Button, Select, FieldWrapper } from '@eldrajs/ui';
      import { EldraUiResolver } from '@eldrajs/ui/resolver';
      import { isIS } from '@eldrajs/ui/messages/is-IS';
      assert(ui && typeof ui === 'object', '@eldrajs/ui namespace');
      for (const [name, component] of [['Button', Button], ['Select', Select], ['FieldWrapper', FieldWrapper]]) {
        assert(component && typeof component === 'object', name + ' is an object');
        assert(
          typeof component.render === 'function' || typeof component.setup === 'function',
          name + ' has a render or setup function'
        );
      }
      const resolved = EldraUiResolver().resolve('EldraButton');
      assert.deepEqual(resolved, { name: 'Button', from: '@eldrajs/ui' }, 'EldraUiResolver resolves EldraButton');
      assert.equal(EldraUiResolver().resolve('UiButton'), undefined, 'EldraUiResolver never implies Ui');
      assert(isIS && typeof isIS === 'object', '@eldrajs/ui/messages/is-IS exports isIS');
      assert.equal(typeof isIS.close, 'string', 'isIS carries the message catalogue');
      const resolve = createRequire(import.meta.url).resolve;
      for (const css of ['tokens.css', 'tailwind.css', 'style.css']) {
        assert(existsSync(resolve('@eldrajs/ui/' + css)), css);
      }
      // The optional entry: it resolves, its components really are components, and — the point of
      // it being optional — the root entry above loaded without vee-validate being touched.
      const vee = await import('@eldrajs/ui/vee-validate');
      for (const name of ['Form', 'FieldInput', 'FieldSelect', 'FieldCheckboxGroup']) {
        const component = vee[name];
        assert(component && typeof component === 'object', name + ' is an object');
        assert(
          typeof component.render === 'function' || typeof component.setup === 'function',
          name + ' has a render or setup function'
        );
      }
      assert(typeof vee.API_ERRORS_KEY === 'symbol', 'API_ERRORS_KEY');
      assert(typeof vee.useFieldControl === 'function', 'useFieldControl');
    `,
    types: `
      import * as ui from '@eldrajs/ui';
      import { Button, Select, FieldWrapper, FORM_SUBMITTING_KEY, type ButtonProps } from '@eldrajs/ui';
      import { EldraUiResolver, type EldraUiResolverOptions } from '@eldrajs/ui/resolver';
      import { isIS } from '@eldrajs/ui/messages/is-IS';
      export const namespace: typeof ui = ui;
      export const components = { Button, Select, FieldWrapper };
      export const key = FORM_SUBMITTING_KEY;
      export const props: ButtonProps = { variant: 'primary', size: 'lg' };
      export const resolverOptions: EldraUiResolverOptions = { prefix: 'Eldra' };
      export const resolver = EldraUiResolver(resolverOptions);
      export const messages = isIS;
      import {
        Form as VeeForm,
        FieldInput,
        API_ERRORS_KEY,
        type FieldInputProps,
        type FormProps,
      } from '@eldrajs/ui/vee-validate';
      export const veeComponents = { VeeForm, FieldInput };
      export const apiErrorsKey = API_ERRORS_KEY;
      export const fieldProps: FieldInputProps = { name: 'email', type: 'email', size: 'lg' };
      export const formProps: FormProps = { layout: 'two', apiErrors: { email: 'Taken.' } };
    `,
  },
  '@eldrajs/theme-core': {
    runtime: `
      import { createEldraClient, stripStega, encodeStega, decodeStega } from '@eldrajs/theme-core';
      import { BRIDGE_VERSION, makeEnvelope, parseEnvelope } from '@eldrajs/theme-core/bridge';
      import { createOverlayRuntime } from '@eldrajs/theme-core/overlay';
      assert(typeof createEldraClient === 'function', 'createEldraClient');
      assert(typeof encodeStega === 'function' && typeof decodeStega === 'function', 'stega');
      assert.equal(stripStega('plain'), 'plain');
      assert(typeof makeEnvelope === 'function' && typeof parseEnvelope === 'function', 'envelope');
      assert.equal(typeof BRIDGE_VERSION, 'number');
      assert(typeof createOverlayRuntime === 'function', 'createOverlayRuntime');
    `,
    types: `
      import type { RichTextNode } from '@eldrajs/theme-core';
      import type { LayoutBreakpoints } from '@eldrajs/theme-core/layout';
      import { BRIDGE_VERSION } from '@eldrajs/theme-core/bridge';
      export const node: RichTextNode = { type: 'paragraph', content: [] };
      export const bp: LayoutBreakpoints = { tablet: 768, normal: 1024 };
      export const v: number = BRIDGE_VERSION;
    `,
  },
  '@eldrajs/theme-vue': {
    // No runtime probe: the index imports virtual:eldra/* modules the Vite plugin provides.
    types: `
      import { EldraRichText, EldraLayout, useEldra } from '@eldrajs/theme-vue';
      export const components = { EldraRichText, EldraLayout };
      export const hook = useEldra;
    `,
  },
  '@eldrajs/vite-plugin-theme': {
    runtime: `
      import eldraTheme from '@eldrajs/vite-plugin-theme';
      import { scanTheme } from '@eldrajs/vite-plugin-theme/scan';
      assert(typeof eldraTheme === 'function', 'eldraTheme');
      assert(typeof scanTheme === 'function', 'scanTheme');
    `,
    types: `
      import eldraTheme, { type ThemeManifest } from '@eldrajs/vite-plugin-theme';
      export const plugin = eldraTheme({ themeDir: '.' });
      export const manifest: ThemeManifest = {
        manifestVersion: 1,
        theme: { name: 'demo', version: '0.0.0', framework: 'vue', sdk: { core: '0.0.0', vitePlugin: '0.0.0' } },
        blocks: [],
        routes: [],
        customPages: [],
        tokens: { colors: {}, fonts: {}, spacing: {} },
      };
    `,
  },
  '@eldrajs/theme-cli': {
    runtime: `
      import { validateTheme, deployTheme, scanTheme } from '@eldrajs/theme-cli';
      import { execFileSync } from 'node:child_process';
      assert(typeof validateTheme === 'function', 'validateTheme');
      assert(typeof deployTheme === 'function', 'deployTheme');
      assert(typeof scanTheme === 'function', 'scanTheme');
      const help = execFileSync('node', ['node_modules/@eldrajs/theme-cli/dist/cli.js', '--help'], { encoding: 'utf8' });
      assert(help.includes('validate'), 'cli --help lists validate');
    `,
    types: `
      import { validateTheme, type ValidateResult } from '@eldrajs/theme-cli';
      export const run: Promise<ValidateResult> = validateTheme({ themeDir: '.', remote: false });
    `,
  },
  '@eldrajs/theme-nuxt': {
    runtime: `
      import eldra from '@eldrajs/theme-nuxt';
      assert(typeof eldra === 'function', 'nuxt module');
    `,
    types: `
      import type { ModuleOptions } from '@eldrajs/theme-nuxt';
      export const options: ModuleOptions = { gatewayUrl: 'https://example.invalid/api', orgId: 'org', studioOrigins: [], pageSchema: 'page', routeTemplateSchema: 'route-template' };
    `,
  },
};

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
}

async function packAll(outDir) {
  const tarballs = {};
  for (const dir of await readdir(packagesDir)) {
    const pkgPath = join(packagesDir, dir, 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    if (pkg.private) continue;
    run('pnpm', ['pack', '--pack-destination', outDir], join(packagesDir, dir));
    const file = (await readdir(outDir)).find((name) =>
      name.startsWith(pkg.name.replace('@', '').replace('/', '-'))
    );
    if (!file) throw new Error(`no tarball produced for ${pkg.name}`);
    tarballs[pkg.name] = join(outDir, file);
  }
  return tarballs;
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'headless-kit-smoke-'));
  try {
    const tarballs = await packAll(work);
    const project = join(work, 'consumer');
    await writeFile(
      join(work, 'package.json'),
      JSON.stringify({ name: 'consumer-root', private: true }, null, 2)
    );
    run('mkdir', ['-p', project]);
    await writeFile(
      join(project, 'package.json'),
      JSON.stringify({ name: 'consumer', private: true, type: 'module' }, null, 2)
    );
    run(
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--silent',
        'vite@^8',
        'vue@^3',
        // `@eldrajs/ui`'s optional peer: the `./vee-validate` entry is only reachable with it.
        'vee-validate@^4',
        '@nuxt/kit@^4',
        ...Object.values(tarballs),
      ],
      project
    );

    for (const [name, consumer] of Object.entries(consumers)) {
      if (!tarballs[name]) throw new Error(`${name} was not packed`);
      const slug = name.replace('@', '').replace('/', '-');

      if (consumer.runtime) {
        await writeFile(
          join(project, `${slug}.runtime.mjs`),
          `import assert from 'node:assert/strict';\n${consumer.runtime}\nconsole.log('${name}: runtime ok');\n`
        );
        process.stdout.write(run('node', [`${slug}.runtime.mjs`], project));
      }

      for (const moduleResolution of ['bundler', 'node16']) {
        const module = moduleResolution === 'bundler' ? 'ESNext' : 'Node16';
        await writeFile(join(project, `${slug}.${moduleResolution}.ts`), consumer.types);
        await writeFile(
          join(project, `tsconfig.${slug}.${moduleResolution}.json`),
          JSON.stringify(
            {
              compilerOptions: {
                module,
                moduleResolution,
                target: 'ES2022',
                strict: true,
                noEmit: true,
                skipLibCheck: true,
                types: [],
              },
              files: [`${slug}.${moduleResolution}.ts`],
            },
            null,
            2
          )
        );
        run(tsc, ['-p', `tsconfig.${slug}.${moduleResolution}.json`], project);
        console.log(`${name}: types ok (${moduleResolution})`);
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stdout || '', error.stderr || '', error.message);
  process.exit(1);
});
