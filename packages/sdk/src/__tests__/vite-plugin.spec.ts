import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ELDRA_API_BASE_URL } from '../client';
import { generateEldraCmsFiles } from '../vite-plugin';

let tmpRoot: string | undefined;

describe('eldra cms vite plugin generator', () => {
  afterEach(async () => {
    if (tmpRoot) {
      await rm(tmpRoot, { force: true, recursive: true });
      tmpRoot = undefined;
    }
  });

  it('fetches cms definitions and writes generated sdk files', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-cms-'));
    let capturedUrl: string | undefined;
    let capturedHeaders: Headers | undefined;

    await generateEldraCmsFiles(tmpRoot, {
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      moduleName: 'Storefront',
      maxDepth: 2,
      schemas: ['blog', 'author'],
      fetch: async (input, init) => {
        capturedUrl = input.toString();
        capturedHeaders = new Headers(init?.headers);
        return new Response('export interface StorefrontClient {}\n', {
          headers: { 'Content-Type': 'text/plain' },
        });
      },
    });

    expect(capturedUrl).toBe(
      'https://api.example.test/api/cms/v1/typescript-definitions?moduleName=Storefront&maxDepth=2&schemas=blog%2Cauthor'
    );
    expect(capturedHeaders?.get('X-Org-Id')).toBe('org-123');
    expect(capturedHeaders?.get('Accept')).toBe('text/plain');

    const typesSource = await readFile(join(tmpRoot, '.eldra/web-studio/cms-types.ts'), 'utf8');
    const clientSource = await readFile(join(tmpRoot, '.eldra/web-studio/client.ts'), 'utf8');
    const indexSource = await readFile(join(tmpRoot, '.eldra/web-studio/index.ts'), 'utf8');

    expect(typesSource).toBe('export interface StorefrontClient {}\n');
    expect(clientSource).toContain("import type { StorefrontClient } from './cms-types';");
    expect(clientSource).toContain(
      "export type WebStudioCmsClient = StorefrontClient & Pick<EldraClient['cms'], 'resolveEntryList'>;"
    );
    expect(clientSource).toContain('export interface WebStudioClient extends Omit<EldraClient,');
    expect(clientSource).toContain('export function getWebStudioClient(): WebStudioClient');
    expect(indexSource).toBe("export * from './client';\n");
  });

  it('can skip generation when config is missing', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-cms-'));

    await expect(
      generateEldraCmsFiles(tmpRoot, { skipOnMissingConfig: true }, 'test')
    ).resolves.toBeUndefined();
  });

  it('uses the production web gateway by default when only org id is configured', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-cms-'));
    let capturedUrl: string | undefined;

    await generateEldraCmsFiles(tmpRoot, {
      orgId: 'org-123',
      fetch: async (input) => {
        capturedUrl = input.toString();
        return new Response('export interface EldraCMSClient {}\n', {
          headers: { 'Content-Type': 'text/plain' },
        });
      },
    });

    expect(capturedUrl).toBe(
      `${DEFAULT_ELDRA_API_BASE_URL}/cms/v1/typescript-definitions?moduleName=EldraCMS`
    );
  });

  it('does not fail generation when cms definitions cannot be fetched', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-cms-'));

    await expect(
      generateEldraCmsFiles(tmpRoot, {
        orgId: 'org-123',
        fetch: async () => {
          throw new Error('Network is unreachable');
        },
      })
    ).resolves.toBeUndefined();

    await expect(
      readFile(join(tmpRoot, '.eldra/web-studio/cms-types.ts'), 'utf8')
    ).rejects.toThrow();
  });

  it('keeps existing generated files when cms definitions return an error', async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'eldra-cms-'));
    const outDir = join(tmpRoot, '.eldra/web-studio');
    const typesPath = join(outDir, 'cms-types.ts');

    await mkdir(outDir, { recursive: true });
    await writeFile(typesPath, 'export interface ExistingClient {}\n', 'utf8');

    await expect(
      generateEldraCmsFiles(tmpRoot, {
        orgId: 'org-123',
        fetch: async () =>
          new Response('Gateway unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
          }),
      })
    ).resolves.toBeUndefined();

    await expect(readFile(typesPath, 'utf8')).resolves.toBe('export interface ExistingClient {}\n');
  });
});
