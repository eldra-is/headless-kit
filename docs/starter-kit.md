# Starter kit conventions

`examples/starter-nuxt` is what `eldra-theme init` copies: the base every customer theme starts
from. Everything under it is source the customer owns, with one deliberate dependency:
[`@eldrajs/ui`](../packages/ui/README.md), the accessible core component library, supplies the
buttons, links and form controls. It is restyled through the same `--eldra-*` design tokens the
rest of the theme uses — never by overriding its internals — and everything else (blocks, the
remaining primitives, the CSS) stays source the customer edits directly.

This doc covers the conventions a customer inherits: the styling foundation, the primitive layer,
the block contract, Storybook and generated previews, strings, and the testing/accessibility gates.
For the theme SDK itself (the manifest, the Studio bridge, the framework-free packages), see
[themes.md](themes.md); for the token/CSS pipeline in depth, see
[theme-design-tokens.md](theme-design-tokens.md).

## 1. Styling foundation

The starter uses Tailwind v4 bound to the Eldra design tokens, in one CSS entry:
`app/assets/main.css`.

**The route it uses, and why.** The theme Vite plugin's `virtual:eldra/tailwind-theme.css` entry
(`eldra.tailwind: true`) is the shape you'd reach for first — it emits `@import "tailwindcss"` plus
a generated `@theme static { --color-<id>: var(--eldra-color-<id>) }` block for every color token.
It works as a **JS-level** side-effect import (`import 'virtual:eldra/tailwind-theme.css'` from a
`.ts` entry). It does **not** work as a **CSS-level** `@import` — `@tailwindcss/vite` resolves
`@import` statements in CSS with its own filesystem resolver, which never reaches the virtual
module — and Nuxt's `css: [...]` array only accepts CSS files, so the JS-level form isn't reachable
from a Nuxt theme either. A theme also can't split the extension into a second CSS file: Tailwind
v4 treats every file containing `@import "tailwindcss"` as its own independent build root, so a
sibling file's `@theme` block never merges in. Both failure modes were reproduced end to end with a
real `nuxi generate`; see [theme-design-tokens.md](theme-design-tokens.md) for the full evidence.

So the starter keeps `eldra.tailwind: false` and authors `main.css` as a single self-contained
Tailwind root:

```css
@import 'tailwindcss';
@import '@eldrajs/ui/tailwind.css';
```

with `@tailwindcss/vite` registered directly in `nuxt.config.ts` (`vite: { plugins: [tailwindcss()] }`
— the adapter only asserts `tailwindcss@4.x` is installed, it never registers the transform plugin
itself).

The second import is the package's Tailwind entry (see
[packages/ui/README.md](../packages/ui/README.md#styles)): the `--eldra-*` variables with the
spec's defaults, a `@theme` block naming them in Tailwind's own namespaces (`--color-primary`,
`--radius-md`, `--font-heading`, `--shadow-md`, the type styles), the package's utilities
(`eldra-focus`, `control-h`, `text-body`, …) and a `@source './'` so this build also scans
`@eldrajs/ui`'s compiled components — without that last part a class only the package's `dist/*.js`
uses would never be emitted into the theme's stylesheet. It resolves out of `node_modules` through
Tailwind's own CSS resolver; unlike `virtual:eldra/tailwind-theme.css` above, there is nothing
virtual about it.

**Two files declare `--eldra-color-*`, and the order matters.** The package's defaults come in
through the import above; the theme's own values — `tokens.json`, plus any site override, what
Studio edits — come from `virtual:eldra/tokens.css`, which must land _after_ it. In the Nuxt build
that is already the case (verified in the emitted stylesheet); `.storybook/preview.ts` imports the
two in that order explicitly. A live Studio edit is a `<style>` appended to `<head>` by
`useEldraPreview`, so it wins over both.

**`tokens.json`** is the Studio-editable source for colors and layout containers, and its colour
ids are exactly the design spec's seventeen roles — which is also the set `@eldrajs/ui` reads:
`background`, `surface`, `surface-strong`, `border`, `border-strong`, `overlay`, `text`, `muted`,
`primary`, `primary-contrast`, `accent`, `accent-contrast`, `success`, `warning`, `danger`,
`focus`, `focus-inner`, each with `allowSiteOverride: true` so a site can override them without a
redeploy, and each chosen for WCAG AA contrast against its pairs (`test/tokens.spec.ts` asserts the
ratios). `border-strong` is the boundary of an interactive control, which the decorative `border`
is deliberately too light to be; `focus`/`focus-inner` are the two rings of the focus indicator;
`overlay` is the dialog scrim, written as an 8-digit hex because Core's token validator takes hex
or `oklch()`, never `rgba()`. Containers: `narrow` (40rem), `content` (64rem), `wide` (80rem),
`full`. Fonts and spacing are not Studio-editable yet (Core's descriptor-token ingest rejects them
today).

Each id becomes `--eldra-color-<id>`, which is the name `@eldrajs/ui`'s components read, so there
is no generated colour block in `main.css` any more and no sync script to keep current: editing a
colour in `tokens.json` restyles the theme _and_ the package's components.

**Code-level design variables** are the package's `--eldra-*` set (radii, shadows, spacing, type,
motion, z-index), which a customer overrides in `main.css` — for example `--eldra-font-heading` /
`--eldra-font-body`, whose defaults name two faces the package deliberately does not load. They
reach Tailwind through the package's own `@theme` as `rounded-md`, `shadow-md`, `font-heading`,
`text-body` and the rest. The only design values `main.css` still declares itself are the section
steps (`--spacing-section` and `--spacing-section-lg`, mapped from `--eldra-section-*` so `py-section`
keeps working), because the package names no spacing utility for them until its own `Section`
lands. Container gutters come from the token CSS's `--eldra-container-<id>-gutter-*` variables
through `UiContainer`, not Tailwind's own `container` utility — see the
`.eldra-container[data-size]` rules in `main.css`.

**Type scale** is Tailwind's defaults plus the package's type utilities: `body` takes `text-body`,
headings use `font-heading tracking-tight leading-[1.1]`. No scoped CSS and no `@apply` in blocks or
primitives — utilities only, so the kit stays readable as plain markup (`@apply` is used only inside
`main.css` itself, for the handful of base-layer/typography rules that have no per-component home).
Motion respects reduced-motion preferences everywhere via `motion-safe:` variants. Focus rings come
from two places now: `@eldrajs/ui`'s components draw the spec's own indicator (`eldra-focus`, the
`focus`/`focus-inner` token pair), and everything the theme still draws itself — a carousel track, a
lightbox thumbnail, the accordion summary — uses `app/utils/classes.ts`'s `focusRing`. There is no
blanket `:focus-visible` base rule; each focusable element says which ring it carries.

## 2. Components

### `@eldrajs/ui` — the core components

Buttons, links and form controls come from the package, not from copied source: `Button`,
`ButtonGroup`, `Link`, `Input`, `Textarea`, `FieldWrapper`, `FormLayout`, `Checkbox`,
`CheckboxGroup`, `RadioGroup`, `Switch`, `Select`, `MultiSelect`, `QuantityStepper`,
`VariantPicker`, `SearchBar`, `Icon`, `VisuallyHidden`. Import them by name
(`import { Button, Link } from '@eldrajs/ui'`) — they are never globally registered — and restyle
them through tokens, the per-component CSS variables, each component's `classes` prop, its slots,
or `as`. [`packages/ui/README.md`](../packages/ui/README.md) is the contract; display, commerce,
overlay and navigation components land there in the next two sub-projects and replace more of the
copied layer as they do.

Three things a theme has to keep on its own side of that boundary:

- **Destinations are the theme's to vet.** `Link` takes the `href` it is given, so a block runs it
  through `safeHref` (`app/utils/links.ts`) first and renders nothing when that returns `null`.
- **Routing is the theme's to supply.** For a same-site destination (`isInternalHref`) a block
  passes `app/components/EldraRouterLink.vue` as `Link`'s `as`, and `Link` hands it the
  destination as `to`. That component — the one place in the theme that writes the `<NuxtLink>`
  tag — is what keeps `blocks/**` free of Nuxt globals. Note a `Button` with `href` has no `as` in
  the spec and always renders a plain `<a>`: a button-shaped CTA is a document navigation.
- **Coloured grounds announce themselves.** A section (or card) whose background is the `primary`
  or `accent` token carries `class="group/section" data-section="primary|accent"`; the package's
  components read it and invert their own colours, so no block hand-writes a contrast colour for a
  button or link. `UiSection` does it from its `background` prop.

`app/plugins/eldra-ui-messages.ts` provides the package's own strings (`Close`, `Clear`, "opens in
a new tab", …) for the active content locale, from `app/i18n/uiMessages.ts`; `.storybook/eldra.ts`
and `test/support/mountBlock.ts` do the same for their environments.

### Primitives still copied into `app/components/ui/`

Vue 3 `<script setup lang="ts">`, Tailwind classes, no scoped CSS, every prop typed, `class`
passthrough via `attrs`. Restyle one by editing its file — there is no upstream package to fork or
override, and each is replaced by a `@eldrajs/ui` component in a later sub-project.

| Primitive                         | Contract                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiDialog`                        | Native `<dialog>` via `.showModal()`/`.close()`. `open` v-model, focus trap, focus restore on close, Escape closes, backdrop click closes unless `persistent`, body scroll locked. |
| `UiDrawer`                        | `UiDialog` positioned as a side sheet (`side: 'left' \| 'right'`), motion-safe slide.                                                                                              |
| `UiAccordion` / `UiAccordionItem` | Native `<details>/<summary>`; `single` mode closes siblings.                                                                                                                       |
| `UiTabs` / `UiTab` / `UiTabPanel` | `role="tablist"`, roving tabindex, arrow-key navigation.                                                                                                                           |
| `UiBadge`                         | `tone`.                                                                                                                                                                            |
| `UiPrice`                         | `amount`, `currency`, `compareAt?`, `locale`; `Intl.NumberFormat`, compare-at struck through with `sr-only` "was/now" text.                                                        |
| `UiRating`                        | `value` 0–5, `count?`; SVG stars with an `sr-only` label.                                                                                                                          |
| `UiContainer`                     | `size: 'narrow' \| 'content' \| 'wide' \| 'full'`; max-width/gutters from the container tokens.                                                                                    |
| `UiSection`                       | `spacing`, `background` (sets matching contrast text color, and marks a `primary`/`accent` ground for `@eldrajs/ui`), a `@container` context, wraps a `UiContainer`.               |
| `UiImage`                         | `src`, required `alt` (empty string allowed for decorative, renders `role="presentation"`), `framing?`, `aspect?`, `sizes`, lazy by default, `priority` for above-the-fold.        |

Each primitive has `<Name>.vue`, `<Name>.stories.ts`, and `__tests__/<Name>.spec.ts` (render, axe,
plus a keyboard test for anything interactive).

One component sits outside both groups: `app/components/EldraIcon.vue` resolves a Tabler icon
_name_ — what a CMS field holds — to markup through `useEldraIcon` and hands it to `@eldrajs/ui`'s
`Icon`, which owns the size, stroke weight and ARIA state. The package takes an icon _component_,
which is what keeps an icon library out of its dependencies.

## 3. The block contract

A block lives at `blocks/<apiId>/`:

```
blocks/<apiId>/
  block.json              field schema (Studio's CMS schema source)
  Block.vue                the renderer
  mock.json                the seed Studio writes when an author inserts the block — no demo media
  preview.json              optional: demo-imagery overlay, story/preview-only, merged onto mock.json
  preview.png               generated by `pnpm previews`, do not hand-edit
  __tests__/Block.spec.ts   render + axe (+ keyboard where interactive), merged data and bare mock.json
```

Stories are **generated**, not hand-written — see §4.

**Types.** `packages/vite-plugin-theme` writes `.eldra/block-types.d.ts` from every `block.json` on
dev/build and via `eldra-theme types --blocks`, declaring a global `EldraBlockData` map and
`EldraBlockEntry<K>` type. `Block.vue` declares
`defineProps<{ entry: EldraBlockEntry<'my-block'> }>()` and reads fields through
`useBlockData(props, 'my-block')`, which returns the typed `data` plus `useEldraBlockField`
bindings for rich text and image framing. The file is generated like `.eldra/manifest.json` — don't
hand-edit it, and don't format it (it's ignored by `oxfmt`).

**No Nuxt globals inside a block.** `blocks/**` and `app/components/ui/**` never call `useRoute`,
`useHead`, `NuxtLink`, `$fetch`, or `useAsyncData` directly, and never rely on Nuxt's auto-import —
every import from `vue` and `@eldrajs/*` is explicit. This is what makes every block render
correctly in Storybook, which has no Nuxt build step to auto-import from. Links go through
`@eldrajs/ui`'s `Link` (+ `safeHref`, + `app/components/EldraRouterLink.vue` for a same-site path);
rich text and slot zones go through `EldraRichText`/`EldraLayout`/`EldraBlockZone` from
`@eldrajs/theme-vue`. Pages (`app/pages/**`, `app.vue`) are not under this rule — `useRoute` /
`useHead` / Nuxt auto-imports are fine there, since they never run outside a real Nuxt build.

**Variants.** A block with visual variants declares a `select` field named `variant` in
`block.json`; every declared option value gets its own generated Storybook story and its own axe
assertion in the block's test.

**`mock.json`** is the seed Studio writes into a block's CMS entry when an author inserts it from the
palette, so it must be a write-valid shape for every field type — most importantly, **media fields
are absent** (never `null`, never a fixture object): Core's write-side media validator only accepts
`{ "assetId": "<uuid>", "framing"?: {...} }`, and a block whose `mock.json` populated a media field
with a Storybook fixture used to 400 on every fresh insert (task-9b-live-report.md, Finding 2). Every
other field is still the canonical demo content, not filler — write copy like a real store would, no
lorem ipsum; the starter's fictional store is "Northwind Goods" (home and lifestyle goods). Because
`mock.json` carries no media, `Block.vue` must render a sensible empty state with none (no crash,
never a broken layout — e.g. `hero`'s `image-background` variant falls back to `bg-surface-strong`
instead of light text on nothing) — this is also exactly the state a freshly-inserted block is in
before an editor uploads anything.

**`preview.json`** (optional, sibling to `mock.json`) is the story/preview-only overlay that supplies
demo imagery: the same media shape as before,
`{ "assetId": "demo-<name>", "url": "/demo/<name>.svg", "altText": "…" }`, and nothing else. Demo
images live under `public/demo/`, generated deterministically by `scripts/demo-images.mjs` (seeded
SVG illustrations, no third-party assets, no licensing question — a customer swaps them for real
photos). `scripts/generate-stories.mjs` merges it onto `mock.json` (`{ ...mock, ...preview }`) for
every generated story except `Inserted`, which renders the bare `mock.json` — exactly what Studio
seeds. A block with no media fields simply has no `preview.json`. Every block spec mounts both the
merged data and the bare `mock.json`, both asserted axe-clean — the bare-mock mount is the regression
net for a block that renders badly (or crashes) the moment it is freshly inserted.

**The merge is shallow** (`{ ...mock, ...preview }`, one level deep): a `list`-valued field present
in both files is not merged item-by-item — `preview.json` replaces the whole array. A block whose
list items carry non-media content (`title`/`body`/`href`, say, alongside the image) therefore
duplicates that content into `preview.json`'s copy of the list (`feature-grid` is the example in
this starter). Editing only `mock.json`'s copy silently has no effect on the generated story or the
regenerated `preview.png` — keep both copies in sync by hand, or move the field out of the list
shape if that drift becomes a real problem for a block you add.

## 4. Storybook and generated previews

Storybook 10 (`@storybook/vue3-vite`) lives in `examples/starter-nuxt/.storybook/`, with
`@storybook/addon-docs` and `@storybook/addon-a11y`. `viteFinal` registers `@vitejs/plugin-vue`
(Storybook's own Vue plugin only compiles CSF story templates, not the theme's `.vue` SFCs) and the
real theme Vite plugin, `eldraTheme({ themeDir, framework: 'nuxt', tailwind: false })`, so the same
`virtual:eldra/*` modules and token CSS that the real site uses are what stories render against —
plus Tailwind's own Vite plugin directly, mirroring the fallback route from §1.

`stories/blocks.stories.ts` and each primitive's own `.stories.ts` are the only hand-written entry
points; **block** stories are generated from `virtual:eldra/manifest` + `virtual:eldra/blocks` — one
`Default` story (`mock.json` merged with `preview.json`, when the block has one), one `Inserted`
story (bare `mock.json` — what Studio seeds on insert), plus one story per declared `variant` option
(from the same merged base as `Default`) — so adding a block or a variant never means writing
Storybook boilerplate.

```bash
pnpm --filter starter-nuxt storybook          # dev server, port 6007
pnpm --filter starter-nuxt build-storybook    # static build, runs in CI
pnpm --filter starter-nuxt previews           # regenerate blocks/<id>/preview.png
```

**Previews are generated, and checked for staleness.** `scripts/previews.mjs` builds Storybook,
serves the static output, and screenshots each block's `Default` story at 1280×auto with Playwright
Chromium into `blocks/<id>/preview.png` (the theme plugin copies these into `.eldra/previews/` for
Studio's block picker). `.eldra/previews.json` records a content hash per block — the hash of that
block's `Block.vue` + `mock.json` **plus `preview.json` (when present) plus `main.css`**, since a
shared style change can change every block's rendered pixels. `test/previewsFresh.spec.ts` fails with
"run pnpm previews" if any hash is
out of date, so **run `pnpm --filter starter-nuxt previews` after any block or `main.css` change and
commit the result** — `preview.png`, `.eldra/previews/*.png`, and `.eldra/previews.json` are all
tracked. The starter declares its own `@playwright/test` devDependency for this, so `pnpm previews`
works in a standalone copy too; run `pnpm exec playwright install chromium` once locally before the
first use.

## 5. Strings

`app/i18n/en-US.ts` and `app/i18n/is-IS.ts` each export a `satisfies Messages` object with the
identical key shape (`app/i18n/messages.ts` declares it, and a test asserts both locale files agree
on their key set). `useT()` (`app/composables/useT.ts`) reads the active locale off the Eldra
preview context (`useEldra().preview.locale`), falling back to `en-US` when there is no context —
outside a themed page, in a unit test, in Storybook — and returns a `t(key, params)` function with
plain `{param}` interpolation. There is no `vue-i18n` dependency.

No hard-coded UI copy in primitives, blocks, or pages — every visible string, `aria-label`, and
`sr-only` label goes through `t(...)`. Content copy from a block's `mock.json` is data, not UI copy,
and stays out of the locale files. Add a new key to **both** locale files in the same change; the
Icelandic string should be a real translation, not a placeholder.

## Testing and accessibility gates

Every primitive and block spec mounts from its mock/story data and asserts
`expect(await axe(wrapper.element)).toHaveNoViolations()` (`vitest-axe`, jsdom). Interactive
primitives and blocks (menu, dialog, drawer, accordion, tabs, carousel, lightbox) additionally carry
a keyboard test — arrow keys, Escape, Tab order, whatever the control's native interaction model
requires. Every interactive element carries a focus ring — the package's `eldra-focus` on its own
components, `app/utils/classes.ts`'s `focusRing` on everything the theme draws itself — and any
animation is gated behind `motion-safe:`.

```bash
pnpm --filter starter-nuxt typecheck          # nuxi typecheck + the Storybook config/stories
pnpm --filter starter-nuxt test               # vitest — every block/primitive spec, axe included
pnpm --filter starter-nuxt generate           # nuxi generate — proves a real static build
pnpm --filter starter-nuxt build-storybook    # proves Storybook itself still builds
pnpm --filter starter-nuxt previews           # regenerate + freshness-check block previews
pnpm check                                    # everything above, repo-wide, in CI's order
```

See [examples/starter-nuxt/README.md](../examples/starter-nuxt/README.md) for how to run the
starter itself, add a block, and restyle it via tokens.
