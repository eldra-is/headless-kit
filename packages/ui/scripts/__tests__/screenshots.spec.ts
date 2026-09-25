import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Vitest's module URLs are not `file:` URLs, so the script is resolved from the
// package root (vitest's `root` for this project) rather than `import.meta.url`.
const script = join(process.cwd(), 'scripts', 'screenshots.mjs');

/**
 * The run must finish on its own; a leaked handle shows up as a timeout here.
 * Kept under the per-test timeout below so this timer — which kills the child —
 * is what fires, rather than vitest abandoning a still-running process.
 */
const RUN_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 20_000;

const created: string[] = [];

function fixtureStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eldra-screenshots-'));
  created.push(dir);
  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({ v: 5, entries: { 'x--y': { id: 'x--y', type: 'story', name: 'Y' } } })
  );
  return dir;
}

function run(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--no-build'], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`screenshots.mjs did not exit within ${RUN_TIMEOUT_MS}ms:\n${output}`));
    }, RUN_TIMEOUT_MS);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('screenshots.mjs', () => {
  it(
    'exits 1 and releases the static server when Chromium cannot launch',
    async () => {
      // The static server is already listening by the time `chromium.launch()`
      // runs. Before the teardown fix its listening handle kept the event loop
      // alive, so this run hung forever instead of returning to the prompt —
      // the timeout in `run()` is what proves it no longer does.
      const { code, output } = await run({
        ELDRA_SCREENSHOTS_STATIC_DIR: fixtureStaticDir(),
        ELDRA_SCREENSHOTS_BASELINE_DIR: fixtureStaticDir(),
        ELDRA_SCREENSHOTS_PORT: '0',
        PLAYWRIGHT_BROWSERS_PATH: '/nonexistent',
      });
      expect(code).toBe(1);
      expect(output).toContain('playwright install chromium');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'exits 1 when the built Storybook is missing',
    async () => {
      const { code, output } = await run({
        ELDRA_SCREENSHOTS_STATIC_DIR: join(tmpdir(), 'eldra-screenshots-absent'),
        ELDRA_SCREENSHOTS_PORT: '0',
      });
      expect(code).toBe(1);
      expect(output).toContain('run without --no-build');
    },
    TEST_TIMEOUT_MS
  );
});
