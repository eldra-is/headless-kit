#!/usr/bin/env node
// Bootstraps packages that have never been on npm so publish.yml can publish them over OIDC.
// Trusted publishing cannot create a package, so each new one gets a deprecated 0.0.0
// placeholder, then a trusted publisher for this repo's publish.yml, then (with --republish)
// a workflow run for the newest release tag whose version is still missing from the registry.
//
// Usage (needs `npm login` as a member of the @eldrajs scope and `gh auth login`):
//   node scripts/bootstrap-npm-packages.mjs --dry-run
//   node scripts/bootstrap-npm-packages.mjs [--republish] [package-dir ...]

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = 'eldra-is/headless-kit';
const WORKFLOW = 'publish.yml';
const REGISTRY = 'https://registry.npmjs.org';
// `npm trust` first shipped in npm 12; pinned so the script does not depend on the local npm.
const NPM = ['-y', 'npm@12.2.0'];
const PLACEHOLDER_VERSION = '0.0.0';
const WAIT_INTERVAL_MS = 10_000;
const WAIT_TIMEOUT_MS = 10 * 60_000;
const DEPRECATION =
  'Placeholder that reserved the name for trusted publishing. Install a real version.';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const republish = args.includes('--republish');
const only = args.filter((arg) => !arg.startsWith('--'));
const root = resolve(import.meta.dirname, '..');

function packages() {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, path: join(root, 'packages', entry.name, 'package.json') }))
    .filter(({ path }) => existsSync(path))
    .map(({ dir, path }) => ({ dir, manifest: JSON.parse(readFileSync(path, 'utf8')) }))
    .filter(({ manifest }) => manifest.private !== true)
    .filter(({ dir }) => only.length === 0 || only.includes(dir));
}

// null when the package does not exist; trusted is true once any version was published over
// OIDC, which the registry records on that version's _npmUser.
async function registryState(name) {
  const response = await fetch(`${REGISTRY}/${name.replaceAll('/', '%2f')}?t=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${name}: registry answered ${response.status}`);
  const document = await response.json();
  const versions = document.versions ?? {};
  const placeholder = versions[PLACEHOLDER_VERSION];
  return {
    versions: Object.keys(versions),
    latest: document['dist-tags']?.latest ?? null,
    trusted: Object.values(versions).some((version) => version._npmUser?.trustedPublisher),
    placeholderDeprecated: placeholder?.deprecated !== undefined && placeholder.deprecated !== '',
  };
}

// A fresh publish is "being processed" for a while; deprecate and trust 404 until it is visible.
async function waitUntilPublished(name) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const state = await registryState(name);
    if (state?.versions.includes(PLACEHOLDER_VERSION)) return state;
    if (Date.now() > deadline) {
      throw new Error(
        `${name}@${PLACEHOLDER_VERSION} is still not visible on the registry; run the script again later`
      );
    }
    console.log('  waiting for the registry to show the placeholder...');
    await new Promise((done) => setTimeout(done, WAIT_INTERVAL_MS));
  }
}

function run(command, commandArgs, options = {}) {
  console.log(`  $ ${command} ${commandArgs.join(' ')}`);
  if (dryRun) return '';
  const result = spawnSync(command, commandArgs, {
    stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    cwd: options.cwd ?? root,
  });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  return result.stdout ?? '';
}

function npx(npmArgs, options) {
  return run('npx', [...NPM, ...npmArgs], options);
}

// stdout and stdin stay on the terminal so npm can still ask for a login or an OTP; stderr is
// echoed live and kept, because npm exits 1 for every error and only its text names a 409.
// Resolves to 'added' or 'exists' and rejects on anything else.
function addTrustedPublisher(name) {
  const npmArgs = [
    'trust',
    'github',
    name,
    '--repo',
    REPO,
    '--file',
    WORKFLOW,
    '--allow-publish',
    '--yes',
  ];
  console.log(`  $ npx ${[...NPM, ...npmArgs].join(' ')}`);
  if (dryRun) return Promise.resolve('added');
  return new Promise((done, fail) => {
    const child = spawn('npx', [...NPM, ...npmArgs], {
      stdio: ['inherit', 'inherit', 'pipe'],
      cwd: root,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      stderr += chunk;
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (code === 0) done('added');
      else if (/\bE409\b|\b409 Conflict\b/.test(stderr)) done('exists');
      else fail(new Error(`${name}: npm trust github failed (see above)`));
    });
  });
}

function publishPlaceholder({ dir, manifest }) {
  const workdir = mkdtempSync(join(tmpdir(), 'eldra-placeholder-'));
  try {
    writeFileSync(
      join(workdir, 'package.json'),
      JSON.stringify(
        {
          name: manifest.name,
          version: PLACEHOLDER_VERSION,
          description: DEPRECATION,
          license: manifest.license,
          repository: manifest.repository ?? {
            type: 'git',
            url: `git+https://github.com/${REPO}.git`,
            directory: `packages/${dir}`,
          },
        },
        null,
        2
      )
    );
    writeFileSync(join(workdir, 'README.md'), `# ${manifest.name}\n\n${DEPRECATION}\n`);
    // A non-latest dist-tag so the first real release, published as latest, is what installs.
    npx(['publish', '--access', 'public', '--tag', 'placeholder'], { cwd: workdir });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function compareVersions(a, b) {
  const parse = (version) => version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [parse(a), parse(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

// Only the newest tag: dispatching older ones too would race them for the latest dist-tag.
function newestReleaseTag(dir) {
  const prefix = `${dir}-v`;
  const tags = execFileSync('git', ['tag', '--list', `${prefix}*`], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort((a, b) => compareVersions(a.slice(prefix.length), b.slice(prefix.length)));
  const tag = tags.at(-1);
  return tag === undefined ? null : { tag, version: tag.slice(prefix.length) };
}

async function main() {
  if (dryRun) console.log('Dry run: nothing is published, trusted or dispatched.\n');
  for (const pkg of packages()) {
    const { name } = pkg.manifest;
    let current = await registryState(name);

    if (current?.trusted) {
      console.log(`${name}: already publishes through trusted publishing`);
    } else {
      console.log(`${name}`);
      if (current === null) {
        console.log('  not on npm: publishing a placeholder');
        publishPlaceholder(pkg);
        current = dryRun
          ? {
              versions: [PLACEHOLDER_VERSION],
              latest: PLACEHOLDER_VERSION,
              trusted: false,
              placeholderDeprecated: false,
            }
          : await waitUntilPublished(name);
      } else {
        console.log(`  on npm (${current.versions.join(', ')}), latest ${current.latest}`);
      }

      // Not checked first: `npm trust list` cannot log in while its output is captured.
      if ((await addTrustedPublisher(name)) === 'exists') {
        console.log('  trusted publisher was already set on an earlier run');
      }

      if (republish) {
        const newest = newestReleaseTag(pkg.dir);
        if (newest !== null && !current.versions.includes(newest.version)) {
          console.log(`  ${newest.version} is tagged but not on npm: dispatching ${WORKFLOW}`);
          run('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '-f', `tag=${newest.tag}`]);
        }
      }
    }

    // npm gives a new package's first version `latest` whatever --tag says, so deprecating the
    // placeholder while it is latest puts a "deprecated" banner on the package page.
    if (current.versions.includes(PLACEHOLDER_VERSION) && !current.placeholderDeprecated) {
      if (current.latest === PLACEHOLDER_VERSION) {
        console.log('  placeholder is still latest: run again after the release to deprecate it');
      } else {
        npx(['deprecate', `${name}@${PLACEHOLDER_VERSION}`, DEPRECATION]);
      }
    }
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
