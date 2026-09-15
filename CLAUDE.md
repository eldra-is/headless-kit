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
- **No `NPM_TOKEN` anywhere.** Publishing is npm trusted publishing over OIDC with provenance.
- Actions are pinned by commit SHA with the version in a trailing comment. Dependabot bumps them.
- **Public packages never import a private one.** `@eldra-is/sdk` and `@eldra-is/rich-text` import
  nothing at all outside their own folder. Framework wrappers import only their framework and the
  core packages.
- `packages/sdk/src/contract/` is generated. `web-gateway.v1.json` is a snapshot of the platform's
  public OpenAPI document (`/api/public/openapi.json`), versioned by semver: a minor bump adds, a
  major bump changes or removes. `pnpm contract --from <path|url>` refreshes it and regenerates
  `v1.ts` and `version.ts`. Never hand-edit any of the three; `pnpm contract:check` fails when they
  drift.

## Commands

```bash
pnpm check              # everything CI runs, in CI's order
pnpm test:watch         # unit tests, live
pnpm build              # every package, via tsdown / vite
pnpm contract --from https://web.eldra.app/api/public/openapi.json   # or a local path
pnpm size               # size budgets against dist; build first
pnpm pack-smoke         # pack, install into a fresh project, import at runtime and under tsc
```

## Releasing

Release-please in manifest mode, one component per package, tags `sdk-v1.2.3`. **It reads commit
types.** The pull request title is the squash-merge commit: `feat` or `fix` makes a release, `chore`
does not, and the manual workflow cannot force one. A refreshed contract snapshot is a `feat`.
Publishing happens on the GitHub release event, one package per release, by packing that package and
`npm publish --provenance`.

Each package keeps a hand-maintained `CHANGELOG.md` for what a consumer can see. Release-please's
generated notes describe commits; they do not replace it. Add the line in the same change.

## Layout

- `packages/sdk` — `@eldra-is/sdk`. Framework-free: no Vue, no DOM assumptions beyond `globalThis`
  lookups that tolerate absence. `src/vite-plugin.ts` is the `./vite` entry and may import Vite and
  Node; nothing else may. Built by tsdown.
- `packages/rich-text` — `@eldra-is/rich-text`. Framework-free, imports nothing. The document types
  are declared here, not imported from TipTap. `src/html.ts` is the kit's XSS surface: it
  serialises merchant-authored content to HTML, so every text and attribute value goes through
  `escapeHtml`, URLs through `safeHref` / `safeImageSrc`, colours through `safeCssColor`, and an
  embed renders only when `isTrustedEmbedSource` accepts its `src`. A change there needs a test
  that tries to break out, proven by mutation. Built by tsdown.
- `packages/vue` — `@eldra-is/vue`. The `RichText` renderer; depends on `@eldra-is/rich-text` and
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
