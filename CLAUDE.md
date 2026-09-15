# CLAUDE.md

Public repository. Everything here is visible to anyone, and the packages are on the public npm
registry. Read this before changing anything.

## Invariants

- **GitHub-hosted runners only.** Every workflow is `runs-on: ubuntu-latest`. Never `self-hosted`,
  never a reusable workflow from another Eldra repository — those target self-hosted runners and
  a private registry. A fork pull request on a self-hosted runner executes a stranger's code on
  private infrastructure.
- **No secret is readable from a job that runs pull request code.** `ci.yml` and `commit-check.yml`
  use `pull_request`, never `pull_request_target`, and carry no secrets. Secrets exist only in
  `release.yml` (push to main) and `publish.yml` (release published), which fork code cannot
  trigger.
- **No `NPM_TOKEN` anywhere.** Publishing is npm trusted publishing over OIDC with provenance, to
  npmjs only. The scope is the audience: `@eldrajs/*` is public, on npmjs, needs no token;
  `@eldra-is/*` is Eldra's private UI library on GitHub Packages. They are different scopes on
  purpose — an npm scope resolves against one registry, so one scope for both would mean no
  repository could depend on both. Never publish this kit under `@eldra-is`.
- Actions are pinned by commit SHA with the version in a trailing comment. Dependabot bumps them.
- The `main — checks` ruleset requires the CI job by its **name** (`Lint, types, tests, build,
package checks`) and the commit check by its job id (`check`). Rename either and every pull
  request waits forever for a status that never comes; update the ruleset in the same change.
- **Public packages never import a private one.** `@eldrajs/sdk` and `@eldrajs/rich-text` import
  nothing at all outside their own folder. Framework wrappers import only their framework and the
  core packages.
- **The SDK ships no response types.** `src/contract.ts` declares an empty `EldraContract`
  interface; the Vite plugin generates the gateway's OpenAPI document into the consumer's project
  as `contract.ts`, which augments that interface, and every contract-derived type then resolves.
  Without the augmentation they resolve to `unknown` (responses) or `Record<string, unknown>`
  (bodies, queries) — never to a guess. Do not add a snapshot of the document back into the
  package; `src/__tests__/fixtures/web-gateway.json` is a test input only.

## Commands

```bash
pnpm check              # everything CI runs, in CI's order
pnpm test:watch         # unit tests, live
pnpm build              # every package, via tsdown / vite
pnpm --filter @eldrajs/sdk fixture   # regenerate the test fixture's contract.ts after a build
pnpm size               # size budgets against dist; build first
pnpm pack-smoke         # pack, install into a fresh project, import at runtime and under tsc
```

## Releasing

Release-please in manifest mode, one component per package, tags `sdk-v1.2.3`, one release PR for
all packages. The `node-workspace` plugin bumps `vue` when `rich-text` releases and rewrites the
`workspace:^` range on publish; do not add `linked-versions` — it opens its own group PR and that
candidate is dropped under `separate-pull-requests: false`, so only `sdk` gets released. **It reads commit
types.** The pull request title is the squash-merge commit: `feat` or `fix` makes a release, `chore`
does not, and the manual workflow cannot force one.
Publishing happens on the GitHub release event, one package per release, by packing that package and
`npm publish --provenance`.

Each package keeps a hand-maintained `CHANGELOG.md` for what a consumer can see; add the line in the
same change, under Unreleased, and rename that heading to the version in the release PR's wake.
Release-please writes its generated notes to `RELEASE-NOTES.md` in each package (`changelog-path`),
which is not shipped in the tarball; the GitHub release carries the same text.

## Layout

- `packages/sdk` — `@eldrajs/sdk`. Framework-free: no Vue, no DOM assumptions beyond `globalThis`
  lookups that tolerate absence. `src/vite-plugin.ts` is the `./vite` entry (`eldra()`), may import
  Vite, Node and `openapi-typescript`; nothing else may. Type checking runs twice: `tsconfig.json`
  proves the un-generated state (`unknown`), `tsconfig.generated.json` proves the generated state
  against the fixture. Built by tsdown.
- `packages/rich-text` — `@eldrajs/rich-text`. Framework-free, imports nothing. The document types
  are declared here, not imported from TipTap. `src/html.ts` is the kit's XSS surface: it
  serialises merchant-authored content to HTML, so every text and attribute value goes through
  `escapeHtml`, URLs through `safeHref` / `safeImageSrc`, colours through `safeCssColor`, and an
  embed renders only when `isTrustedEmbedSource` accepts its `src`. A change there needs a test
  that tries to break out, proven by mutation. Built by tsdown.
- `packages/vue` — `@eldrajs/vue`. The `RichText` renderer; depends on `@eldrajs/rich-text` and
  peers on `vue`. Uses the same safety helpers in `Link.vue`, `Image.vue` and `Embed.vue`. Built by
  Vite in library mode with `vite-plugin-dts` bundling the declarations into one `index.d.ts` —
  per-file `.vue.d.ts` output fails Node16 resolution, which `attw` catches.
- `examples/` — real projects on the workspace packages, type-checked by `pnpm typecheck`. A
  documented snippet lives here first and is referenced by path, so it cannot stop compiling
  silently.
- `docs/` — plain markdown: `getting-started.md`, `rich-text.md`, `frameworks.md` (the contract a
  wrapper for another framework must satisfy).

## Testing

Vitest, `environment: node` for the framework-free packages. A test that guards a specific defect is
proven by mutation before it is called a guard. `pnpm typecheck` includes the specs, so
`expectTypeOf` assertions are only real there; `pnpm test` does not check types.
