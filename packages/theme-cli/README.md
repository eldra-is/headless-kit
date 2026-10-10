# @eldrajs/theme-cli

CLI for Eldra themes: scaffold a new theme from the starter, generate new blocks, validate a
theme's blocks against the manifest schema (locally or against a Studio org's live field-type
registry), generate TypeScript types for an org's CMS schemas, and deploy a static build to
Eldra.

```bash
pnpm add -D @eldrajs/theme-cli
```

## Usage

```bash
pnpm exec eldra-theme init my-site
pnpm exec eldra-theme scaffold block hero
pnpm exec eldra-theme validate
pnpm exec eldra-theme types --schemas page,hero --out generated/eldra.d.ts
pnpm exec eldra-theme deploy
```

See [docs/themes.md](../../docs/themes.md) for the full theme integration guide.

## Development

The CLI's tests exercise the built `dist/cli.js` as a subprocess, so `pnpm build` must run before
`pnpm test` (the workspace's `pnpm test` from the repo root builds nothing itself; run `pnpm build`
first, or `pnpm --filter @eldrajs/theme-cli build` then `pnpm --filter @eldrajs/theme-cli test`).
