# @eldrajs/theme-core changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `resolveLink` returns `label` and `group` exactly as they were authored, markers and all, because
  those are the strings a theme renders and in a Studio preview each carries the invisible payload
  that makes it inline-editable; only the strings a route is derived from (`kind`, the target's
  `_type`/`id`/`slug`, a `kind: "url"` href) are stega-stripped.

- New `@eldrajs/theme-core/links` entry: `resolveLink(value, context)` turns a `link` field's value
  into `{ href, label, newTab, group, children }` against the site's own pages and route templates —
  a product through the template serving `catalog:product`, a collection through
  `catalog:collection`, a category through `catalog:category`, an entry through the template serving
  its own schema, a page through the page tree, and a `kind: "url"` through the href allowlist. A
  target that is unknown, has no slug, or that no route template serves gives `href: null`, so a
  theme renders the label as plain text rather than a dead anchor; the label is the value's own when
  it has one, else the target's title, else null. `linkTargetKeys(value)` returns the
  `` `${_type}:${id}` `` keys a value names, children included and deduplicated, so a site can read
  its targets in one batch per type. `safeLinkHref(value)` is the kit's single href allowlist — a
  rooted path that is not protocol-relative, an in-page hash, or `https:`/`http:`/`mailto:`/`tel:`,
  stega-stripped, at most 2048 characters, no backslash and no control characters.

- `EldraCatalogReader` gains `listCategories(query?)` (`GET /catalog/v1/categories`), the one read a
  category link target needs.

- Feat: a new theme → editor bridge message, `theme:block-hovered`, reports the block the pointer
  is over — `{ entryId, rect, layoutNodeId?, reusablePlacementId? }`, or `null` once it leaves — so
  the editor can anchor an affordance (an "add block" control on the block's bottom edge) to the
  same geometry the theme already outlines. It is posted when the hovered *block* changes, not on
  every pointer move inside it, and re-posted whenever the theme's geometry may have moved, so a
  re-post can repeat the rect it last sent. Edit mode only, and gated on the new `block-hover`
  capability: an editor that does not advertise it receives nothing. The theme's own hover outline
  is unchanged.
- Feat: a layout node the author hid at a breakpoint (`style.visible` false there) stays on the
  Studio canvas in edit mode instead of disappearing. The generated layout CSS no longer puts
  `display:none` in the node's own rule: inside that breakpoint's `@media` block it emits
  `.<node>:not([data-eldra-edit-mode]){display:none}` plus
  `.<node>[data-eldra-edit-mode]:not([data-eldra-edit-mode] *){opacity:0.35}`, and the overlay runtime
  sets `data-eldra-edit-mode` on the nodes a framework binding marked `data-eldra-hidden` whenever the
  bridge mode is `edit` (after mount, like every other overlay decoration, so server and client
  render the same DOM). Preview, static generation and the published site never carry the marker, so
  they hide the node exactly as before. The dimming rule's `:not([data-eldra-edit-mode] *)` applies
  the 35 % once per hidden subtree: the marker is on every element carrying the node's class — the
  `display:none` gate is per element, and a binding may put that class on more than one nested
  element — and `opacity`, unlike `display:none`, multiplies through nesting.
- Feat: `hiddenLayoutBreakpoints(style)` returns the breakpoints a layout style hides its node at,
  in `normal, tablet, mobile` order and through the grammar's own inheritance. It is the value of
  the `data-eldra-hidden` attribute a framework binding puts on the layout node, space separated.
  `activeLayoutBreakpoint(width, breakpoints?)` resolves a viewport width to the breakpoint whose
  `@media` block is in force, from the same ranges the CSS is generated with.
  `EDIT_MODE_HIDDEN_OPACITY` is the 35 % the canvas dims a hidden node to.
- Feat: `createOverlayRuntime` takes the theme's `breakpoints`, so it can say which breakpoint the
  viewport is in. Omitted, the kit defaults are used.
- Feat: `theme:block-clicked` and each entry of `theme:blocks-rendered` may now carry
  `hiddenAtBreakpoint: true` — the block's **own** layout node is hidden at the breakpoint the theme
  is rendering at. A block hidden only because an ancestor node is hidden does not carry it.
  Additive and present only when true, so an editor that does not know the field sees
  byte-identical messages.
- Feat: a route-template layout may now hold reusable component placements (`{ id, type: 'reusable', componentId }`) alongside its `template-block` leaves, and
  `createTemplateLayoutRenderModel` takes a `reusableComponentProjection` to expand them with.
  Expansion is the same implementation page layouts use, so a component renders identically
  wherever it is placed: its nodes keep their authored ids and carry `renderId`/`placementId`, and
  a missing, foreign or stale component fails closed with the code a page reports for it. An
  absent projection is an empty one, and a placement may not be the root.
- Fix: a route-template layout may contain `block` nodes. Core serves a template in two shapes —
  the preview read keeps the `reusable` node and the projection, while the **public** read (what
  `resolveRoute` and every prerender see) has already replaced each placement with the component's
  own container of blocks and stripped the projection, exactly as a public page read is expanded
  and redacted. `createTemplateLayoutRenderModel` used to refuse that shape outright, failing every
  public template route carrying a header or footer role closed. A block in a template is held to
  the page block-node rules (closed keys, a uuid `entryId` inside the allowlist, never the root)
  and rendered like a page block; no `template-block` placement is registered for one. Both shapes
  produce the same document, the same stylesheet and the same DOM identity — the preview shape
  additionally carries the `renderId`/`placementId` Studio addresses a placement by.
- Fix: `decodeStega` and `stripStega` now read a payload whose closing delimiter is missing at the
  end of the string. The delimiter is U+FEFF, which `String.prototype.trim()` counts as whitespace,
  so a theme that renders `value.trim()` used to hand the overlay a run that no longer decoded — the
  field stopped being editable in Studio's preview and the invisible characters stayed in the DOM.
  A U+FEFF anywhere else in a value is still only a delimiter when a second one closes the run, so
  text that contains one of its own is untouched. The encoder is unchanged.
- Feat: a route template's `template-block` binding source may now name a list element by index —
  `images.0.url`, `variants.0.price` — alongside the field names it already accepted, so a block
  field can be bound to one item of a list on the route's entry (a product's first image or first
  variant price, or a CMS entry's own list field). A segment is an index only when it is a
  canonical non-negative integer (`0`, `12`); `-1`, `01` and `1a` are field names, and an index
  against a non-array or past the end of a list is not found — the same failure as a binding to a
  key the entry does not have. The `{{ }}` text-template grammar is unchanged: its paths stay
  identifier-only.
- Feat: the gateway client gained `client.catalog` — `getProduct(idOrSlug)`, `listProducts()`,
  `getCollection(slug)` and `listCollections()` over the public catalog endpoints, so a theme can
  render and prerender a catalog-backed route template without a second HTTP client. Catalog
  documents are returned as the gateway serves them: never stega-encoded and never locale-projected
  (they are commerce records, not merchant-authored content, and the gateway resolves their
  translations from the `locale` query), and a list page reports `data: null` as an empty array.
- Feat: `catalogRouteTarget(schemaApiId)` recognises a route template's `catalog:product` or
  `catalog:collection` schema id (stega-stripped, exact match) and returns `'product'` /
  `'collection'` / `null`, so a theme's catalog route template can tell which storefront view to
  render without re-parsing the schema id itself.
- Fix: a resolved catalog reference — a product or a collection a `reference` field points at
  (`{ id, _type: 'collection', slug, … }`, or the depth-0 stub `{ id, _type }`) — is now an opaque
  leaf in both preview walks. `encodeEntryDataStega` no longer stega-encodes the strings inside it
  (a theme block hands that `slug` straight to the storefront, and the invisible characters sent
  the request after a collection nobody has), and `projectEntryDataLocale` no longer mistakes its
  locale-keyed `translations` map for one of the theme's own localized fields and flattens it to
  the active locale.
- Fix: a `block` layout node whose width is measured from its content — `fit-content`, or an
  unset/`auto` width as a flex-row item, or anything but a fixed length inside such a node — no
  longer collapses to 0px. A block's own `@container` root applies inline-size containment, under
  which it has no intrinsic inline size; the generated CSS now turns containment off on that
  block's root (`.<node>>*{container-type:normal}`) and makes every determinately sized container
  node, the document root included, a query container (`container-type:inline-size`), so the
  block measures its content and its container queries resolve against the width of the region
  it sits in. `fit-content`, `fill`, `100%` and fixed lengths all keep their literal meaning; a
  determinate block keeps its own root as the query container exactly as before.
- Fix: a route template's `template-block` node whose `bindings`/`templates` keys were written
  against a field's pre-migration name (before a block bumped its version and renamed that field)
  no longer fails closed with `INVALID_VALUE`. `createTemplateLayoutRenderModel` now resolves such
  a key through the block's declared `renames` — a new, optional `TemplateBlockDefinition.renames`
  map, and the exported `buildTemplateBlockRenames` helper that flattens a block's `migrations`
  array into it — before validating the node, so an un-migrated stored template keeps rendering.
  Core still rewrites the stored bindings on deploy; this is the theme's own tolerance for the
  window before that happens.
- **`buildRichTextTree` takes a `minHeadingLevel` render option**: a floor for every `heading`
  node's rendered tag (`h{max(minHeadingLevel, level)}`, still capped at 6; default `1`, i.e. the
  document's own levels). A page owns its heading outline and a rich-text field does not, so one
  stored document has to be able to render as an h2-and-down section in one block and an h3-and-down
  one in another. Applying it at render time leaves the document untouched — the position stamps and
  every other attribute are identical with and without it. `@eldrajs/theme-vue`'s `EldraRichText`
  exposes it as a prop.
- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-core` package.
- `@eldra/bridge` is now the `@eldrajs/theme-core/bridge` subpath.
- Fix: a `select` field's value from the public/preview read path now arrives as its plain
  string (e.g. `"subtle"`), top-level and nested inside a `list`'s composite item. Previously
  the gateway's resolved `{ value, label }` object leaked into templates unwrapped, and was
  stega-encoded (breaking `===` comparisons) while live-editing. The unwrap only fires for a
  field the theme's manifest registers as `type: "select"` — an ordinary composite field with
  `value`/`label` sub-fields is left untouched. A theme that renders a select field's resolved
  value as visible text (a tone badge, a size label) loses overlay click-to-edit mapping for
  that text, because it is deliberately no longer stega-encoded.
- `EldraClient.encodeEntryDataStega` gained an optional fourth `apiId` parameter, used to skip
  stega-encoding a registered `select` field's resolved value — backwards compatible for any
  existing caller/implementer.
