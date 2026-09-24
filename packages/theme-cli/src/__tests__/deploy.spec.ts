import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deployTheme } from '../commands/deploy';
import { startMockDeployApi, type MockDeployApi } from './mockDeployApi';

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

function makeBuild(root: string, output = '.output/public'): string {
  const buildDir = join(root, output);
  mkdirSync(join(buildDir, '.eldra'), { recursive: true });
  writeFileSync(join(buildDir, 'index.html'), '<!doctype html><h1>site</h1>');
  writeFileSync(join(buildDir, '.eldra', 'manifest.json'), MANIFEST);
  return buildDir;
}

describe('deployTheme', () => {
  let root: string;
  let api: MockDeployApi | null;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eldra-deploy-test-'));
    api = null;
  });

  afterEach(async () => {
    await api?.close();
    rmSync(root, { recursive: true, force: true });
    delete process.env.GITHUB_SHA;
    delete process.env.ELDRA_TRIGGER_DEPLOYMENT_ID;
  });

  const options = (overrides: Partial<Parameters<typeof deployTheme>[0]> = {}) => ({
    cwd: root,
    token: 'tok-1',
    apiUrl: api!.url,
    pollIntervalMs: 1,
    log: () => {},
    ...overrides,
  });

  it('sends the exact manifest and artifact multipart fields and Bearer auth', async () => {
    makeBuild(root);
    api = await startMockDeployApi({ previewUrl: 'https://test-theme.pages.dev' });

    const result = await deployTheme(options());

    expect(result).toMatchObject({
      deploymentId: 'dep-1',
      status: 'SUCCESS',
      previewUrl: 'https://test-theme.pages.dev',
    });
    expect(api.posts).toHaveLength(1);
    expect(api.posts[0]!.auth).toBe('Bearer tok-1');
    expect(api.posts[0]!.contentType).toMatch(/^multipart\/form-data; boundary=/);
    const body = api.posts[0]!.body.toString('latin1');
    expect(body).toContain('name="manifest"; filename="manifest.json"');
    expect(body).toContain('Content-Type: application/json');
    expect(body).toContain('name="artifact"; filename="artifact.tar.gz"');
    expect(body).toContain('Content-Type: application/gzip');

    const form = await new Response(api.posts[0]!.body as unknown as BodyInit, {
      headers: { 'content-type': api.posts[0]!.contentType ?? '' },
    }).formData();
    const artifact = form.get('artifact');
    expect(artifact).toBeInstanceOf(File);
    const artifactPath = join(root, 'uploaded-artifact.tar.gz');
    await writeFile(artifactPath, Buffer.from(await (artifact as File).arrayBuffer()));
    const paths: string[] = [];
    await tar.list({ file: artifactPath, onReadEntry: (entry) => paths.push(entry.path) });
    expect(paths).toContain('.eldra/manifest.json');
    expect(paths.every((path) => path !== '.' && !path.startsWith('./'))).toBe(true);
  });

  it('propagates explicit trigger correlation and commit SHA using the frozen field names', async () => {
    makeBuild(root, 'dist');
    writeFileSync(
      join(root, 'design-token-mapping.json'),
      JSON.stringify({ colors: { 'old-brand': 'brand' }, containers: {} })
    );
    api = await startMockDeployApi();

    await deployTheme(
      options({
        designTokenMapping: 'design-token-mapping.json',
        commitSha: 'abc123def',
        triggerDeploymentId: '00000000-0000-4000-8000-000000000123',
      })
    );

    const body = api.posts[0]!.body.toString('latin1');
    expect(body).toContain('name="commitSha"');
    expect(body).toContain('abc123def');
    expect(body).toContain('name="triggerDeploymentId"');
    expect(body).toContain('00000000-0000-4000-8000-000000000123');
    expect(body).toContain('name="designTokenMapping"; filename="design-token-mapping.json"');
    expect(body).toContain('old-brand');
    expect(body.indexOf('name="manifest"')).toBeLessThan(body.indexOf('name="commitSha"'));
    expect(body.indexOf('name="manifest"')).toBeLessThan(body.indexOf('name="designTokenMapping"'));
    expect(body.indexOf('name="designTokenMapping"')).toBeLessThan(
      body.indexOf('name="commitSha"')
    );
    expect(body.indexOf('name="commitSha"')).toBeLessThan(
      body.indexOf('name="triggerDeploymentId"')
    );
    expect(body.indexOf('name="triggerDeploymentId"')).toBeLessThan(
      body.indexOf('name="artifact"')
    );
    expect(body.slice(body.indexOf('name="artifact"'))).not.toContain('name="commitSha"');
  });

  it('rejects malformed or oversized design token mappings before upload', async () => {
    makeBuild(root);
    api = await startMockDeployApi();
    writeFileSync(join(root, 'mapping.json'), '{');
    await expect(deployTheme(options({ designTokenMapping: 'mapping.json' }))).rejects.toThrow(
      /must be valid JSON/
    );
    writeFileSync(join(root, 'mapping.json'), Buffer.alloc(16 * 1024 + 1));
    await expect(deployTheme(options({ designTokenMapping: 'mapping.json' }))).rejects.toThrow(
      /16 KiB limit/
    );
    expect(api.posts).toHaveLength(0);
  });

  it('auto-detects commit and trigger correlation from provider CI environment', async () => {
    makeBuild(root);
    api = await startMockDeployApi();
    process.env.GITHUB_SHA = 'github-sha-1';
    process.env.ELDRA_TRIGGER_DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000456';

    await deployTheme(options());

    const body = api.posts[0]!.body.toString('latin1');
    expect(body).toContain('github-sha-1');
    expect(body).toContain('00000000-0000-4000-8000-000000000456');
  });

  it('polls QUEUED through PROCESSING to SUCCESS with auth on every poll', async () => {
    makeBuild(root);
    api = await startMockDeployApi({ statuses: ['QUEUED', 'PROCESSING', 'SUCCESS'] });

    await deployTheme(options());

    expect(api.getCount).toBe(3);
    expect(api.pollAuth).toEqual(['Bearer tok-1', 'Bearer tok-1', 'Bearer tok-1']);
  });

  it('rejects oversized files during preflight before making an upload', async () => {
    const buildDir = makeBuild(root, 'dist');
    writeFileSync(join(buildDir, 'huge.bin'), Buffer.alloc(25 * 1024 * 1024 + 1));
    api = await startMockDeployApi();

    await expect(deployTheme(options())).rejects.toThrow(/huge\.bin.*25 MiB/s);
    expect(api.posts).toHaveLength(0);
  });

  it('rejects Pages Functions and Worker bundles before making an upload', async () => {
    const buildDir = makeBuild(root, 'dist');
    writeFileSync(join(buildDir, '_worker.js'), 'export default {}');
    api = await startMockDeployApi();

    await expect(deployTheme(options())).rejects.toThrow(/_worker\.js.*static assets only/s);
    expect(api.posts).toHaveLength(0);
  });

  it.each([
    ['SITE_DEPLOY_TOKEN_INVALID', 401, /generate a new token in Studio/],
    ['SITE_MANIFEST_INVALID', 422, /eldra-theme validate/],
    ['SITE_MANIFEST_TOO_LARGE', 413, /2 MiB limit/],
    ['SITE_ARTIFACT_TOO_LARGE', 413, /20,000 files.*25 MiB\/file/s],
    ['SITE_DEPLOY_RATE_LIMITED', 429, /wait a few minutes.*retry/s],
  ])('maps %s to actionable guidance', async (detail, status, expected) => {
    makeBuild(root, 'dist');
    api = await startMockDeployApi({ postStatus: status, errorDetail: detail });

    const rejection = deployTheme(options());
    await expect(rejection).rejects.toThrow(expected);
    await expect(rejection).rejects.toMatchObject({ code: detail });
  });

  it('prints one line per retired field migration', async () => {
    makeBuild(root);
    api = await startMockDeployApi({
      syncResult: {
        created: [],
        updated: ['hero'],
        removed: [],
        warnings: [],
        fieldMigrations: {
          retired: [
            {
              blockApiId: 'hero',
              fieldId: 'subtitle',
              retiredAs: 'subtitle__v1',
              fromVersion: 1,
              reason: 'type-changed',
              migratedCount: 12,
            },
          ],
        },
      },
    });
    const lines: string[] = [];

    await deployTheme(options({ log: (line) => lines.push(line) }));

    expect(lines).toContain(
      'retired hero.subtitle → subtitle__v1 (type-changed, 12 entries) — previous content is read-only in Studio'
    );
  });

  it('prints nothing extra when the deploy has no retired field migrations', async () => {
    makeBuild(root);
    api = await startMockDeployApi();
    const lines: string[] = [];

    await deployTheme(options({ log: (line) => lines.push(line) }));

    expect(lines.some((line) => line.startsWith('retired '))).toBe(false);
  });

  it('prints one deduped reason line per field on a version-bump refusal (THEME_FIELD_INCOMPATIBLE)', async () => {
    makeBuild(root);
    api = await startMockDeployApi({
      postStatus: 409,
      errorBody: {
        type: '/conflict',
        title: 'Conflict',
        status: 409,
        detail: 'theme content compatibility requires confirmation',
        code: 'CONFLICT',
        errorId: 'THEME_FIELD_INCOMPATIBLE',
        errors: {
          activationRefusal: {
            code: 'THEME_FIELD_INCOMPATIBLE',
            locations: [
              {
                blockApiId: 'retiretest',
                fieldId: 'images',
                variant: 'draft',
                reason:
                  'field type changed (list → media); bump the block version to retire the previous content',
              },
              {
                blockApiId: 'retiretest',
                fieldId: 'images',
                variant: 'published',
                reason:
                  'field type changed (list → media); bump the block version to retire the previous content',
              },
              {
                blockApiId: 'retiretest',
                fieldId: 'note',
                variant: 'draft',
                reason: 'field removed while it holds content; bump the block version to retire it',
              },
            ],
          },
        },
      },
    });

    await expect(deployTheme(options())).rejects.toThrow(
      [
        'deploy: theme content compatibility requires confirmation',
        '  retiretest.images: field type changed (list → media); bump the block version to retire the previous content',
        '  retiretest.note: field removed while it holds content; bump the block version to retire it',
      ].join('\n')
    );
  });

  it('reports terminal failure with the sanitized deployment log excerpt', async () => {
    makeBuild(root);
    api = await startMockDeployApi({
      statuses: ['PROCESSING', 'FAILED'],
      logExcerpt: 'Pages upload rejected',
    });

    await expect(deployTheme(options())).rejects.toThrow(/FAILED: Pages upload rejected/);
  });
});
