import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `source-scan.spec.ts` and
// `custom-utility-coverage.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `@eldrajs/ui` ships publicly on the npm registry. A private npm scope exists in the same GitHub
 * organisation for Eldra's own internal UI library, a different audience entirely — see
 * `headless-kit/CLAUDE.md`'s Invariants for why the two are kept apart and never mixed. A docs pass
 * once wrote that private scope's exact package specifier straight into this package's `README.md`
 * and `src/resolver.ts`'s own JSDoc — both of which npm ships regardless of `package.json`'s
 * `files` allowlist, README always and a `.ts` source file's doc comments along with its compiled
 * declaration. Nothing caught it before it shipped once; this spec is what catches it next time.
 *
 * Scans every text file under `src/`, plus `README.md` and `CHANGELOG.md` (the two files npm
 * always includes), for that private scope and a couple of representative internal-only
 * hostnames/service names. The one legitimate use of the organisation's name in this package is the
 * *public* GitHub repository it lives in (in `package.json`'s `homepage`/`bugs`/`repository` URLs)
 * — a different thing from the private npm scope of the same name — so `package.json` is
 * deliberately not scanned here.
 *
 * This file's own source deliberately never spells the private scope out as one contiguous string:
 * doing so would trip the very hygiene grep this spec backs up, the same way the docs pass's
 * original mistake would have tripped this spec had it existed then. The pattern is assembled from parts instead — a `RegExp` matches the *contents
 * being scanned*, not its own construction, so this weakens nothing.
 */

const packageRoot = fileURLToPath(new NodeURL('../../', import.meta.url));
const monorepoRoot = fileURLToPath(new NodeURL('../../../../', import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

const scannableExtensions = /\.(ts|vue|md|json|css|mjs|cjs)$/;

// Directories that are never source: build output, dependencies and generated caches. Scanning
// them would be slow at best (a bundled `dist/` or `node_modules` tree) and a source of false
// positives at worst — a minified bundle can contain any substring by coincidence.
const skippedDirs = new Set([
  'node_modules',
  'dist',
  '.nuxt',
  '.output',
  'storybook-static',
  'coverage',
  '.git',
  '.turbo',
]);

function collectFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (skippedDirs.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (scannableExtensions.test(entry) && full !== selfPath) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every other workspace package's `src/` (and its `README.md`, where it has one) — this package's
 * own tree is collected separately above, by the path it already used.
 */
function otherPackageSources(): string[] {
  const packagesDir = join(monorepoRoot, 'packages');
  const out: string[] = [];
  for (const entry of readdirSync(packagesDir)) {
    const dir = join(packagesDir, entry);
    if (!statSync(dir).isDirectory() || dir === packageRoot.replace(/\/$/, '')) continue;
    const src = join(dir, 'src');
    if (existsSync(src)) collectFiles(src, out);
    const readme = join(dir, 'README.md');
    if (existsSync(readme)) out.push(readme);
  }
  return out;
}

/**
 * Every scanned file whose contents match `pattern`, as `path — the text that matched` lines.
 *
 * One assertion per pattern over the whole tree, rather than `it.each(files)`. The scan started at
 * one package's `src/` and now covers every package, the starter, `docs/` and the design spec —
 * some 1,300 files — and a test case per file per pattern was five thousand cases whose only
 * output was a name, enough extra scheduling to time out two unrelated browser specs sharing the
 * run. A failure here names every offender and the text it matched, which is what a reader
 * actually needs.
 */
function offenders(scanned: readonly string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of scanned) {
    const match = pattern.exec(readFileSync(file, 'utf8'));
    if (match !== null) found.push(`${relative(monorepoRoot, file)} — ${JSON.stringify(match[0])}`);
  }
  return found;
}

const files = [
  ...collectFiles(join(packageRoot, 'src'), []),
  join(packageRoot, 'README.md'),
  join(packageRoot, 'CHANGELOG.md'),
  // The starter ships in the same public repository (and `theme-cli`'s `prepack` copies it
  // verbatim into what `eldra-theme init` scaffolds), so a dangling internal reference there is
  // exactly as visible to an external reader as one in this package itself — the worst offender a
  // 2026-09 sweep found was a starter component naming a private planning artifact by its full
  // path. Scanned as one tree (not just `app/`/`blocks/`) so `test/`, `scripts/`, `.storybook/`,
  // `stories/`, `nuxt.config.ts` and the starter's own `README.md` get exactly the same guard.
  ...collectFiles(join(monorepoRoot, 'examples/starter-nuxt'), []),
  // The repository's own `docs/` tree, for the same reason: it is the public documentation this
  // kit links from every README.
  // Being outside the guard is exactly how two internal references survived in it — a private
  // report filename cited as the evidence for a Studio 400, and "the … project's Task 1 report"
  // cited as the evidence for a Tailwind resolution finding — both dangling pointers for every
  // external reader, both in files this branch was editing heavily.
  ...collectFiles(join(monorepoRoot, 'docs'), []),
  // This package's own `scripts/` and the **other packages'** source, for the third time over the
  // same reason — and this is the half the "only tree the checks above did not reach" claim got
  // wrong. A 2026-10 sweep for internal review wording found it spread right across the kit:
  // review-cycle labels in `theme-core`'s overlay narrative, a plan/task reference in
  // `vite-plugin-theme`, and the operator-report quotes in this package's own `drag-smoke.mjs`.
  // Every one of those files is as readable on the public repository as `src/` is, and none of
  // them was guarded.
  ...collectFiles(join(packageRoot, 'scripts'), []),
  ...otherPackageSources(),
  // The design spec the whole kit is built to, which ships in the repository and is linked from
  // `CLAUDE.md` and both READMEs.
  ...collectFiles(join(monorepoRoot, 'eldra-starter-spec'), []),
];

const privateNpmScope = ['@eldra', 'is/'].join('-'); // never write this contiguously above

// Each pattern names what it guards against so a failure says why, not just where.
const forbidden: { label: string; pattern: RegExp }[] = [
  { label: `the private npm scope (${privateNpmScope}…)`, pattern: new RegExp(privateNpmScope) },
  { label: 'an internal-only preview hostname', pattern: /local\.eldra\.app/ },
  { label: 'an internal-only gateway service name', pattern: /studio-gateway/ },
  // Private planning artifacts (`.superpowers/sdd/...`, `task-7-fix-1.md`,
  // `review-t7-fix1-report.md`) are dangling pointers for every external reader — a name in a
  // comment that resolves to nothing at all outside the private planning repo.
  {
    label: 'an internal SDD planning artifact reference',
    pattern: /\.superpowers|\btask-\d+-|fix-\d\b|review-t\d/i,
  },
];

/**
 * A second, wider pattern for a bare plan/task *reference* in prose — "Task 11",
 * "plan-3 Task 3" — as opposed to the artifact-*filename*-shaped patterns above. The original
 * single pattern needed a trailing hyphen after the task number (`\btask-\d+-`) and was
 * case-sensitive, so this slipped through untouched, along with `task-9b-live-report.md` in the
 * starter (the `b` between the digit and the hyphen broke the old pattern's assumption that a
 * digit run is always followed immediately by `-`).
 *
 * Deliberately **not** merged into `forbidden` above and deliberately **not** checked against
 * `CHANGELOG.md`: unlike a dangling filename or an internal hostname, "Task 13 of the … sub-
 * project" in a changelog entry is this package's own long-standing, narrated-history convention
 * (every plan-3 entry uses it, predating this fix) — a changelog documents shipped work under
 * whatever internal label it shipped under, the same way many real-world changelogs cite internal
 * ticket numbers, and rewriting that whole history is a content change with nothing left to guard
 * once done, not a hygiene fix. A doc comment or README paragraph describing present-tense design
 * rationale has no such excuse: "Task 11" there names nothing an external reader can resolve.
 */
const planTaskReference = {
  label: 'a bare internal plan/task reference',
  pattern: /\btask[- ]\d+|\bplan-\d/i,
};

/**
 * **Internal review wording**, the third family after the artifact *filenames* and the bare
 * plan/task *references* above — and the one that survived both for longest, because it reads like
 * ordinary prose until you try to resolve it.
 *
 * A 2026-10 sweep found it in roughly two hundred places across the kit: the starter's `UiImage`
 * and its spec naming the review cycle and the numbered decision each prop came out of ("fix round
 * 1, ruling 1"), a dozen components recording "operator ruling" as the authority for a deviation,
 * `theme-core`'s overlay narrative carrying the iteration a fix landed in ("generalized round 10,
 * serialized round 11"), and fifty doc comments attributing a prop or a part list to "the task
 * brief". None of it resolves to anything an external reader has: a review happened in a private
 * repository, a "ruling" was a line in a review comment, a "brief" was a planning document, and a
 * "round" is an ordinal in a process nobody outside it can count. Worse, each one *replaces* the
 * thing worth writing down — a comment that says a rule came out of round 2 is a comment that does
 * not say what the rule is.
 *
 * So the wording is forbidden outright and the comments state the rule instead. The patterns are
 * deliberately narrow, because three of the four words have ordinary English senses this kit uses
 * correctly and must keep: "a brief, non-blocking status message" (the design spec's own Toast
 * wording), "a real (if brief) pending transition", "That is the whole brief" inside a fixture
 * testimonial. Only the forms that name a document or a cycle are matched — `the brief`,
 * `brief's`, `task brief`, `round <n>`, `ruling` in any case — which is why this is its own
 * pattern and not a word list.
 *
 * `CHANGELOG.md` is scanned here, unlike for `planTaskReference` above, and the difference is the
 * one that entry already argues: "Task 11" in a changelog is that file's own long-standing
 * narrated-history convention, the way many changelogs cite internal ticket numbers, and a reader
 * takes it as a label on shipped work. "Fix round 2" and "the brief's own type" are not labels on
 * anything — they are the same unresolvable attribution as in a doc comment, in a file npm ships
 * to every consumer.
 */
const reviewProcessWording = {
  label: 'internal review-process wording (a review round, a ruling, the brief)',
  pattern: /\bfix round \d|\bround[ -]\d|\brulings?\b|\btask brief\b|\bthe brief\b|\bbrief's\b/i,
};

describe('public-repo hygiene: no shipped file names a review round, a ruling or the brief', () => {
  it(`names no ${reviewProcessWording.label}`, () => {
    expect(offenders(files, reviewProcessWording.pattern)).toEqual([]);
  });
});

describe('public-repo hygiene: no private scope or internal hostname in shipped files', () => {
  const changelogPath = join(packageRoot, 'CHANGELOG.md');

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(forbidden)('no shipped file carries $label', ({ pattern }) => {
    expect(offenders(files, pattern)).toEqual([]);
  });

  it(`no shipped file but the changelog carries ${planTaskReference.label}`, () => {
    const scanned = files.filter((file) => file !== changelogPath);
    expect(offenders(scanned, planTaskReference.pattern)).toEqual([]);
  });
});

/**
 * The starter is `eldra-theme init`'s scaffold: a customer reads every comment in it as if it were
 * their own project's history, not this monorepo's. A 2026-09 sweep found doc comments across the
 * starter naming the internal task/design-doc process this kit's own delivery plan used to build
 * it — "the task brief", "see task-1-report.md", "design doc §…" — none of which resolve to
 * anything a customer has. This is the regression guard: `planTaskReference` above already blocks
 * a bare `task-N`/`plan-N`, but not the prose forms ("task brief", "task report", "design doc")
 * that sweep actually found, so this checks for those too — across the whole starter tree and the
 * repository's `docs/` tree, the two trees an external reader actually reads (unlike the two checks
 * above, this one is not limited to `app/`/`blocks/`).
 */
const starterProcessWording = {
  label: 'internal task/design-doc process wording',
  pattern: /task report|task brief|task[ -]?\d+|superpowers|design doc/i,
};

describe('public-repo hygiene: the starter and docs name no internal process wording', () => {
  const starterFiles = files.filter(
    (file) =>
      file.startsWith(join(monorepoRoot, 'examples/starter-nuxt')) ||
      file.startsWith(join(monorepoRoot, 'docs'))
  );

  it('finds starter and docs files to scan', () => {
    expect(starterFiles.length).toBeGreaterThan(50);
  });

  it(`names no ${starterProcessWording.label}`, () => {
    expect(offenders(starterFiles, starterProcessWording.pattern)).toEqual([]);
  });
});

/**
 * A component this package has **removed** must stop being named in the files npm ships.
 *
 * `NumberInput` was replaced by `UnitInput`/`CurrencyInput` before any release, and ten doc
 * comments across seven files went on describing it — one of them pointing a reader at
 * `number-input.spec.ts`, a file that no longer exists. Nothing failed: prose is not compiled, and
 * a name in a comment resolves to nothing at all. This is what fails next time.
 *
 * Deliberately a list of names rather than something clever. "Every backticked PascalCase word in
 * the package must name something that exists" was measured first: 106 such words, 70 of them
 * legitimately not components (`ArrowDown`, `Intl`, `ISK`, `ComputedRef`, `Price` and the rest of
 * the spec's not-yet-built components), so the allowlist would be the maintenance burden the check
 * was meant to remove. The second `it` below is what keeps this list honest in the other
 * direction: a name that comes back has to be taken out of it.
 *
 * `CHANGELOG.md` is exempt, and only it: telling a reader that a component they may have taken
 * from a pre-release build is gone, and what replaces it, is exactly that file's job.
 */
const removedComponents = ['NumberInput', 'FieldNumberInput'];

describe('public-repo hygiene: no shipped file names a removed component', () => {
  const changelog = join(packageRoot, 'CHANGELOG.md');
  const shipped = files.filter((file) => file !== changelog);

  it('lists only components this package really does not ship', async () => {
    const { componentNames } = await import('../componentNames');
    const veeValidateEntry = readFileSync(join(packageRoot, 'src/vee-validate/index.ts'), 'utf8');
    for (const name of removedComponents) {
      expect(componentNames as readonly string[]).not.toContain(name);
      expect(veeValidateEntry).not.toContain(`export { default as ${name} }`);
    }
  });

  it.each(removedComponents)('no shipped file still mentions the removed %s', (name) => {
    expect(offenders(shipped, new RegExp(`\\b${name}\\b`))).toEqual([]);
  });
});
