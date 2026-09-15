# Contributing

Thanks for looking. Issues and pull requests are welcome.

## Running it

```bash
pnpm install
pnpm check        # everything CI runs, in CI's order
pnpm test:watch   # the unit tests, live
```

`pnpm check` is lint, format, build, types (including the specs), tests, and the
package checks (publint, are-the-types-wrong, size budgets, a tarball smoke test). A pull request
needs all of it green.

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
