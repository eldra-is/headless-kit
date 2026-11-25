# Contributing

Thanks for looking. Issues and pull requests are welcome.

## Running it

```bash
pnpm install
pnpm check        # everything CI runs: check:core, then test:slow
pnpm check:core   # all of it but the two slowest specs (CI's first job)
pnpm test:slow    # the draft preview parity gate and theme-nuxt's generate spec (CI's second job)
pnpm test:watch   # the unit tests, live
```

`pnpm check` is lint, format, build, types (including the specs), tests, and the
package checks (publint, are-the-types-wrong, size budgets, a tarball smoke test). A pull request
needs all of it green. CI runs `check:core` and `test:slow` side by side, and on a pull request runs
`test:slow` only when it changes a theme package, `ui`, `vue`, `rich-text`, `sdk`, the starter,
the lockfile or the CI workflow; every push to main runs both.

## Pull requests

- The title is a [conventional commit](https://www.conventionalcommits.org/): `feat(sdk): …`,
  `fix(rich-text): …`. It becomes the squash-merge commit and decides the next version.
- A change a consumer can see gets a line under **Unreleased** in that package's `CHANGELOG.md` in
  the same pull request.
- A regression test is proven by mutation: reintroduce the defect, watch the test fail, revert.
- Keep it to one change. Reformatting, renames and the fix in one diff makes the fix unreviewable.

## What this repository is not for

The Eldra platform, Studio, or a merchant's storefront. Those are separate; a bug in what the API
returns is not a bug here, though an issue pointing at it is still useful.
