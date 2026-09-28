# @eldrajs/theme-vue changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

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
  place fails the layout closed (`COMPONENT_STALE`).
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
