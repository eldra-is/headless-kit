import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import * as tar from 'tar';
import { fieldMigrationLines, type FieldMigrationReport } from '../deployReport';

const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DESIGN_TOKEN_MAPPING_BYTES = 16 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 600_000;
const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELED']);
const BUILD_DIR_CANDIDATES = ['.output/public', 'dist'];

export class DeployError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null
  ) {
    super(message);
    this.name = 'DeployError';
  }
}
export interface DeployOptions {
  token: string;
  apiUrl: string;
  dir?: string;
  cwd?: string;
  designTokenMapping?: string;
  commitSha?: string;
  triggerDeploymentId?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  log?: (line: string) => void;
}
export interface DeploySyncResult {
  created: string[];
  updated: string[];
  removed: string[];
  warnings: string[];
  /** Both halves of what the deploy did to existing content — the fields it
   *  retired and the values it converted. Every part is optional, so a deploy
   *  against a gateway that reports less still succeeds. */
  fieldMigrations?: FieldMigrationReport;
}
export interface DeployResult {
  deploymentId: string;
  status: 'SUCCESS';
  previewUrl: string | null;
  syncResult: DeploySyncResult;
}

export function detectCommitSha(env: {
  GITHUB_SHA?: string;
  CI_COMMIT_SHA?: string;
  BITBUCKET_COMMIT?: string;
}): string | null {
  return env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? env.BITBUCKET_COMMIT ?? null;
}

export async function deployTheme(opts: DeployOptions): Promise<DeployResult> {
  const cwd = opts.cwd ?? process.cwd();
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const log = opts.log ?? console.log;
  const apiUrl = opts.apiUrl.replace(/\/+$/, '');
  if (opts.token === '')
    throw new DeployError('deploy: empty token (--token or ELDRA_DEPLOY_TOKEN)');
  const dir = opts.dir !== undefined ? join(cwd, opts.dir) : detectBuildDir(cwd);
  const manifestPath = join(dir, '.eldra', 'manifest.json');
  if (!existsSync(manifestPath))
    throw new DeployError(
      `deploy: ${relative(cwd, manifestPath)} not found — run your build (e.g. \`nuxi generate\`) first; the Eldra vite plugin emits the manifest into the build output`
    );
  preflight(dir, cwd);
  const tmp = await mkdtemp(join(tmpdir(), 'eldra-deploy-'));
  const tarPath = join(tmp, 'artifact.tar.gz');
  try {
    const archiveEntries = readdirSync(dir).sort((left, right) =>
      left.localeCompare(right, 'en-US')
    );
    await tar.create({ gzip: true, cwd: dir, portable: true, file: tarPath }, archiveEntries);
    const form = new FormData();
    form.append(
      'manifest',
      new Blob([(await readFile(manifestPath)) as BlobPart], { type: 'application/json' }),
      'manifest.json'
    );
    if (opts.designTokenMapping) {
      const mappingPath = join(cwd, opts.designTokenMapping);
      const mapping = await readFile(mappingPath).catch(() => {
        throw new DeployError(`deploy: ${opts.designTokenMapping} not found`);
      });
      if (mapping.byteLength > MAX_DESIGN_TOKEN_MAPPING_BYTES)
        throw new DeployError('deploy: design token mapping exceeds the 16 KiB limit');
      try {
        JSON.parse(new TextDecoder().decode(mapping));
      } catch {
        throw new DeployError('deploy: design token mapping must be valid JSON');
      }
      form.append(
        'designTokenMapping',
        new Blob([mapping as BlobPart], { type: 'application/json' }),
        'design-token-mapping.json'
      );
    }
    const commitSha = opts.commitSha ?? detectCommitSha(process.env);
    if (commitSha) form.append('commitSha', commitSha);
    const triggerId = opts.triggerDeploymentId ?? process.env.ELDRA_TRIGGER_DEPLOYMENT_ID;
    if (triggerId) form.append('triggerDeploymentId', triggerId);
    // Keep the streaming artifact final so the backend can authenticate and correlate first.
    form.append(
      'artifact',
      new Blob([(await readFile(tarPath)) as BlobPart], { type: 'application/gzip' }),
      'artifact.tar.gz'
    );
    const res = await doFetch(`${apiUrl}/sites/v1/public/deploys`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}` },
      body: form,
    });
    if (res.status !== 202) throw await toDeployError(res);
    const accepted = (await res.json()) as { deploymentId: string; syncResult: DeploySyncResult };
    const syncResult = accepted.syncResult;
    log(
      `deployment ${accepted.deploymentId} accepted — blocks +${syncResult.created.length} ~${syncResult.updated.length} -${syncResult.removed.length}`
    );
    for (const w of syncResult.warnings) log(`warning: ${w}`);
    for (const line of fieldMigrationLines(syncResult.fieldMigrations)) log(line);
    const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let lastStatus = '';
    for (;;) {
      const poll = await doFetch(`${apiUrl}/sites/v1/public/deploys/${accepted.deploymentId}`, {
        headers: { authorization: `Bearer ${opts.token}` },
      });
      if (!poll.ok) throw await toDeployError(poll);
      const deployment = (await poll.json()) as {
        status: string;
        logExcerpt: string | null;
        previewUrl?: string | null;
      };
      if (deployment.status !== lastStatus) {
        lastStatus = deployment.status;
        log(`status: ${deployment.status}`);
      }
      if (TERMINAL_STATUSES.has(deployment.status)) {
        if (deployment.status !== 'SUCCESS')
          throw new DeployError(
            `deploy ${deployment.status}${deployment.logExcerpt ? `: ${deployment.logExcerpt}` : ''}`
          );
        return {
          deploymentId: accepted.deploymentId,
          status: 'SUCCESS',
          previewUrl: deployment.previewUrl ?? null,
          syncResult,
        };
      }
      if (Date.now() >= deadline)
        throw new DeployError(
          `deploy: timed out after ${Math.round((opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 60_000)} min waiting for deployment ${accepted.deploymentId} (last status ${deployment.status})`
        );
      await new Promise((resolve) =>
        setTimeout(resolve, opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
      );
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function detectBuildDir(cwd: string): string {
  for (const c of BUILD_DIR_CANDIDATES) {
    const p = join(cwd, c);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  throw new DeployError(
    `deploy: no build output found — looked for ${BUILD_DIR_CANDIDATES.join(', ')} under ${cwd}. Run your build first or pass --dir <path>.`
  );
}
function preflight(dir: string, cwd: string): void {
  let count = 0;
  const walk = (p: string): void => {
    for (const name of readdirSync(p)) {
      const full = join(p, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink())
        throw new DeployError(
          `deploy: ${relative(cwd, full)} is a symlink — the artifact must contain only regular files`
        );
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (name === '_worker.js' || name === '_worker.bundle')
        throw new DeployError(
          `deploy: ${relative(cwd, full)} is not supported — v1 accepts static assets only; Cloudflare Pages Functions and Worker bundles are rejected`
        );
      count++;
      if (count > MAX_FILES)
        throw new DeployError(
          `deploy: build output exceeds ${MAX_FILES.toLocaleString('en-US')} files`
        );
      if (st.size > MAX_FILE_BYTES)
        throw new DeployError(
          `deploy: ${relative(cwd, full)} is ${(st.size / (1024 * 1024)).toFixed(1)} MiB — exceeds the 25 MiB/file v1 limit`
        );
    }
  };
  walk(dir);
}
interface ActivationLocation {
  blockApiId?: string;
  fieldId?: string;
  reason?: string;
}
interface DeployErrorBody {
  detail?: string;
  errorId?: string;
  errors?: { activationRefusal?: { code?: string; locations?: ActivationLocation[] } };
}

async function toDeployError(res: Response): Promise<DeployError> {
  let body: DeployErrorBody | null = null;
  try {
    body = (await res.json()) as DeployErrorBody;
  } catch {}
  const detail = body?.detail ?? null;
  // A version-bump refusal (spec: manifest-field-retire) carries the human
  // `detail` plus a structured `errors.activationRefusal.locations` array —
  // one entry per populated draft/published location. Print one deduped
  // line per (block, field, reason) so an author sees exactly what to bump,
  // without a line per content variant.
  if (body?.errorId === 'THEME_FIELD_INCOMPATIBLE' && body.errors?.activationRefusal?.locations) {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const location of body.errors.activationRefusal.locations) {
      const key = `${location.blockApiId}.${location.fieldId}: ${location.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${key}`);
    }
    return new DeployError(
      [`deploy: ${detail ?? 'theme content compatibility requires confirmation'}`, ...lines].join(
        '\n'
      ),
      body.errorId
    );
  }
  const messages: Record<string, string> = {
    SITE_DEPLOY_TOKEN_INVALID:
      'token invalid or revoked — generate a new token in Studio (Settings → Site → Deploy token)',
    SITE_ARTIFACT_TOO_LARGE:
      'artifact exceeds limits (≤ 20,000 files, ≤ 25 MiB/file, ≤ 500 MiB unpacked, ≤ 200 MiB compressed)',
    SITE_ARTIFACT_INVALID: 'artifact rejected (path traversal or symlink entries)',
    SITE_MANIFEST_INVALID: 'manifest rejected by ingest — run `eldra-theme validate` locally',
    SITE_MANIFEST_TOO_LARGE:
      'manifest exceeds the 2 MiB limit — reduce block metadata and mock content, rebuild, and redeploy',
    SITE_DEPLOY_RATE_LIMITED: 'deploy rate limit hit — wait a few minutes, then retry',
  };
  return new DeployError(
    `deploy: ${messages[detail ?? ''] ?? `gateway responded ${res.status}${detail ? ` (${detail})` : ''}`}`,
    detail
  );
}
