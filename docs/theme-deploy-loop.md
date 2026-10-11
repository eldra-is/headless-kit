# The deploy loop

From `eldra-theme init` to a site a Studio author can edit, a theme goes through the same five
steps whether it is your first deploy or your hundredth: run it locally against a real
organisation, `validate`, `generate`, `deploy`, then let a publish in Studio trigger the next
rebuild on its own. This page is the loop; [Themes](themes.md) is the reference for what each piece
is, and [Starter kit conventions](starter-kit.md) is the worked example underneath it.

## 1. Create and run locally

```sh
eldra-theme init my-site
cd my-site
pnpm install
ELDRA_GATEWAY_URL=https://web-gateway.example.com ELDRA_ORG_ID=<org-id> pnpm dev
```

`init` copies the starter (`examples/starter-nuxt`) into the target directory and rewrites its
`workspace:` dependency ranges to published versions — everything it copies is source you own from
day one, apart from `@eldrajs/ui`, which stays an ordinary versioned dependency. `ELDRA_GATEWAY_URL`
is your organisation's public web-gateway origin and `ELDRA_ORG_ID` its id; without them `pnpm dev`
still runs, but every commerce block, and the build-time platform reads below, have nothing to read
from.

`pnpm dev` runs `nuxi dev` against the Vite plugin's live scan: editing a `block.json`, a
`mock.json`, `tokens.json`, `i18n/*.json` or `package.json` triggers `handleHotUpdate` and the
affected `virtual:eldra/*` modules reload without a full restart.

## 2. Validate

```sh
pnpm validate     # eldra-theme validate
```

`validate` runs the same scan and field-schema check a build runs, with no gateway required — the
pass/fail your CI should gate a pull request on before it ever reaches a deploy. It checks `blocks/`
against `block.json`'s own rules (field types, `relation`'s required target, `showWhen`'s sibling
rules, slot ids and allowlists, seed and migration shape — see [Starter kit
conventions](starter-kit.md#3-the-block-contract) for what each of those means) and, with local
history available (`.eldra/manifest.json` committed from a previous scan), the version-bump rules in
[Block field migrations](theme-field-migrations.md).

Add `--remote --gateway-url <url> --org-id <id>` to check field types against that organisation's
**live** field-type registry instead of the CLI's bundled list — useful once a platform ships a
field type newer than your installed `@eldrajs/theme-cli`. A remote check that cannot reach the
gateway falls back to the bundled list with a warning rather than failing closed.

## 3. Generate, against the platform's environment

```sh
pnpm generate     # nuxi generate — real static build
```

This is where the build-time platform reads happen: commerce settings, content locales,
theme-message overrides and resolved design tokens, each read once, in parallel, and each
independently fail-soft (see [How a theme meets the page builder](../CLAUDE.md#build-time-platform-reads)
in this repository's own agent context, or `@eldrajs/theme-nuxt`'s module directly). A generate run
with the wrong `ELDRA_ORG_ID` still succeeds — it just builds against the wrong organisation's
content, locales and overrides, which is the thing to check first when a build "looks right" but
reads like the wrong store.

`nuxi generate` writes the manifest the scan produced to `.eldra/manifest.json` inside the build
output — `eldra-theme deploy` reads that exact file, not a fresh scan, so what you deploy is what
you generated, byte for byte.

## 4. Deploy

```sh
ELDRA_API_URL=https://api.studio.example.com \
ELDRA_DEPLOY_TOKEN=<site-token> pnpm exec eldra-theme deploy
```

`deploy` tars the build output (`.output/public` or `dist`, or `--dir`), uploads it with the
manifest as a multipart `POST` to the Studio API, then polls the resulting deployment until it
reaches a terminal status. It refuses to pack a symlink, a Cloudflare Pages Function/Worker bundle,
more than 20,000 files or a file over 25 MiB before it ever uploads anything, and refuses an empty
token or a missing build output with a message naming the fix.

### Reading the report

A successful upload (HTTP 202) prints the block sync counts immediately, then every line below, in
order, before the status-polling loop starts:

```
deployment <id> accepted — blocks +2 ~5 -0
warning: <any sync warning the platform reported>
retired hero.subtitle → subtitle__v1 (type-changed, 12 entries) — previous content is read-only in Studio
converted navigation.menuLinks → links (6 entries, 2 links kept their URL)
warning: dropped 1 "category" row from navigation.links — the field does not offer that kind
status: PROCESSING
status: SUCCESS
```

- **`blocks +N ~N -N`** — created, updated and removed CMS schemas, from the manifest diff ingest
  computed against the organisation's installed schemas.
- **`retired <block>.<field> → <field>__v<N> (<reason>, <count> entries)`** — a field whose `type`,
  `localized` flag or storage shape changed, or that was dropped outright, moved its previous
  content to a new, read-only field id rather than discarding it. `reason` is one of
  `type-changed`, `localization-changed`, `shape-changed` or `removed`; see [Block field
  migrations](theme-field-migrations.md#type-changes-and-removed-fields) for what triggers each one
  and how to avoid an unwanted retirement. Nothing in a deployed theme should read a retired field —
  the content is kept for Studio's history view, not for the storefront.
- **`converted <block>.<from> → <field> (<N> entries[, <N> links kept their URL])`** — the
  counterpart: a field's previous content was rewritten into a new field's shape rather than
  retired, most commonly an old hand-rolled link/navigation shape converting into the platform's
  `link` field type. The two counts are different units — `entries` is the number of entries/variant
  units rewritten, "kept their URL" counts individual link rows that named no catalog or CMS
  destination and were stored as a plain URL instead.
- **`warning: dropped <N> "<kind>" rows from <block>.<field> — <reason>`** — one line per group of
  rows a conversion could not carry forward, naming the kind of row and why (today: "the field does
  not offer that kind", when the destination field's `metadata.kinds` does not include what the old
  data named). These rows are gone, not retired — check them against your `block.json`'s `link`
  field `metadata` if the count is non-zero and unexpected.
- **`status: <STATE>`** — `PROCESSING` while the platform builds from the uploaded artifact,
  terminating in `SUCCESS`, `FAILED` or `CANCELED`. A non-success terminal status fails the command
  with whatever log excerpt the platform attached.

### When the manifest is rejected

A deploy can fail before a deployment ever starts, with a message naming the reason:

- **`manifest rejected by ingest — run eldra-theme validate locally`** — the platform's own ingest
  refused the manifest for a reason your local `validate` should also catch (an unknown field type,
  a malformed seed, a relation naming no target); run `validate` and fix what it reports before
  retrying.
- **`theme content compatibility requires confirmation`**, followed by one `<block>.<field>:
<reason>` line per populated location — a version bump whose retirement would touch content that
  already exists in drafts or published entries. This is the same signal `validate`'s advisory local
  history gives you ahead of time when `.eldra/manifest.json` is committed; see [Block field
  migrations](theme-field-migrations.md#type-changes-and-removed-fields).
- **`manifest exceeds the 2 MiB limit`** — reduce block metadata and mock content (most often an
  oversized `mock.json`), then rebuild and redeploy.
- **`token invalid or revoked`** — generate a fresh deploy token in Studio (Settings → Site → Deploy
  token); a token is site-scoped and revocable independently of any other credential.
- **`deploy rate limit hit`** — wait and retry; this is a platform-side throttle, not a build defect.

## 5. Publish-triggered rebuilds

Everything above is what your CI pipeline runs on every push. The loop closes the other way too:
when a Studio author publishes a page, a reusable component, a design-token override or a
theme-text override, the platform schedules a rebuild of the same kind — it dispatches your CI the
same way a manual trigger would, your pipeline runs `nuxi generate` against the now-current platform
state and `eldra-theme deploy`s the result, and the author's change reaches the live site with no
one pushing a commit. Design-token and theme-message overrides are coalesced per site on a short
window so a run of edits causes one rebuild rather than one per keystroke; a product price or
availability change behaves the same way (see [Starter kit
conventions](starter-kit.md#3-the-block-contract) — "You do not rebuild the site to make a price
correct").

Wiring that dispatch is a one-time setup per site, documented with worked examples for GitHub
Actions, GitLab CI and Bitbucket Pipelines in [the starter's own
README](../examples/starter-nuxt/README.md#wiring-rebuilds): a pipeline that checks out the theme,
runs `nuxi generate` and `eldra-theme deploy` with the four environment values above, triggered
either by your own push or by the platform's dispatch. A triggered rebuild passes
`ELDRA_TRIGGER_DEPLOYMENT_ID`, which `deploy` forwards as `triggerDeploymentId` so the platform
completes the deployment it already created rather than opening a duplicate.

## Reference

- [Themes](themes.md) — the package map, the framework-free rule, route resolution, locale-prefixed
  routing.
- [Starter kit conventions](starter-kit.md) — the block contract in full, Storybook and generated
  previews, testing and accessibility gates.
- [Block field migrations](theme-field-migrations.md) — the version-bump rules behind "retired" and
  "theme content compatibility requires confirmation".
- [Design tokens](theme-design-tokens.md) and [Theme texts](theme-texts.md) — what Studio can
  override and how an override reaches a deployed (not just previewed) site.
- `packages/theme-cli/README.md` — the CLI's own command summary.
