import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ELDRA_API_BASE_URL } from '../client';
import { createContractSource, eldra, generateEldraFiles } from '../vite-plugin';

let tmpRoot: string | undefined;

const cmsTypes = 'export interface StorefrontClient {}\n';
const openapi = {
  openapi: '3.0.0',
  info: { title: 'web-gateway', version: '9.9.9' },
  paths: {
    '/catalog/v1/products/list': {
      get: {
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'array', items: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    },
  },
};

function gateway(behaviour: { cms?: Response | Error; contract?: Response | Error } = {}) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    calls.push({ url, headers: new Headers(init?.headers) });
    const outcome = url.includes('/cms/v1/typescript-definitions')
      ? (behaviour.cms ?? new Response(cmsTypes))
      : (behaviour.contract ?? Response.json(openapi));
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { calls, fetch: fetchImpl as typeof fetch };
}

describe('eldra vite plugin generator', () => {
  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { force: true, recursive: true });
      tmpRoot = undefined;
    }
  });

  it('fetches cms definitions and the gateway contract and writes the generated files', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const { calls, fetch } = gateway();

    await generateEldraFiles(tmpRoot, {
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      moduleName: 'Storefront',
      maxDepth: 2,
      schemas: ['blog', 'author'],
      fetch,
    });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/api/cms/v1/typescript-definitions?moduleName=Storefront&maxDepth=2&schemas=blog%2Cauthor',
      'https://api.example.test/api/public/openapi.json',
    ]);
    expect(calls[0].headers.get('X-Org-Id')).toBe('org-123');
    expect(calls[0].headers.get('Accept')).toBe('text/plain');
    expect(calls[1].headers.get('Accept')).toBe('application/json');
    for (const call of calls) expect(call.headers.has('X-Preview-Token')).toBe(false);

    const out = join(tmpRoot, '.eldra/web-studio');
    expect(await readFile(join(out, 'cms-types.ts'), 'utf8')).toBe(cmsTypes);

    const client = await readFile(join(out, 'client.ts'), 'utf8');
    expect(client).toContain("import type { StorefrontClient } from './cms-types';");
    expect(client).toContain("} from '@eldrajs/sdk';");
    expect(client).toContain('export function getWebStudioClient(): WebStudioClient');

    const contract = await readFile(join(out, 'contract.ts'), 'utf8');
    expect(contract).toContain("export const ELDRA_CONTRACT_VERSION = '9.9.9';");
    expect(contract).toContain('export type paths = {');
    expect(contract).toContain('"/catalog/v1/products/list"');
    expect(contract).toContain(
      "declare module '@eldrajs/sdk' {\n  interface EldraContract {\n    paths: paths;\n  }\n}"
    );

    expect(await readFile(join(out, 'index.ts'), 'utf8')).toBe(
      "export * from './client';\nexport * from './contract';\n"
    );
  });

  it.each(['preview-token', () => 'preview-token'])(
    'sends previewToken %s on both generation requests without embedding it in generated files',
    async (previewToken) => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-preview-'));
      const { calls, fetch } = gateway();
      const customHeaders = new Headers({
        'X-Preview-Token': 'custom-token',
        'X-Custom': 'preserved',
      });

      const result = await generateEldraFiles(tmpRoot, {
        orgId: 'org-123',
        previewToken,
        headers: () => customHeaders,
        fetch,
      });

      expect(result.skipped).toEqual([]);
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.headers.get('X-Preview-Token')).toBe('preview-token');
        expect(call.headers.get('X-Custom')).toBe('preserved');
        expect(call.headers.get('X-Org-Id')).toBe('org-123');
        expect(call.url).not.toContain('preview-token');
      }
      expect(calls[0].headers.get('Accept')).toBe('text/plain');
      expect(calls[1].headers.get('Accept')).toBe('application/json');
      expect(customHeaders.get('X-Preview-Token')).toBe('custom-token');
      expect(result.written).toHaveLength(4);
      for (const file of result.written) {
        expect(await readFile(file, 'utf8')).not.toContain('preview-token');
      }
    }
  );

  it.each([undefined, '', () => undefined, () => ''])(
    'preserves custom preview headers when previewToken is %s',
    async (previewToken) => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-preview-'));
      const { calls, fetch } = gateway();

      await generateEldraFiles(tmpRoot, {
        orgId: 'org-123',
        previewToken,
        headers: { 'X-Preview-Token': 'custom-token' },
        fetch,
      });

      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.headers.get('X-Preview-Token')).toBe('custom-token');
      }
    }
  );

  it('resolves the preview token again on each generation and can return to published reads', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-preview-'));
    let previewToken: string | undefined = 'first-token';
    const { calls, fetch } = gateway();
    const options = { orgId: 'org-123', previewToken: () => previewToken, fetch };

    await generateEldraFiles(tmpRoot, options);
    previewToken = 'second-token';
    await generateEldraFiles(tmpRoot, options);
    previewToken = undefined;
    await generateEldraFiles(tmpRoot, options);

    expect(calls.map((call) => call.headers.get('X-Preview-Token'))).toEqual([
      'first-token',
      'first-token',
      'second-token',
      'second-token',
      null,
      null,
    ]);
  });

  it('can skip generation when config is missing', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));

    await expect(
      generateEldraFiles(tmpRoot, { skipOnMissingConfig: true }, 'test')
    ).resolves.toEqual({
      written: [],
      skipped: [{ what: 'Eldra types', reason: expect.stringContaining('no organisation id') }],
    });
  });

  it('reports what it wrote and what it skipped, with the reason', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const { fetch } = gateway({
      contract: new Response('Gateway unavailable', { status: 503, statusText: 'Unavailable' }),
    });

    const result = await generateEldraFiles(tmpRoot, { orgId: 'org-123', fetch });

    const out = join(tmpRoot, '.eldra/web-studio');
    expect(result.written).toEqual([
      join(out, 'cms-types.ts'),
      join(out, 'client.ts'),
      join(out, 'index.ts'),
    ]);
    expect(result.skipped).toEqual([
      { what: 'Gateway contract', reason: expect.stringContaining('503 Unavailable') },
    ]);
  });

  it("writes beside the nearest package.json when Vite's root is a subfolder, as in Nuxt", async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    await writeFile(join(tmpRoot, 'package.json'), '{}\n', 'utf8');
    await mkdir(join(tmpRoot, 'app'), { recursive: true });
    const { fetch } = gateway();

    const result = await generateEldraFiles(join(tmpRoot, 'app'), { orgId: 'org-123', fetch });

    expect(result.written[0]).toBe(join(tmpRoot, '.eldra/web-studio/cms-types.ts'));
    await expect(
      readFile(join(tmpRoot, 'app/.eldra/web-studio/index.ts'), 'utf8')
    ).rejects.toThrow();
  });

  it('warns from the build for everything it skipped', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const { fetch } = gateway({ contract: new Error('Network is unreachable') });
    const plugin = eldra({ orgId: 'org-123', fetch });
    const warn = vi.fn();

    (plugin.configResolved as (config: { root: string; mode: string }) => void)({
      root: tmpRoot,
      mode: 'test',
    });
    const buildStart = plugin.buildStart as unknown as (this: {
      warn: typeof warn;
    }) => Promise<void>;
    await buildStart.call({ warn });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Gateway contract not generated: Network is unreachable');
  });

  it('uses the production web gateway by default when only org id is configured', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const { calls, fetch } = gateway();

    await generateEldraFiles(tmpRoot, { orgId: 'org-123', fetch });

    expect(calls[0].url).toBe(
      `${DEFAULT_ELDRA_API_BASE_URL}/cms/v1/typescript-definitions?moduleName=EldraCMS`
    );
    expect(calls[1].url).toBe(`${DEFAULT_ELDRA_API_BASE_URL}/public/openapi.json`);
  });

  it('writes nothing when nothing can be fetched', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const offline = new Error('Network is unreachable');
    const { fetch } = gateway({ cms: offline, contract: offline });

    const result = await generateEldraFiles(tmpRoot, { orgId: 'org-123', fetch });

    expect(result.written).toEqual([]);
    expect(result.skipped.map((skip) => skip.what)).toEqual(['CMS types', 'Gateway contract']);
    await expect(readFile(join(tmpRoot, '.eldra/web-studio/index.ts'), 'utf8')).rejects.toThrow();
  });

  it('keeps the existing contract and still exports it when only the contract fetch fails', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const out = join(tmpRoot, '.eldra/web-studio');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'contract.ts'), '// previous contract\n', 'utf8');
    const { fetch } = gateway({
      contract: new Response('Gateway unavailable', { status: 503, statusText: 'Unavailable' }),
    });

    await generateEldraFiles(tmpRoot, { orgId: 'org-123', fetch });

    expect(await readFile(join(out, 'contract.ts'), 'utf8')).toBe('// previous contract\n');
    expect(await readFile(join(out, 'cms-types.ts'), 'utf8')).toBe(cmsTypes);
    expect(await readFile(join(out, 'index.ts'), 'utf8')).toBe(
      "export * from './client';\nexport * from './contract';\n"
    );
  });

  it('keeps the existing cms types and client when only the cms fetch fails', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const out = join(tmpRoot, '.eldra/web-studio');
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'cms-types.ts'), 'export interface ExistingClient {}\n', 'utf8');
    await writeFile(join(out, 'client.ts'), '// previous client\n', 'utf8');
    const { fetch } = gateway({ cms: new Error('Network is unreachable') });

    await generateEldraFiles(tmpRoot, { orgId: 'org-123', fetch });

    expect(await readFile(join(out, 'cms-types.ts'), 'utf8')).toBe(
      'export interface ExistingClient {}\n'
    );
    expect(await readFile(join(out, 'client.ts'), 'utf8')).toBe('// previous client\n');
    expect(await readFile(join(out, 'contract.ts'), 'utf8')).toContain('ELDRA_CONTRACT_VERSION');
    expect(await readFile(join(out, 'index.ts'), 'utf8')).toBe(
      "export * from './client';\nexport * from './contract';\n"
    );
  });

  it('leaves the contract out when asked', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-'));
    const { calls, fetch } = gateway();

    await generateEldraFiles(tmpRoot, { orgId: 'org-123', contract: false, fetch });

    expect(calls).toHaveLength(1);
    expect(await readFile(join(tmpRoot, '.eldra/web-studio/index.ts'), 'utf8')).toBe(
      "export * from './client';\n"
    );
  });

  it('refuses a document without a version', async () => {
    await expect(createContractSource({ openapi: '3.0.0', paths: {} })).rejects.toThrow(
      'no info.version'
    );
  });
});
