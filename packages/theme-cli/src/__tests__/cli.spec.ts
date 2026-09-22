import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffoldBlock } from '../index';
import { startMockDeployApi, type MockDeployApi } from './mockDeployApi';
import { startMockGateway, type MockGateway } from './mockGateway';

const MANIFEST = JSON.stringify({
  manifestVersion: 1,
  theme: {
    name: 'test-theme',
    version: '0.0.1',
    framework: 'nuxt',
    sdk: { core: '0.1.0', vitePlugin: '0.1.0' },
  },
  blocks: [],
  routes: [],
  tokens: { colors: {}, fonts: {}, spacing: {} },
});

const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const run = (args: string[], cwd: string, env: Record<string, string> = {}) =>
  execa('node', [CLI, ...args], { cwd, env, reject: false });

describe('eldra-theme CLI', () => {
  let dir: string;
  let deployApi: MockDeployApi | null;
  let gateway: MockGateway | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eldra-cli-'));
    deployApi = null;
    gateway = null;
  });

  afterEach(async () => {
    await deployApi?.close();
    await gateway?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('init copies the starter into an empty directory and refuses a non-empty target', async () => {
    const target = join(dir, 'theme');
    const initialized = await run(['init', target], dir);
    expect(initialized.exitCode).toBe(0);
    expect(existsSync(join(target, 'package.json'))).toBe(true);
    const packageJson = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.dependencies['@eldrajs/theme-nuxt']).toBe('^0.1.0');
    expect(packageJson.dependencies['@eldrajs/theme-vue']).toBe('^0.1.0');
    expect(packageJson.devDependencies['@eldrajs/theme-cli']).toBe('^0.1.0');

    const repeated = await run(['init', target], dir);
    expect(repeated.exitCode).toBe(1);
    expect(repeated.stderr).toContain('is not empty');
  });

  it('scaffold block writes a valid block and validate accepts it', async () => {
    writeThemePackage(dir);
    const scaffolded = await run(['scaffold', 'block', 'promo-banner'], dir);
    expect(scaffolded.exitCode).toBe(0);
    for (const file of ['block.json', 'Block.vue', 'mock.json']) {
      expect(existsSync(join(dir, 'blocks', 'promo-banner', file))).toBe(true);
    }
    const block = JSON.parse(
      readFileSync(join(dir, 'blocks', 'promo-banner', 'block.json'), 'utf8')
    ) as {
      apiId: string;
      version: number;
    };
    expect(block).toMatchObject({ apiId: 'promo-banner', version: 1 });

    const validated = await run(['validate'], dir);
    expect(validated.exitCode).toBe(0);
    expect(validated.stdout).toContain('1 block valid');
  });

  it('scaffoldBlock exposes a deterministic programmatic API and rejects unsafe ids', () => {
    writeThemePackage(dir);
    expect(scaffoldBlock({ themeDir: dir, apiId: 'cta' }).created).toHaveLength(3);
    expect(() => scaffoldBlock({ themeDir: dir, apiId: 'Bad Id' })).toThrow(/apiId/);
    expect(() => scaffoldBlock({ themeDir: dir, apiId: 'cta' })).toThrow(/already exists/);
  });

  it('validate exits 1 with a precise scanner error', async () => {
    writeThemePackage(dir);
    scaffoldBlock({ themeDir: dir, apiId: 'broken' });
    const path = join(dir, 'blocks', 'broken', 'block.json');
    const block = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    block.fields = [];
    writeFileSync(path, `${JSON.stringify(block)}\n`);

    const result = await run(['validate'], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('blocks/broken/block.json: fields');
  });

  it('validate rejects defaults on field types that CMS does not support', async () => {
    writeThemePackage(dir);
    scaffoldBlock({
      themeDir: dir,
      apiId: 'cta',
      fields: [
        {
          fieldId: 'variant',
          name: 'Variant',
          type: 'select',
          default: 'primary',
          metadata: { options: ['primary', 'subtle'] },
        },
      ],
    });

    const result = await run(['validate'], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('fields[0].default — type "select" does not support defaults');
  });

  it('validate --remote warns and uses the bundled list when the endpoint is unavailable', async () => {
    writeThemePackage(dir);
    scaffoldBlock({ themeDir: dir, apiId: 'hero' });
    gateway = await startMockGateway({ fieldTypes: null });

    const result = await run(['validate', '--remote'], dir, gatewayEnv(gateway.url));
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('remote field-type check unavailable');
  });

  it('validate --remote rejects a field type absent from the remote registry', async () => {
    writeThemePackage(dir);
    scaffoldBlock({
      themeDir: dir,
      apiId: 'odd',
      fields: [{ fieldId: 'projection', name: 'Projection', type: 'holo-projection' }],
    });
    gateway = await startMockGateway({ fieldTypes: ['string', 'text'] });

    const result = await run(['validate', '--remote'], dir, gatewayEnv(gateway.url));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('unknown field type "holo-projection"');
  });

  it('types fetches definitions with X-Org-Id and supports schema/output flags', async () => {
    gateway = await startMockGateway({ dts: 'export interface CMSPage { title: string }' });
    const orgId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const result = await run(
      ['types', '--schemas', 'page,hero', '--out', 'generated/eldra.d.ts'],
      dir,
      { ELDRA_GATEWAY_URL: gateway.url, ELDRA_ORG_ID: orgId }
    );

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, 'generated', 'eldra.d.ts'), 'utf8')).toContain('CMSPage');
    expect(gateway.lastOrgId).toBe(orgId);
    const requestUrl = new URL(gateway.lastRequestUrl!, gateway.url);
    expect(requestUrl.searchParams.get('schemas')).toBe('page,hero');
    expect(requestUrl.searchParams.get('moduleName')).toBe('Eldra');
  });

  it('deploy keeps the CLI process alive through upload and polling', async () => {
    const buildDir = join(dir, '.output', 'public');
    mkdirSync(join(buildDir, '.eldra'), { recursive: true });
    writeFileSync(join(buildDir, 'index.html'), '<!doctype html><h1>site</h1>');
    writeFileSync(join(buildDir, '.eldra', 'manifest.json'), MANIFEST);
    deployApi = await startMockDeployApi({
      statuses: ['QUEUED', 'SUCCESS'],
      previewUrl: 'https://theme.pages.dev',
    });

    const result = await run(['deploy'], dir, {
      ELDRA_API_URL: deployApi.url,
      ELDRA_DEPLOY_TOKEN: 'tok-cli',
      ELDRA_DEPLOY_POLL_INTERVAL_MS: '1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('deployed: https://theme.pages.dev');
    expect(deployApi.posts).toHaveLength(1);
    expect(deployApi.posts[0]!.auth).toBe('Bearer tok-cli');
    expect(deployApi.getCount).toBe(2);
  });
});

function writeThemePackage(dir: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tmp-theme', version: '0.0.1' }));
}

function gatewayEnv(url: string): Record<string, string> {
  return {
    ELDRA_GATEWAY_URL: url,
    ELDRA_ORG_ID: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  };
}
