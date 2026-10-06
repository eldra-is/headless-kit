import { execa } from 'execa';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COLLECTION_HANDLE,
  ORG_ID,
  startMockGateway,
  type MockGateway,
} from './support/mockGateway';

/**
 * **A route the gateway could not be asked about must not be written as the not-found page.**
 *
 * A storefront's reads fail one at a time: a gateway under load answers one of them 500 and the
 * rest normally. That is not a 404 — a 404 means the object is gone, a 500 means nobody could be
 * asked — and the difference is the whole of this spec, because for one prerendered route the two
 * used to be indistinguishable:
 *
 *  * `useEldraPage()` is called twice on every page of this starter — once by
 *    `app/plugins/eldra-storefront.ts` for the catalog route it matched, once by
 *    `app/pages/[...slug].vue` for the page it renders — under one async-data key. Nuxt keeps one
 *    entry per key and runs the **first** registration's handler, so a failure the composable
 *    remembered in its own `ref` reached the plugin's call and nothing else: the page's `error`
 *    stayed `null` over an empty resolution, which is exactly what "there is no such page" looks
 *    like. The page drew its not-found shell.
 *  * And `nuxi generate` wrote it: a 10 kB "Page not found" document at
 *    `collections/<slug>/index.html`, for a collection with six products in it, with nothing in
 *    the build log and exit code 0. On the deployed site every link to that collection — the
 *    header's included — landed on a dead end that looked deliberate.
 *
 * So the failure now travels with the resolution (`ResolvedEldraRoute.error`), the theme answers
 * such a route `500` on the server, and `nitro.prerender.failOnError` makes the build say so.
 * Nitro marks a non-200 route failed *before* it writes anything, which is what keeps the wrong
 * page out of the artifact rather than merely out of the happy path.
 *
 * The gateway here fails exactly one read — the collection template's own
 * `GET /catalog/v1/collections/<slug>` — so every other route in the build is unaffected and the
 * assertions are about one route's absence rather than about an empty `.output`.
 */

const templateDir = fileURLToPath(new URL('..', import.meta.url));
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
/** Build output and installed dependencies: rebuilt or symlinked in the copy, never copied. */
const SKIPPED_FROM_COPY = new Set(['node_modules', '.nuxt', '.output', '.git']);

let gateway: MockGateway;
let scratch: string;
let root: string;
let generated: { exitCode: number | undefined; stdout: string; stderr: string };

const output = (path: string): string => join(root, '.output', 'public', path);

describe('a prerendered route whose resolution failed', () => {
  beforeAll(async () => {
    gateway = await startMockGateway({
      failPath: `/catalog/v1/collections/${COLLECTION_HANDLE}`,
    });
    scratch = mkdtempSync(join(tmpdir(), 'eldra-prerender-failure-'));
    root = join(scratch, 'site');
    // The starter itself, minus what a build makes — the same reason
    // `test/prerenderRefresh.browser.spec.ts` copies it: `nuxi generate` writes `.output` into its
    // own working directory, and this suite must not race the one `test/starter.spec.ts` runs.
    cpSync(templateDir, root, {
      recursive: true,
      filter: (source) => {
        const [first] = relative(templateDir, source).split(sep);
        return first === undefined || !SKIPPED_FROM_COPY.has(first);
      },
    });
    symlinkSync(join(templateDir, 'node_modules'), join(root, 'node_modules'), 'dir');
    const run = await execa(nuxi, ['generate'], {
      cwd: root,
      env: { ELDRA_GATEWAY_URL: gateway.url, ELDRA_ORG_ID: ORG_ID },
      reject: false,
      timeout: 600_000,
    });
    generated = { exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr };
  }, 900_000);

  afterAll(async () => {
    await gateway?.close();
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  });

  it('writes no file for it, and no not-found shell anywhere under its path', () => {
    const collectionDir = output(join('collections', COLLECTION_HANDLE));
    expect(existsSync(join(collectionDir, 'index.html')), 'collection page written').toBe(false);
    expect(existsSync(join(collectionDir, '_payload.json')), 'collection payload written').toBe(
      false
    );
    // Nothing under `collections/` at all, in any locale: the one collection this fixture has is
    // the one whose read fails.
    for (const prefix of ['', 'is-IS']) {
      const dir = output(join(prefix, 'collections'));
      const written = existsSync(dir) ? readdirSync(dir) : [];
      expect(written, `${prefix || '/'} collections`).toEqual([]);
    }
  });

  it('fails the build over it, rather than exiting 0 with the page missing', () => {
    // `nitro.prerender.failOnError` (`nuxt.config.ts`) is the half that makes the *absence* loud:
    // without it the generate still exits 0 and an artifact with a hole in its catalogue is
    // deployable. The route itself is named in the prerender list Nitro prints, which is on the
    // build's console rather than in what `nuxi generate` hands back here.
    expect(generated.exitCode).not.toBe(0);
    expect(`${generated.stdout}\n${generated.stderr}`).toContain('prerender errors');
  });

  it('still writes every route the gateway could answer', () => {
    // The product template, the home page and the styled not-found shell are untouched by a
    // failure in one collection read — a build that threw them away too would pass the assertions
    // above for the wrong reason.
    expect(existsSync(output(join('products', 'ash-glaze-mug', 'index.html')))).toBe(true);
    expect(existsSync(output('index.html'))).toBe(true);
    const notFound = output(join('404', 'index.html'));
    expect(existsSync(notFound)).toBe(true);
    expect(readFileSync(notFound, 'utf8')).toContain('data-eldra-not-found');
  });
});
