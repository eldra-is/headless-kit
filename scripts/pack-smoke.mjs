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
        ...Object.values(tarballs),
      ],
      project
    );

    for (const [name, consumer] of Object.entries(consumers)) {
      if (!tarballs[name]) throw new Error(`${name} was not packed`);
      const slug = name.replace('@', '').replace('/', '-');

      await writeFile(
        join(project, `${slug}.runtime.mjs`),
        `import assert from 'node:assert/strict';\n${consumer.runtime}\nconsole.log('${name}: runtime ok');\n`
      );
      process.stdout.write(run('node', [`${slug}.runtime.mjs`], project));

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
