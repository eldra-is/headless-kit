# `@eldrajs/ui`

Accessible Vue 3 core components for Eldra storefronts, themed through CSS design tokens.

The components are built to
[`eldra-starter-spec/01-core-components.md`](../../eldra-starter-spec/01-core-components.md) (WCAG
2.2 AA). Plan 1 — foundations, actions and forms (`Button`/`ButtonGroup`, `Link`, `Input`,
`Textarea`, `FieldWrapper`, `FormLayout`, `Checkbox`/`CheckboxGroup`, `RadioGroup`, `Switch`,
`Select`/`MultiSelect`, `QuantityStepper`, `VariantPicker`, `SearchBar`) — is complete; display,
commerce, layout, overlays, navigation and feedback components land in the two sub-projects that
follow, in the same delivery order the spec's "Components and delivery order" section lays out.
Where this package adds something the spec's property tables do not list, it is recorded below
under [Deviations](#deviations) rather than left for a reader to find.

## Install

```bash
pnpm add @eldrajs/ui vue
```

Peer: `vue ^3.4`. `vee-validate ^4.12` is an **optional** peer — only the `./vee-validate` entry
needs it, and nothing else in the package imports it.

## Styles

Three CSS entries ship; pick the one that matches how the consumer builds CSS. Every one of them
starts from the same `--eldra-*` variables, so nothing here is a different theme, only a different
delivery shape.

- **`@eldrajs/ui/tokens.css`** — the `--eldra-*` variables only (colours, radii, spacing, type,
  motion, z-index), declared on `:root` with the spec's defaults, plus a
  `@media (prefers-reduced-motion: reduce)` rule that zeroes every duration variable.
- **`@eldrajs/ui/tailwind.css`** — `tokens.css`, then a Tailwind v4 `@theme` block mapping its own
  namespaces onto those variables (`--color-primary: var(--eldra-color-primary)`, `--radius-md`,
  `--font-heading`, `--spacing-*`, `--shadow-*`, `--ease-*`) plus the package's custom utilities
  (control heights, the `eldra-focus` ring, the type styles, motion and layer utilities) and a
  `@source "../dist"` so a consumer's own Tailwind build scans the package's _compiled_ components.
  For a project that already runs Tailwind v4, `main.css` (or equivalent) becomes:

  ```css
  @import 'tailwindcss';
  @import '@eldrajs/ui/tailwind.css';
  ```

- **`@eldrajs/ui/style.css`** — the package's own compiled build of `tailwind.css` plus every
  component's utilities, for a consumer with no Tailwind build of their own:

  ```css
  @import '@eldrajs/ui/style.css';
  ```

  This is also what a project whose own Tailwind build cannot share this package's utility prefix
  (a `ui:`-prefixed theme, for example) reaches for.

## Fonts

The type tokens' defaults are `--eldra-font-heading: "Bricolage Grotesque", ui-sans-serif,
system-ui, -apple-system, "Segoe UI", sans-serif` and `--eldra-font-body: "Instrument Sans",
ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. The package does not load either
font — it only names them — so a consumer either loads Bricolage Grotesque and Instrument Sans
themselves (self-hosted, or a Google Fonts `<link>`/`@import`) or overrides `--eldra-font-heading`
and `--eldra-font-body` with their own stack. Until one or the other happens, text renders in the
fallback system stack, which is legible but not the spec's intended look.

## Customisation

Every component supports all five of these; none hard-codes anything a store might want to change.

1. **Tokens.** Every colour, radius, height, spacing step, font, duration, easing and z-index a
   component uses resolves to a `--eldra-*` variable from [Styles](#styles) above — set one on any
   ancestor (typically `:root`) and every component reading it follows.
2. **Per-component CSS variables**, declared on the component's own root with a token-derived
   default, for the handful of values that are not shared design tokens — a size with no dedicated
   token, a component-specific corner radius. Each one is documented on the component's own
   Storybook docs page; the variables currently declared:

   | Component         | CSS variables                                                                                                                                                                                                                                                                                                                                                                                              |
   | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `Button`          | `--eldra-button-radius` (default `var(--eldra-radius-md)`), `--eldra-button-line-height` (default `1.2`), `--eldra-button-font-size-lg` (default `1.0625rem`, the one button size with no type token of its own)                                                                                                                                                                                           |
   | `Checkbox`        | `--eldra-checkbox-radius` (default `var(--eldra-radius-sm)`), `--eldra-checkbox-border-width` (default `1.5px`), `--eldra-checkbox-border-width-invalid` (default `2px`)                                                                                                                                                                                                                                   |
   | `FieldWrapper`    | `--eldra-field-note-line-height` (default `1.45`) — the line the help and error text share                                                                                                                                                                                                                                                                                                                 |
   | `Input`           | `--eldra-input-radius` (default `var(--eldra-radius-md)`), `--eldra-control-font-size` (default `0.9375rem`), `--eldra-control-font-size-mobile` (default `1rem`), `--eldra-control-line-height` (default `1.5rem`), `--eldra-field-border-width` (default `1px`)                                                                                                                                          |
   | `Link`            | `--eldra-link-radius` (default `2px`) — the focus ring's corner radius on every variant                                                                                                                                                                                                                                                                                                                    |
   | `MultiSelect`     | everything `Select` reads, plus `--eldra-select-pill-line` (the "+N" pill's line box) and `--eldra-checkbox-radius`/`--eldra-checkbox-border-width`, shared with `Checkbox` so a consumer restyles both at once                                                                                                                                                                                            |
   | `QuantityStepper` | `--eldra-stepper-radius` (default `var(--eldra-radius-md)`)                                                                                                                                                                                                                                                                                                                                                |
   | `RadioGroup`      | `--eldra-radio-card-border-width` (default `1px`) and `--eldra-radio-card-radius` (default `radius-md`) for the card boundary; `--eldra-checkbox-border-width`/`-invalid` for the radio circle itself, shared with `Checkbox`                                                                                                                                                                              |
   | `SearchBar`       | `--eldra-search-panel-max-height` (default `32rem`, clamped to `70vh`), `--eldra-search-text-line`, `--eldra-search-empty-line`, `--eldra-search-kbd-line`, `--eldra-input-radius`, `--eldra-field-border-width`, `--eldra-z-popover`, and `--eldra-popover-origin`/`--eldra-popover-slide` (set by the panel itself from the placement it resolved to)                                                    |
   | `Select`          | `--eldra-select-panel-max-height` (default `20rem`), `--eldra-select-panel-max-width` (default `22rem`, clamped to `90vw`), `--eldra-z-popover` (default `30`), `--eldra-field-radius`, `--eldra-field-border-width`, `--eldra-select-group-tracking`, `--eldra-select-option-line`, `--eldra-select-swatch-edge`, the `--eldra-select-match-*` trio, and `--eldra-popover-origin`/`--eldra-popover-slide` |
   | `Switch`          | `--eldra-switch-radius` (default `var(--eldra-radius-full)`), `--eldra-switch-track-border-width` (default `1.5px`), `--eldra-switch-thumb-offset` (default `0.1875rem`, the thumb's rest inset from the track's start edge)                                                                                                                                                                               |
   | `Textarea`        | `--eldra-textarea-radius` (default `var(--eldra-radius-md)`), `--eldra-textarea-min-height` (set from the `minHeight` prop, default `5rem`), `--eldra-counter-line-height` (default `1.5`)                                                                                                                                                                                                                 |

   A component not listed here reads only the shared tokens from layer 1.

3. **A `classes` prop**, typed `Partial<Record<Part, string>>` where `Part` is the union of that
   component's `data-part` names from the design spec's anatomy (`container`, `label`,
   `leadingIcon`, `trailingIcon`, `spinner` for `Button`; see each component's exported
   `<Name>Part` type and its Storybook docs page for the exact list). Values merge onto that part's
   own classes with `tailwind-merge` (via this package's own `cx`, also exported for a consumer
   composing a wrapper the same way), so `classes.root: 'rounded-full'` replaces
   `eldra-button-radius` instead of landing beside it.
4. **A slot for every part that holds content** (`label`, `description`, `error`, `leading`,
   `trailing`, `empty`, `header`, `footer`, `item`, …), named after the part it replaces.
5. **`as`**, on the components whose spec allows a different rendered element (`Button`, `Link`,
   and the display/layout components landing in the next sub-project). `Button` and the future card
   components render an `<a>` automatically when `href` is set, without needing `as` for that case.

## Messages

Text a component renders itself — "Close", "Clear", "No matches for…", pagination labels — comes
from a `messages` prop merged over English defaults, never from an i18n library:

```ts
import { provideEldraUiMessages } from '@eldrajs/ui';

provideEldraUiMessages({ close: 'Loka' }); // during setup(); sets it for everything below
```

`app.provide(MESSAGES_KEY, messages)` does the same app-wide, from outside a `setup()` scope.
Precedence, low to high: the English defaults (`enUS` / `defaultMessages`), whatever an ancestor
provided through `provideEldraUiMessages`/`MESSAGES_KEY`, then a component's own `messages` prop.

`@eldrajs/ui/messages/is-IS` ships the complete Icelandic set as its own entry point, so an
English-only store never bundles it:

```ts
import { MESSAGES_KEY } from '@eldrajs/ui';
import { isIS } from '@eldrajs/ui/messages/is-IS';

app.provide(MESSAGES_KEY, isIS);
```

## Composables

Exported from the package root — the same building blocks `Select`, `MultiSelect`, `SearchBar` and
every other stateful component here are built on, not a separate public API layered over private
internals, so a consumer building a control this package does not ship yet (a menu, a combobox with
its own shape) reuses exactly what those components use. `useControllableModel` is the model every
stateful component here uses; `useFloating`, `useOverlay` and `usePopover` are the parts of a
**non-modal popup** — a select panel, a search results panel, a menu — that are easy to get wrong.
Neither `useOverlay` nor `usePopover` traps focus: the design spec's non-negotiables reserve
`<dialog>` and focus traps for modal surfaces, and say these popups are not dialogs.

```ts
import { useFloating, useOverlay } from '@eldrajs/ui';

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

// Closing and focus. Listens on `document` only while `open` is true.
const { close, focusFirst, focusables } = useOverlay({
  open,
  trigger,
  content: panel,
  setOpen: (next) => (open.value = next),
  // closeOnOutsideClick: true,  // an outside `pointerdown`, or focus landing outside
  // closeOnEscape: true,        // `Escape`, consumed so an enclosing <dialog> does not also close
  // returnFocus: true,          // back to the trigger, but never off what the user just clicked
});

// Position. `@floating-ui/vue` with `autoUpdate`, kept current while both elements are mounted.
const { styles, placement, update } = useFloating(trigger, panel, {
  placement: 'auto', // 'auto' = below, flipping above when it does not fit; 'above' never flips
  offset: 4, // the gap in pixels
  matchWidth: true, // adds `minWidth` equal to the trigger's
});
```

`useListbox` is another: the keyboard and the active row of a listbox popup, which `Select` and
`MultiSelect` share. It owns no DOM — `activeId` is what you bind to `aria-activedescendant` on
whichever element holds focus (the trigger, or the search field when there is one) — and everything
that differs between a single and a multiple select is a callback.

```ts
import { useListbox } from '@eldrajs/ui';

const listbox = useListbox({
  options: () => visibleOptions.value, // already filtered, in DOM order
  isOpen: () => open.value,
  searchable: () => searchable.value, // a search field owns Home/End, Space and printable keys
  canOpen: () => !disabled && !readonly, // a control that cannot open must not swallow the keys
  optionId: (value) => `${id.value}-o${indexOf(value)}`,
  open: (edge) => openPanel(edge), // 'end' is ArrowUp on a closed, non-searchable trigger
  close: () => closePanel(),
  select: (option) => choose(option), // closing afterwards is yours to decide
  clear: () => clearValue(), // Backspace/Delete; return true if something was cleared
  startQuery: (character) => setQuery(character),
  escape: () => clearQuery(), // return true to consume Escape instead of closing
});
```

`onKeydown` is the whole of the design spec's two Select keyboard tables: arrow movement that skips
disabled and filtered-out rows and stops at the ends, `PageUp`/`PageDown` by ten, `Home`/`End`,
`Alt+ArrowUp`, `Escape` clearing a query before it closes, `Tab` closing without preventing focus
from moving on, and type-ahead with a 0.6s buffer that ignores case and diacritics (`normalizeText`
is exported for the same folding in a search filter).

`styles` is a plain object for `:style` — `position`, `top`, `left`, and `minWidth` under
`matchWidth` — not a transform, so the panel keeps `transform` for its own open animation.
`matchWidth` is a _floor_, never a fixed width: the spec's popover "min width = trigger, grows to
fit its content up to min(22rem, 90vw)", and that upper clamp is the panel's own `max-width`
(`eldra-select-panel-width`, over `--eldra-select-panel-max-width`), not this composable's.
`placement` is the placement actually used, after flipping.

`focusables()` is the tab sequence inside the content, so an element the platform keeps out of it —
`tabindex="-1"`, `disabled`, `aria-hidden="true"`, anything under `[hidden]` — is not in the list
even when it is programmatically focusable.

Two things `useOverlay` deliberately does not do:

- **A panel rendered through a `<Teleport>` is only recognised if it says so.** Give it
  `data-eldra-overlay-owner="<the content element's id>"`; without that, a press inside it reads as
  a press outside and closes the popup.
- **"Only one open at a time" is the consumer's.** `Escape` is consumed with `preventDefault()` and
  `stopPropagation()`, which is enough to keep an enclosing native `<dialog>` from closing behind
  the popup — but `stopPropagation()` at `document` does not stop other listeners already on
  `document`, and nothing here knows about other overlays. Opening one select closing any other is
  a registry the consumer keeps (`src/components/select/openRegistry.ts` is this package's).

`usePopover` is that registry, wired up: the one composable this package's own non-modal popups
(`Select`, `MultiSelect`, `SearchBar`'s results panel) actually build on, exported from the root for
a consumer whose control needs the same five things rather than reassembling them from
`useFloating`/`useOverlay` by hand:

- **the registry** — opening claims a module-level "only one open at a time" slot (via a stable
  per-instance handle) and closes whatever held it;
- **`useOverlay`** — the outside-press/focus-leaves/`Escape` closing rules, non-modal, so nothing
  traps focus and `Tab` always moves on;
- **`useFloating`** — positioning, plus the `--eldra-popover-origin`/`--eldra-popover-slide` pair
  the entrance keyframes read, so a panel that flips after floating-ui measures changes a custom
  property rather than its `animation-name` (which would replay the entrance);
- **the open sequence** — `open(activate?)` opens, runs `activate` (make a row active), then —
  only when the call actually changed the state — runs `afterOpen` a tick later, which is where
  focus moves into the panel; `close(returnFocus?)` closes and returns focus to the trigger unless
  told not to;
- **the label-forwarded-click latch** — a `<label for>` naming the trigger forwards its click to
  it, and the spec is explicit that clicking a field's label focuses the control **without**
  opening it. A forwarded click is indistinguishable from a real one except that no pointer was
  pressed and its `detail` is 0 (the same shape as a programmatic `element.click()`), so
  `onTriggerPointerDown`/`onTriggerClick` (bound to the trigger) arm a latch on `pointerdown` and
  release it on whichever `pointerup`/`pointercancel` follows, wherever it lands.

What stays with each control is what actually differs: which rows there are, what choosing one
does, and which element the popup is anchored to. See `src/components/select/usePopover.ts` for
the full option/return shape (`UsePopoverOptions`, `UsePopoverReturn`, also exported).

## Resolver

`@eldrajs/ui/resolver` is a plain
[`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components) resolver:

```ts
// vite.config.ts
import Components from 'unplugin-vue-components/vite';
import { EldraUiResolver } from '@eldrajs/ui/resolver';

export default defineConfig({
  plugins: [Components({ resolvers: [EldraUiResolver()] })],
});
```

A template can then write `<EldraButton>`, `<EldraSelect>`, and so on, with no explicit import —
the plugin auto-imports `{ Button }` (etc.) from `@eldrajs/ui` the first time it sees the tag; the
components are never globally registered. The default prefix is `'Eldra'`:

```ts
EldraUiResolver({ prefix: 'Acme' }); // <AcmeButton> instead
```

`EldraUiResolver(...).resolve(name)` returns `{ name, from: '@eldrajs/ui' }` for every component
`src/index.ts` exports under `<prefix><Name>`, and `undefined` for anything else — including a
`Ui`-prefixed tag. `Ui` is never the resolver's default prefix: that prefix belongs to the private
Eldra library and its own resolver. Pass `{ prefix: 'Ui' }` yourself if a consumer genuinely wants
that name — the package itself never implies it.

## `./vee-validate`

`@eldrajs/ui/vee-validate` — `Form` and ten `Field*` components (`FieldInput`, `FieldTextarea`,
`FieldCheckbox`, `FieldRadioGroup`, `FieldSwitch`, `FieldSelect`, `FieldMultiSelect`,
`FieldQuantityStepper`, `FieldVariantPicker`, `FieldSearchBar`) wiring each agnostic component's
`modelValue`/`error`/`invalid`/`@blur` onto vee-validate's `useField`, plus a `Form` wrapping
`useForm` and providing an `apiErrors` map for server-side field errors. Optional peer:
`vee-validate ^4.12`; nothing else in this package imports it. Lands with the `./vee-validate`
entry — the export map slot exists today (`packages/ui/src/vee-validate/index.ts`), the components
themselves are the next task in this plan.

## Accessibility and testing

Every component in this package ships, as part of being done, not as an add-on:

- **Zero `axe` violations** (`vitest-axe`, the `region` rule disabled to match the starter) against
  every state the spec's states table lists for that component.
- **A keyboard test for every row of the spec's keyboard table** — focus movement, `aria-*` state
  and emitted events, exercised with `@vue/test-utils`' `trigger('keydown', …)`, not just a
  mouse-click assertion.
- **A Storybook story per state**, titled with the spec's own state names ("Loading", "Sold out",
  "Long content", "Narrow container", "Reduced motion", "Forced colours" — the last two via
  emulated media in the story parameters), in `packages/ui/.storybook`
  (`@storybook/vue3-vite`). Run it locally with `pnpm --filter @eldrajs/ui storybook`.
- **A screenshot regression harness**: `scripts/screenshots.mjs` captures every story at 1280 and
  360px with Playwright and compares against committed baselines in `packages/ui/__screenshots__`
  (pixelmatch, 0.1% threshold). `pnpm --filter @eldrajs/ui screenshots --update` refreshes them
  after an intentional visual change.

The design spec's own five-step testing protocol is the definition of done per component:

1. Run an automated accessibility checker against each state of each component. Zero violations.
2. Keyboard-only pass: reach, operate and leave every part using exactly the keys in the section's
   table.
3. Screen-reader pass on one desktop and one mobile screen reader: names, roles, states and
   announcements match the Accessibility notes.
4. Contrast: check every text and non-text pair in the states table against the ratios in the
   colour table.
5. 200% zoom and a 320px-wide viewport; reduced motion on; forced colours on.

Steps 1, 2 and 4 (contrast, verified against the token colour table) are automated as above. Steps
3 and 5 are manual — a screen reader and a real browser zoom/forced-colours pass cannot be
scripted — and are performed and recorded per component during development, outside this
repository's own history.

## Deviations

Additions and departures from the design spec, and why.

- **`Button` `text-button-{sm,md,lg}` utilities, and the `lg` font size as a per-component
  variable.** The spec's Sizes table gives `lg` a 1.0625rem font, between `body` (1rem) and
  `body-lg` (1.125rem) with no token of its own in `tokens.json`. Writing `text-[1.0625rem]` in the
  component would put a literal in a component class, which this package's own rule forbids, so
  `tailwind.css` declares the three `text-button-*` utilities instead —
  `var(--eldra-button-font-size-lg, 1.0625rem)` for the one size with no token, which also makes it
  a documented customisation point.
- **`Button` icon-only `md` does not grow to `target-touch`.** The Sizes table gives the icon-only
  row its own explicit heights ("square: width = height of its size") with no narrow-container
  growth, unlike the labelled `md` row. 2.5rem already clears the spec's 1.5rem touch-target floor,
  so nothing is lost.
- **`Button` `secondary` on an accent section gets the same 12% `currentColor` hover as
  `outline`.** The spec says the secondary button there "becomes transparent with a `currentColor`
  border" and stops; since it then _is_ an outline button in every other respect, it takes the
  outline variant's hover fill rather than no hover feedback at all.
- **No `as` prop on `Button`.** The design spec's "Customisation layers" §5 lists `as` on `Button`,
  but `Button`'s own spec section (the property table this component is built to) has no `as`, and
  the rule is "every property … it lists and nothing else". `Button` already chooses `<button>` or
  `<a>` from `href`, per the spec's own Accessibility note. Additive if wanted later; does not
  affect the frozen part names.
- **`Button` disabled link button keeps its `href`.** A disabled `<a>` that also drops `href`
  becomes a generic element and stops exposing `role="link"` — a screen reader stops naming what it
  is at the exact moment it needs to say "unavailable". `href` stays, and `aria-disabled="true"`,
  `tabindex="-1"` and a `preventDefault()` on click make it inert instead.
- **`Button` `aria-pressed`.** Never emitted on a link button (`role="link"` has no pressed state,
  and a dev warning says why). On any variant but `outline`, `pressed` still sets the attribute (a
  screen reader must hear the state) but the spec's states table gives the toggle _fill_ to
  `outline` alone — a pressed `primary`/`secondary`/`ghost`/`danger` button looks identical whether
  it is pressed or not, which is the trade-off worth knowing, not a bug.
- **`Button` touch growth is the primary action's.** "Only primary action buttons grow to
  `target-touch` (2.75rem)" below a 48rem container, so an `md` `primary` button grows and a
  secondary, outline, ghost or danger action beside it keeps the 2.5rem control height it shares
  with the inputs.
- **`Link` has no `externalIcon` prop and no `@tabler/icons-vue` runtime dependency.** The arrow and
  external-link icons are both fixed by the spec's anatomy, not swappable the way `Button`'s
  `iconLeft`/`iconRight` are, so both are inline `<svg>`s using Tabler's own published path data —
  the same shape as `Button`'s spinner — keeping `@tabler/icons-vue` a devDependency only, matching
  this package's documented runtime dependencies (no icon library among them).
- **`Link`'s `rel` is `"noopener noreferrer"`**, one step past the spec text's own `rel="noopener"`
  (every section of the spec that mentions it says just `noopener`) — the more defensive value, and
  the resolution given for this exact ambiguity when the component was built.
- **`Link`'s `as` accepts a router-link component, not only a tag name.** With `href` set and `as` a
  component (`NuxtLink`, `RouterLink`), the component receives `to` instead of `href`, matching
  those components' own prop contract; with `as` a plain string it stays a tag (or custom element)
  that still receives `href`. With no `href` at all, `as` is ignored and the component always
  renders a plain `<span>` — there is no destination to route through.
- **`Input`'s mobile 1rem override applies to `md` only.** The shared "Actions and forms" rule
  states it without qualification, but the spec's own Sizes table marks it only on the `md` row
  (`sm` stays 0.875rem, `lg` is already 1rem) — the more specific statement wins. Consequence worth
  knowing: an `sm` `Input` still zooms on focus on iOS, because 0.875rem is under the 16px browsers
  use as the no-zoom threshold.
- **`Input`'s clear button is 1.5rem on `sm`, not the spec's 2rem.** The spec fixes the trailing
  action's size in the `md` row only ("2rem square at 0.25rem"); a 2rem button does not fit a 2rem
  `sm` field with a 0.25rem inset, so `sm` uses 1.5rem — still above the 2.5.8 touch-target minimum
  — with matching end padding. `md` and `lg` keep the spec's 2rem.
- **`Input`'s `suffix` slot and the clear button share one end-anchored row**, `data-part="suffix"`,
  rather than two independently positioned elements. This keeps both on one row at any size and
  gives the keyboard table's "`Tab` reaches the clear button next" order for free, since the row
  follows the input in DOM order. One rough edge: the input's end padding is the spec's 2.5rem
  whether one trailing item or two is present, so a wide `suffix` plus the clear button can let a
  long value run underneath — measuring the slot would need JavaScript and is not in the spec.
- **`Input`'s `clearable`/`invalid`/`required`/`describedBy` default to `undefined`, not `false`.**
  They fall back to a `FieldWrapper`'s context when there is one, and `false` there would be an
  answer rather than "no opinion". `readonly` and `disabled` have no context source and default to
  `false` as usual. The clear button is additionally hidden on a disabled or read-only field.
- **`Textarea` has no `help`/slot forwarding into a `FieldWrapper`'s foot row.** `FieldWrapper` owns
  its _own_, independent `foot`/`counter` parts (see its Deviation below); `Textarea`'s own
  `foot`/`counter` exist purely for standalone use, matching `Input`'s precedent of being fully
  functional without a wrapper. A consumer composing `FieldWrapper` + `Textarea` uses one counter or
  the other, never both.
- **`Textarea`'s `hardLimit` sets native `maxlength` only when `hardLimit` is true**, never merely
  because `maxLength` is present — `counter` and `hardLimit` are independent props, and the spec's
  documented default lets typing continue past a soft `counter` limit.
- **`FormLayout` `statusMessage` and its status region.** The spec's Form layout States table ends
  with "Success: replace the form with a confirmation message (newsletter) or navigate (checkout),
  **and announce it in a polite live region**", and its acceptance criteria repeat it — but the
  properties table has nothing to announce _with_. So `FormLayout` always renders a visually hidden
  `role="status"` / `aria-live="polite"` paragraph (`data-part="status"`), fed by a
  `statusMessage?: string` prop. Always in the DOM, because a live region added to the page at the
  same moment as its text is not reliably announced; empty until there is something to say. The
  _visible_ confirmation is still the page's job.
- **`FormLayout` `headingLevel`.** The spec calls the form's heading "h4 style", which names the
  type style (1.125rem, 600), not the outline level. The element is an `<h2>` by default — the
  level a form's own title takes under a page's `<h1>` — and `headingLevel?: 2 | 3 | 4` lets a form
  nested under a page's own `<h3>` avoid skipping a level. The type style never changes.
- **`FieldWrapper` `aria-describedby` order.** The spec writes
  `aria-describedby="<error-id> <help-id> <counter-id>"`; only the ids that actually render are
  emitted, so a field with no help never points at an element that is not there.
- **`FieldWrapper` slots are content.** `<template #error>` and `<template #help>` are richer ways
  of writing the `error` and `help` props (a message with a link in it, say), so a field with an
  `error` _slot_ is invalid and linked exactly as one with the prop is.
- **`Checkbox` `describedBy`.** The spec's Checkbox property table has no way to point at an
  error, but its Accessibility notes require one ("Required consent: `required`,
  `aria-invalid="true"` and `aria-describedby` pointing to an error that says what to do"). So
  `Checkbox` takes `describedBy?: string`, exactly as `Input` and `Textarea` do, and falls back to
  a `FieldWrapper`'s context when there is one.
- **`Checkbox`'s hint is part of the accessible name.** The spec's anatomy puts the hint "inside
  the label", and a `<label>`'s whole text is the control's name — so a box with a hint is
  announced as "Washed linen Pre-softened, will not shrink further". That is the spec's own
  structure, kept rather than swapped for an `aria-describedby` that would read the same words a
  beat later. It is also what makes the hint part of the click target.
- **`CheckboxGroup`'s error is the group's, not each option's.** `error` puts `aria-invalid="true"`
  and the `aria-describedby` link on the `<fieldset>`; the individual boxes keep their ordinary
  boundary. The spec's own 2px `danger` box is written against the **required consent** case (a
  single `Checkbox` with `invalid`), and repeating "invalid" on every one of five options is noise
  rather than information. This matches `FieldWrapper`'s `group` variant, which reads the same way.
- **A `Checkbox` inside a `FieldWrapper` drops its own `<label>`.** A `Checkbox` is normally a
  `<label>` wrapping its box and text, which is what makes the whole row the click target. A plain
  `FieldWrapper` renders a `<label for>` naming the same control, and one control with two labels
  is `form-field-multiple-labels` and an accessible name assembled out of both — so the box reads
  `FieldContext.labelsControl` and renders a `<span>` root instead, letting the wrapper's label
  name it. The drawn box stays clickable because the control covers it rather than being `sr-only`
  in a corner of it. A box with an `id` of its own keeps its label either way: the wrapper's `for`
  can no longer reach it.
- **The spec's "Single consent" variant is `<FieldWrapper group>`.** The consent sentence belongs
  _beside_ the box, as its own label — so the wrapper must not be the thing labelling it. `group`
  gives a `<fieldset>` named by a `<legend>`, which labels nothing in particular, and contributes
  the error row and the `aria-describedby`/`aria-invalid` wiring. A control inside a group also
  leaves the context `id` alone, because that id is the fieldset's own.
- **A `CheckboxGroup` is not put inside a `FieldWrapper` at all.** It draws its own `<fieldset>`
  and `<legend>` — the spec's group anatomy — so a `FieldWrapper` with `group` set around it nests
  a second fieldset and legend around the first. Use the group on its own.
- **An invalid box that is checked keeps its `primary` fill.** The spec's States table gives the
  error row a `background` fill, but that row describes the _unchecked_ required-consent box. The
  mark is `primary-contrast`, so keeping `background` under a tick would draw the tick in the
  page's own colour and lose it — and "checked differs by fill and tick shape, not only colour"
  has to stay true in every state. An invalid marked box is `primary` fill plus the 2px `danger`
  boundary.
- **`RadioGroup`'s error reaches the radios, unlike `CheckboxGroup`'s.** The spec's Radio group
  property table says `error` "sets `aria-invalid="true"` on the radios" (plural) — unlike
  `CheckboxGroup`, whose own error stays on the `<fieldset>` alone (see the `CheckboxGroup`
  deviation above). Both are followed as written: `RadioGroup`'s `aria-describedby` still links the
  fieldset to the message, and `aria-invalid` is additionally set on every radio.
- **`RadioGroup`'s `size` is plain-layout only.** The spec's own property table scopes it: "Radio
  1.125rem or 1.5rem (**plain layouts**)". A card's radio is always the `md` circle, whichever size
  the caller asked for.
- **The radio circle reuses `Checkbox`'s border-width utilities.** The spec gives it the identical
  numbers (1.5px, 2px in error) as the Checkbox box, so `eldra-checkbox-border`/`-invalid` are
  shared rather than duplicated as `eldra-radio-*`. The **card** itself is a different element with
  its own 1px number, so it gets `eldra-radio-card-border` of its own.
- **A card's selected boundary is a real border plus an inset line**, the same technique
  `eldra-field-invalid` uses for a field's error state: the spec spells it out ("2px `primary` (1px
  border + 1px inset line)"), so growing the real border to 2px — which would shift the card's
  neighbours — is not what it asks for. `eldra-radio-card-selected` reads
  `--eldra-radio-card-selected-color` so the same utility draws the `danger` version too, for a
  selected option that is also in the group's error (no dedicated spec row; read the same way an
  invalid checked `Checkbox` is — see that deviation above).
- **`RadioGroup`'s `label`, `hint` and `meta` are scoped slots as well as `option` fields**
  (`#label="{ option }"`, and so on), since the group is built from a data array rather than
  written-out children — richer content than plain text needs somewhere to go.
- **`Switch` inside a `FieldWrapper`.** The spec never discusses a Switch inside a field wrapper at
  all (a Switch commits immediately; it is not submitted with a form), but the task named this
  wiring explicitly. It mirrors `Checkbox`'s `labelsControl`: a plain wrapper's `<label for>` names
  the button, so the switch drops its own `label` part and takes the wrapper's id. Unlike
  `Checkbox`, the root element never changes tag — it is always the `<button>` — only the inner
  label `<span>` is skipped, so the wrapper's visible text is not rendered twice.
- **`Switch`'s description is `aria-hidden` inside the button, not a sibling.** The spec's anatomy
  diagram draws the description on its own line below the track, with an arrow to
  "`← description (aria-describedby)`", and its numbered list says the button holds "the track and
  the label" — label only. So the description renders inside the button's own content (which is
  what lets a two-column CSS grid, the same shape `Checkbox` uses, put it directly under the label
  for free) but is marked `aria-hidden="true"`, keeping it out of the button's accessible _name_
  while `aria-describedby` still exposes it as the _description_ — browsers read an
  `aria-describedby` target regardless of `aria-hidden` on that target, the standard technique for
  a description that must not double as the name.
- **`Switch`'s hidden mirror `<input type="checkbox">` cannot live inside the button.** `<button>`'s
  content model forbids interactive descendants, and an `<input>` is interactive content
  regardless of the `hidden` attribute (that attribute doesn't change what category an element
  belongs to). So the component's template has two top-level nodes — the button and the hidden
  input as its sibling — a plain Vue 3 fragment, not a new wrapping element.
- **`Switch`'s track and thumb each carry their own transition.** The spec's Behaviour & motion
  section asks for both: "The thumb slides _and the track fills_ over `duration-fast` with
  `ease-out`." Neither element carries `eldra-focus` (that sits on the button), so — exactly like
  Link's arrow — each may carry its own `transition-*`/`duration-fast` utility with a
  `motion-reduce:transition-none` fallback.
- **`Select` is `modelValue`, not `value`.** The spec's property table names the two-way value
  `value`; every other control in this package takes `modelValue` with `update:modelValue`, which
  is what `v-model` binds, so `Select` matches them. The spec's own `change` and `clear` events are
  emitted exactly as written, alongside `open`, `close` and `search`.
- **`Select`'s `optionIcon` part.** The spec's anatomy numbers the parts and then describes an
  option's contents in prose ("swatch, icon, label + hint, meta, check"), so the icon has no
  numbered name. It is a part all the same, and the _trigger_ reuses `optionSwatch` and
  `optionIcon` for the chosen option's mark — "an option's swatch" is styled once wherever it
  appears, rather than once in the list and again in the trigger.
- **`Select`'s empty state is a sibling of the listbox, not a child.** A `role="listbox"` may own
  only `option` and `group` children, so "No matches for “…”" inside one is an
  `aria-required-children` violation. The listbox itself still renders when nothing matches (an
  empty one is merely "needs review"), because `aria-controls` is a _required_ property of
  `role="combobox"` and needs something real to point at while the popup is showing. The trigger
  carries `aria-controls` when it is closed too, as ARIA 1.2 asks; axe treats a collapsed
  combobox's reference to a not-yet-rendered popup as "needs review", not a violation.
- **`Select`'s option rows carry a forced-colours boundary.** The spec draws the active row as a
  `surface-strong` fill and the selected row as weight 600 plus a check. Forced-colours mode
  replaces every fill and flattens the weight, so the two utilities `eldra-select-option-active`
  (a 2px `Highlight` inset outline) and `eldra-select-option-selected` (a 1px `CanvasText` one)
  apply _only_ there. On a row that is both, the active outline wins — selection is still carried
  by the check mark beside it.
- **`Select`'s `noMatchesFor` message.** The spec asks for the empty state to read
  "No matches for “teal”" — the query is part of the string — and the message catalogue had only
  `noResults`. Both are used: `noResults` with no query, `noMatchesFor(query)` with one.
- **`Select`'s clear button is named `aria-label` + `aria-labelledby`.** The spec wants
  "Clear Country", and the component does not know the label's text — only its id. So the button
  carries `aria-label="Clear"` and, inside a `FieldWrapper`, an `aria-labelledby` of
  `"<its own id> <the label's id>"`, which the platform resolves to "Clear Country". On its own it
  keeps the plain `aria-label`.
- **`Select` distinguishes a label's forwarded click from a real one.** "Clicking the Field
  wrapper's label focuses the trigger (it doesn't open it)" — but a `<label for>` naming a
  `<button>` forwards its click to it, and a forwarded click is otherwise indistinguishable from a
  real one. The trigger therefore opens only for a click with a pointer press behind it (or a
  non-zero `detail`) — a press that ends anywhere but the trigger releases the latch, so a drag off
  the control cannot arm the next click — and focuses without opening otherwise. The cost: a programmatic
  `element.click()` focuses rather than opens. Keyboard activation never goes through a click at
  all, because `useListbox` consumes `Enter` and `Space` itself.
- **`Select`'s `disabled` is the native `disabled` attribute.** The spec writes the state as
  `tabindex="-1"` plus `aria-disabled="true"`; a real `<button disabled>` is already unfocusable
  and inert, so the component uses it and adds `aria-disabled="true"` beside it rather than
  hand-rolling the tab behaviour.
- **`Select`'s `required` reaches the hidden native `<select>`, as the spec asks.** That is what
  makes the placeholder "invalid on submit if required" without scripting. Be aware of the
  consequence in a browser: a `hidden` control that fails constraint validation cannot be focused
  to report the problem, so the form is blocked and the browser logs it rather than showing a
  bubble. Pair it with the `FieldWrapper`'s own `error` for a visible message.
- **`Select`'s `placement` is read once.** `useFloating`'s options are not reactive (see
  [Composables](#composables)), so a select that has to change placement at runtime needs a `:key`
  change. It is a layout decision — "the footer's selectors use `above`" — not state.
- **`Select`'s panel is rendered in place, never teleported.** It is positioned absolutely inside
  the component's own root, so `data-part` and `classes` selectors reach it and it inherits the
  section it sits in. The spec's own "Don't place a select inside a container that clips overflow"
  is the trade-off that buys.
- **`MultiSelect`'s parts include the footer's.** The brief's part list stops at the tags; the
  spec's anatomy draws a footer ("live count · Clear (link button) · Done (primary sm)") and its
  acceptance criteria test it, so `footer`, `footerCount`, `footerClear` and `footerDone` are parts
  as well. `optionCheck` is reused for an option's **checkbox** — it is the mark that says a row is
  chosen in both controls, so a consumer styles it once — and the footer's two buttons are real
  `Button`s whose `data-part` is the multi-select's rather than `Button`'s own `container`.
- **`MultiSelect`'s placeholder default is the spec's `"Any"`** (`is-IS`: `"Allt"`), not
  `"Select options"`. New messages with it: `selected` ("Selected", which names the tag list beside
  the field's own label), `selectedCount(n)` ("4 selected"), `noneSelected` and `done`.
- **`MultiSelect`'s clear button belongs to the popover while it is open.** The spec's Tab table
  walks "from the search field (or the trigger) to the footer's Clear, then Done, with the popover
  still open", and the trigger's own clear button sits between the trigger and the panel in the tab
  order. It therefore carries `data-eldra-overlay-owner="<the panel's id>"`, which is how
  `useOverlay` already recognises a part of an overlay that is not inside its content element, so
  tabbing through it does not close the popover. `Tab` itself is never consumed: focus landing
  outside the control is what closes it, which is also what closes it past Done.
- **`Backspace` in a `MultiSelect`'s empty search field removes the last tag.** Not in the spec's
  keyboard table — it is the convention every chip input follows — and it is guarded on the query
  being empty, so it never eats a character the user meant to delete.
- **A `MultiSelect` value with no option of its own is dropped** from the summary, the tags, the
  count and the hidden native select. It has no label to show and a `<select>` cannot hold it, so
  showing a count that includes it would make the trigger disagree with the tags underneath it.
- **A disabled or read-only `MultiSelect` keeps its tags and drops their remove buttons.** The
  spec's States table ends a disabled control's row with "clear button hidden", and a read-only one
  is "the value is readable but fixed" — the tag list _is_ the value made readable, so it stays in
  both states while the control that would change it goes, exactly as the trigger's clear button
  already does. Hidden rather than `disabled`: a disabled button stays in the accessibility tree
  announcing a "Remove Sweaters" action that can never happen.
- **`MultiSelect`'s `classes.value` and `classes.native` do nothing.** `value` is a `Select`'s
  chosen-option row; a multi-select draws `summary` (the labels and the "+N" pill) in its place.
  `native` marks the hidden native `<select>` with a `data-part` so a test or a form helper can
  find it, but the element is `hidden` in both controls, so there is nothing for a class to do.
  Both names stay in the part union so one `classes` object can be handed to either control.
- **`MultiSelect`'s `value` slot takes `{ options }`** (the chosen ones, in the order they were
  chosen) and fills the `summary` part, and the `tag` slot takes `{ option }` and replaces a chip's
  **label**, leaving its remove button in place — a consumer restyling a chip should not have to
  rebuild the control that empties it.
- **`QuantityStepper`'s field is `type="text"`, not the spec anatomy's literal
  `<input type="number">`.** A native number input's DOM value can only ever be the US-style,
  ungrouped floating-point grammar (digits and a single `.`); it cannot hold a locale-grouped
  string like `is-IS`'s `"1.234"` (`.` as the group separator) — assigning one is either silently
  rejected by the browser's value-sanitisation algorithm or misread as the decimal `1.234`. The
  task brief explicitly asks this control to parse a typed value with `parseLocaleNumber`, which
  only makes sense for text the browser has not already mangled. `inputmode="numeric"` and
  `role="spinbutton"` with `aria-valuenow`/`-valuemin`/`-valuemax` (the ARIA APG's own pattern for
  this shape of control) satisfy the spec's 4.1.2 note ("The input exposes its value, min and max
  natively") through the accessibility tree instead. "No native spin buttons" (the anatomy's own
  item 3) is satisfied for free: a text input has none to hide.
- **`QuantityStepper`'s live region announces its own value, not a cart subtotal.** The spec's
  exact sentence ("Cart updates are announced in a polite live region near the cart total ...
  'Quantity updated, subtotal $112.00'") names a subtotal a single, reusable control has no access
  to — that announcement belongs to whatever composes this control with a cart total. What this
  component owns and announces once per settled change (never per keystroke) is its own value,
  via the new `quantityUpdated(n)` message.
- **`QuantityStepper`'s group has one perimeter border, not one per part.** The spec's ASCII
  anatomy draws `┬`/`┴` between the three parts; the reference image shows one continuous
  boundary, so this is diagram notation, not a drawn divider. `overflow-hidden` on the rounded
  group is what gives the two outer corners' square first/last children the "inner radius is
  `radius-md` minus 1px" look the Sizes table asks for, without a literal px.
- **`locale` is not part of the design spec's own Properties table for "Quantity stepper"** — the
  task brief adds it (default `"en-US"`) for display formatting and for parsing a typed value.
  `src/utils/number-format.ts` (`createNumberFormat`, `formatNumber`, `parseLocaleNumber`) is the
  general-purpose utility behind it, exported from the package root for use outside this control.
- **`VariantPicker`'s sold-out diagonal lines are inline SVG, not CSS-only utilities.** A first
  attempt drew them with `background-image`/`box-shadow`, which broke two ways under real
  rendering: the gradient's stripe thickness is measured along the gradient's own diagonal length,
  so a label-dependent pill width turned the spec's "1px line" into a visibly thick band, and
  `background-color`/`box-shadow` are exactly the two properties forced-colours mode empties out —
  the swatch's sold-out line was completely invisible under `forced-colors: active`. An inline
  `<svg><line stroke="currentColor" vector-effect="non-scaling-stroke"></svg>` fixes both: a
  constant screen-pixel stroke regardless of the box's aspect ratio, and a stroke remaps under
  forced colours the same way a real border does.
- **`VariantPicker`'s `, sold out` suffix is `messages.soldOut.toLowerCase()`**, not the message
  verbatim. The shared `soldOut` string is capitalised ("Sold out", used standalone e.g. as a
  badge); the spec's own inline examples are lower-case mid-sentence ("Clay, sold out"). Assumes
  `soldOut` has no interior capitals, true for `enUS` and `isIS` today; a future locale needing
  different mid-sentence casing would want its own message key instead.
- **`VariantPicker`'s `name` is used unmodified as the native radio group name**, with no generated
  fallback — unlike `RadioGroup`, which mints one with `useUiId` when absent. Here `name` is
  required and always caller-supplied, per the spec's own Properties table ("Used in the legend and
  as the radio group name"). A page rendering more than one picker sharing an option name (two
  product cards each with their own "Size") must give each its own `name`
  (`"size-<productId>"`) — this component does not namespace it.
- **`SearchBar`'s panel holds a `listbox` rather than being one.** The spec's Accessibility notes
  say "The panel is `role="listbox"` named 'Search suggestions'" — but the same section's `none`
  view puts a title and a line of advice inside that panel, above chips that _are_ options, and a
  `role="listbox"` may own only `option` and `group` children. So the popup box is
  `data-part="panel"` and the element that owns the options is `data-part="listbox"` inside it,
  which is what `aria-controls` points at (and what always renders while the panel shows: a
  `role="combobox"` must point at something real). The no-results message and the loading rows are
  its siblings. `Select` solved the same conflict the same way.
- **Four parts beyond the brief's list, all in the spec's own anatomy**: `listbox` (above), `chip`
  (anatomy item 9), `clearRecent` (the idle view's "Clear recent searches" row) and `liveRegion`
  (anatomy item 11), plus `itemArrow` for the Sizes table's "Active arrow". A part the component
  draws and a consumer cannot reach is not a part.
- **`SearchBar`'s `select` event carries `(item, type)`**, where `type` is one of the four result
  types or `"viewAll"`. The spec writes the payload as `{ type, url }` and the brief as `(item)`;
  two arguments carry both without making a consumer destructure a synthetic object, and `item`
  is the same object the `item` slot receives.
- **Articles and pages share one group.** The spec's `results` view names three groups — Products
  (max 4), Collections (max 3), Journal and help (max 3) — while `resultTypes` has four values, so
  `articles` and `pages` are drawn under one "Journal and help" heading, articles first, with three
  rows between them. `resultTypes` still filters each of the two independently.
- **A row's sub line has nowhere to come from.** The spec's reference image shows a second line
  under each title ("Knitwear · 4 colours", "Journal · 4 min read") and a `muted` meta on
  collections ("48 products"), but the `SearchResults` shape this package ships (the brief's, kept
  exactly) carries only `title`, `href` and a product's `price`. The `item` slot is how a store
  draws more; nothing was invented in the type.
- **An idle panel with nothing in it does not open.** The spec says the panel opens on focus, and
  that neither the recent nor the popular list shows when it is empty — which together would leave
  an empty box under the field. `aria-expanded` stays `false` until there is something to show.
- **The `none` view waits for a first response.** The spec's `none` view is "Query **without
  matches**" — an answer from the shop — so it is not drawn while `results` is still `undefined`,
  or a shopper typing "m" would be told there is nothing called "m" while the request for it is
  still in flight. Until the first response arrives the panel shows nothing at all; after 300ms the
  loading view takes over, exactly as the spec's own `loading` row says.
- **One search bar on a page answers `/`.** The spec says the shortcut focuses "the header search",
  singular, but every instance listens on `document`. `src/components/search-bar/shortcutOwner.ts`
  is a module-level claim queue (the same shape as the select family's `openRegistry`): the first
  instance mounted with `shortcut` on owns the key, the others stand behind it, and an unmount — or
  a `shortcut` prop turned off — hands it to the next in line. Ownership is read at keystroke time,
  so nothing has to re-render for it to change hands.
- **`resultsCount` and `viewAllResults` take the query as an optional second argument.** The spec
  names it in both sentences — "4 results for mer", "See all 12 results for “mer”" — while the same
  two messages are also used where there is no query to name (a filtered list's count, the Search
  modal's own "See all n results" row), so the query is optional rather than required: with it the
  message reads the spec's sentence, without it the plain count. One wording delta is left, because
  the catalogue is shared: the popular heading is `popularSearches` ("Popular searches", not the
  spec's "Popular right now"), which a store overrides through `messages`. New messages beside
  them: `noResultsFor(query)`, `searchSuggestions`, `searchProducts`, `searchCollections`,
  `searchJournal` and `searchAdvice`; `clearRecent` is now the spec's own "Clear recent searches"
  and `viewAllResults` its "See all", which `is-IS` already said.
- **`SearchBar` writes the recent-search history itself** when `recent` is not given: on submit and
  on a followed row (not on every keystroke), most recent first, deduplicated without regard to
  case, capped at 5, and wrapped so a storage that refuses leaves the list in memory for that page
  only. A consumer that supplies `recent` owns the storage behind it and has `submit`/`select` to
  write from; nothing is written over their list.
- **The `/` hint carries `messages.shortcutHint` as its `title`.** The visible chip is the spec's
  bare `/` and is `aria-hidden`, so the full sentence ("Press / to search") has nowhere to be
  announced; it is the chip's tooltip, and the field carries `aria-keyshortcuts="/"`.
- **A row's active arrow is not animated.** The spec's Sizes table only says "visible only on the
  active row"; the package's own Motion conventions give hover/colour changes `duration-fast`, and
  other components carry their own `transition-*` for a similarly momentary reveal (Link's arrow,
  Switch's thumb and track) — but here `itemArrow` is a plain `v-if="isActive(row)"`, so the arrow
  appears and disappears with the row's active state, not a fade. Nothing in the spec's own text
  for this component asks for a transition; additive if wanted.
- **`SearchBar`'s results panel shares the select family's "only one open at a time" registry.**
  It opens through `usePopover` (see [Composables](#composables)), the same composable `Select` and
  `MultiSelect` use, so opening a search bar's panel closes an open select's panel and vice versa —
  not only another search bar's. The spec discusses this only within the Select family; extending
  the one registry to `SearchBar` was a judgement call for a page that can show both at once,
  rather than a second, uncoordinated registry.
