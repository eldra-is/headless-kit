# @eldrajs/theme-vue changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `EldraContext` gains `messages` (reactive `{ defaultLocale, locales }`, flat dotted keys): the
  theme's resolved message catalogue, defaulting to the fallback catalogue
  (`{ defaultLocale: 'en-US', locales: {} }`) in `provideEldra()` (a new optional `messages` option
  there overrides it — a Storybook mount or a unit test that passes none renders exactly as a
  theme with no `i18n/` directory does), and to `virtual:eldra/messages`'s build-time-merged content
  in `@eldrajs/theme-nuxt`'s runtime plugin. `useEldraPreview` handles the new
  `editor:theme-messages` bridge message beside `editor:design-tokens`: `applyThemeMessages`
  replaces `context.messages.locales[tag]` wholesale, per locale the push names (through
  `@eldrajs/theme-core/i18n`'s `sanitizeLocaleMessages`, refusing a forbidden locale tag —
  `__proto__`/`prototype`/`constructor` — that would otherwise reassign the live, reactive
  object's own prototype instead of adding a property named for it), ignoring a stale revision
  (`preview.messagesRevision`, mirroring `designTokensRevision`'s guard) the same way.

- `useEldraLink()` now spells every resolved same-site href in the active content locale, children
  included — a navigation resolved on `/is-IS/...` points into `/is-IS/...` instead of dropping the
  visitor back into the default language. The rewrite is idempotent, so a theme's router-link
  component may prefix as well without the two compounding, and it short-circuits entirely on a
  page in the locale served at `/`.

- `EldraContext` gains an optional `locales` slice (`EldraLocaleState`) and `useEldraLocale()`
  reads it: which content locale the page is in, which locales the site serves, and three helpers
  for spelling a destination in one of them (`path`, `switchPath`, `select`). It lives on the theme
  context rather than in a framework composable so a **block** reaches it through the same single
  `inject` it already uses — a block has to render in a Storybook story and a unit mount with no
  router anywhere. `createEldraLocaleState()` is the one-unprefixed-site state every context starts
  with (`provideEldra` seeds it), and an adapter with real routing replaces it;
  `useEldraLocale()` answers the same shape outside a themed app, so a block can read it with no
  branch. An adapter one version behind simply serves one unprefixed site.

- `EldraContext['preview']` gains `tokenRevision`, bumped every time `editor:init` carries a
  preview token that differs from the one before it — a consumer can tell "a new token arrived"
  from "another content update arrived" (`refreshRevision` bumps for both). A context assembled by
  hand must include it; `createEldraPreviewState()` does.

- `startEldraPreview` posts the new `theme:request-failed` bridge message for every failed gateway
  request the preview makes while a preview token is in use (404 excepted — that is a miss the theme
  resolves itself). It is what lets the editor notice that the organization's single preview token
  has been revoked by a mint elsewhere, hand over a fresh one and have the drafts reappear, instead
  of the canvas silently showing none.

- New `useEldraLink()`: returns `(value) => ResolvedLink | null`, which resolves a `link` field's
  value against the site's own pages and route templates. Keep the returned function — it closes
  over the reactive theme context, so a row re-resolves when its target arrives or a preview draft
  changes the value, and outside a themed app it resolves everything to `null` rather than throwing.
  `resolveLink`, `linkTargetKeys`, `safeLinkHref` and the link types are re-exported from the
  package root.

- `EldraContext` gains a reactive `links` slice (`pages`, `templates`, `targets`), built by the new
  `createEldraLinkState()` beside `createEldraPreviewState()`. An adapter that assembles a context
  by hand must build it from there.

- Feat: `EldraLayout` renders `data-eldra-hidden` on a layout node its style hides at one or more
  breakpoints, listing them space separated (`data-eldra-hidden="tablet mobile"`). It is rendered
  unconditionally — identical on the server and the client, carrying no styling of its own — and is
  how `@eldrajs/theme-core`'s overlay finds the nodes to mark when Studio puts the theme in edit
  mode, where a hidden node is dimmed rather than removed.

- Feat: `EldraLayout` renders reusable component placements inside a **route template**. The
  `templateEntry` branch now passes `reusableComponentProjection` (an absent one is the empty
  projection, so a placement fails closed exactly as it does on a page) and the resolved `blocks`
  entry map into `@eldrajs/theme-core`'s `createTemplateLayoutRenderModel` — the expanded
  component's blocks are ordinary block nodes and resolve through that map, where they previously
  had none and rendered as the hidden `data-eldra-missing-block` placeholder. Identity is the page
  behaviour byte for byte: each expanded node keeps its authored id, carries
  `data-eldra-reusable-placement`, and gets the same deterministic render id and scoped class, so
  Studio addresses a placement inside a template exactly as it addresses one inside a page. Pass
  the **template read's own** projection: a projection carrying a binding the template does not
  place fails the layout closed (`COMPONENT_STALE`). The **public** (non-preview) template read
  arrives already expanded and carries no projection at all — the resolved entry map is what makes
  that shape render too, and it renders the same layout, minus the preview-only placement identity.
- Fix: `EldraLayout`'s template-block catalog now carries each manifest block's declared field
  renames (built from its `migrations` array via `@eldrajs/theme-core`'s `buildTemplateBlockRenames`),
  so a route template's `template-block` node still keyed by a field's pre-migration name resolves
  and renders instead of falling back to the hidden invalid-layout placeholder.
- **`EldraRichText` takes a `minHeadingLevel` prop**: a floor applied to every heading node at
  render time (`h{max(minHeadingLevel, level)}`, still capped at 6; default `1`, i.e. the document's
  own levels). A page owns its heading outline and a rich-text field does not — the same stored
  document is legitimately an h2-and-down section in one block and an h3-and-down one in another —
  and nothing in the document or in `block.json`'s level-agnostic `heading` toolbar control can say
  so. Applying it at render time leaves the document untouched, so an editor's own level survives a
  round trip through Studio and the `data-eldra-pos` stamps native editing depends on do not move; a
  theme no longer needs a per-block transform over the TipTap JSON. The floor itself (and every
  out-of-range/non-integer guard) is `@eldrajs/theme-core`'s `buildRichTextTree`, which gained the
  matching `minHeadingLevel` render option.

- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-vue` package.
- Fix: a draft's own top-level `select` field now unwraps to its plain string value the same way
  one nested inside a draft's embedded block already did, so a live-editing `Block.vue`'s `===`
  comparison keeps working for a top-level `select`/`variant` field too.
