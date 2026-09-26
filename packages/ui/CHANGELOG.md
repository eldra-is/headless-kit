# @eldrajs/ui changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- **`Popover`** — an operator addition beyond design spec 1 (plan 3 task 5), for the private
  component library's own `Popover`/`Dropdown`: a generic non-modal trigger + floating panel for
  menus, filters and dropdowns, built on `usePopover` (`Select`/`MultiSelect`/`SearchBar`'s own
  shared machinery — the "only one open at a time" registry, `useOverlay`'s closing rules,
  `useFloating`'s positioning, the teleport, the pointer latch), one level more generic: it draws no
  listbox of its own and joins the same registry, so opening it closes an open `Select` and vice
  versa. Parts `root` (a `display: contents` wrapper), `trigger` (not drawn — the consumer's own
  element, wired through a scoped slot: `{ open, toggle, attrs }`, `attrs` carrying `id`, `type:
  'button'`, `aria-haspopup`, `aria-expanded`, `aria-controls` and the click/pointerdown pair for
  `v-bind="attrs"`, mirroring the private library's own `#trigger="{ triggerAttrs }"` shape) and
  `panel` (the floating box, teleported and positioned exactly like `Select`'s). The panel carries no
  default `role` — a consumer's own fallthrough attrs (`inheritAttrs: false`) land on it directly
  (`<Popover role="menu">`), and `ariaLabel` sets its `aria-label`. `tabRedirect` is always on;
  opening moves no focus into the panel (the private library's own `focusOnOpen: false` default).
  `modelValue` (two-way), `placement` (`useFloating`'s own vocabulary), `matchWidth`, `teleport`
  (`boolean` only — no custom-selector target for this addition). `README.md` gained the `Popover`
  Customisation row and an Additions entry; `docs/ui.md`'s "Navigation, overlays and feedback" list
  gained a `Popover` bullet (and lost a stray duplicate heading line left over from an earlier
  merge).
- **`Pagination` and `LoadMore` — Task 9 of the "overlays, navigation, feedback" sub-project.**
  - `Pagination`: numbered links (previous/next, page numbers collapsing to "…" past `siblings`
    pages on each side of the current one, first and last always shown) with a compact "Page 2 of
    12" alternative, switched by a `@container` query on the pagination's own root — not the
    viewport — from 48rem of its own width; `compact` forces the compact form regardless of width.
    Renders nothing at all with one page or fewer. With `hrefForPage` (page → URL), every control
    is a real `<a href>` (`rel="prev"`/`rel="next"` on the ends, `linkAs` for a router component,
    the same contract `Link`'s own `as` uses — named `linkAs` rather than `as` because this
    component's root is spec-fixed, the same reason `ContentCard`/`FeatureCard`/`ProductCard`'s
    own title-link prop is `linkAs`); without it, the controls are `<button type="button">`s that
    emit `update:page` instead. Parts: `root`, `list`, `item`, `page`, `current`, `ellipsis`,
    `prev`, `next`.
  - `LoadMore`: a live "Showing 24 of 96 products" status (`role="status" aria-live="polite"`), a
    decorative progress meter, and an outline button that hides once `shown` reaches `total`,
    stays clickable and shows a spinner while `pending` (the same "still clickable, the action is
    already under way" rule `Button`'s own `loading` state follows), and is `aria-describedby` the
    status. Emits `load`. Parts: `root`, `status`, `button`.
  - New messages: `pagination`, `previousPage`, `nextPage`, `pageN(n, current?)`,
    `pageOfTotal(page, total)`, `showingOf(shown, total, noun)`, `loadMore` — in both `en-US` and
    `is-IS`.
- **Final whole-branch review fixes for the "display, commerce and layout" sub-project.**
  - `formatDate` (`src/utils/date.ts`) never throws now: a malformed, empty or calendar-invalid
    date (`'2026-02-30'`) returns `null` instead of an Invalid Date/`RangeError`, and `ContentCard`
    renders no `<time>` at all for one rather than a fabricated `"Jan 1, 1900"`.
  - `Skeleton` gained a `busyLabel?: string | null` prop (spec :3340): with one given, the root is a
    named live busy region (`role="status"`, `aria-busy="true"`, `aria-label`, every shape
    individually `aria-hidden`); without it the root stays plain `aria-hidden`, as before.
    `ContentCard`'s own loading state is now a named `role="group"` region too, matching
    `ProductCard`'s existing treatment.
  - Removed every internal SDD planning-artifact reference (numbered task/fix filenames and their
    review reports, and the private planning repo's own directory path) from shipped files,
    including one that named a full private-repo path in
    `examples/starter-nuxt/app/components/ui/UiImage.vue`. `src/__tests__/publicRepoHygiene.spec.ts`
    now fails on any of those patterns in `src/`, `README.md`, `CHANGELOG.md` and the starter's
    `app`/`blocks` directories.
  - `ContentCard`/`FeatureCard`/`ProductCard`'s title-link prop is now **`linkAs`**, not `as` — the
    card's own root is spec-fixed, so `as` was ambiguous with `Badge`/`Container`/`Section`'s `as`,
    which picks the root tag itself. Breaking, pre-release.
  - `Section.label` and `ChipGroup.label` are now **`ariaLabel`** — both are accessible-name-only
    props, and `label` means visible text everywhere else in this package. Breaking, pre-release.
    The starter's own `[...slug].vue` not-found `Section` switched from `:label` (duplicating a
    visible `<h1>`) to `:labelled-by` pointing at it.
  - `ProductCard` now consumes `card/stretchedLink.ts`'s shared `CARD_FOCUS_PROXY`/
    `STRETCHED_LINK`/`STRETCHED_LINK_OUTLINE` instead of a hand-rolled copy of the same classes, and
    wraps its composed `Price`/`Rating`/`StockBadge` in their own `<div data-part="…">` (the same
    convention already used for `Image`'s `media` wrapper) so each child's own `data-part="root"`
    survives instead of being overwritten by the parent's fallthrough attribute.
  - `ProductCard`'s sale badge no longer renders (a fabricated "−0%") for `badge: { variant: 'sale'
    }` with no real discount.
  - `Price`'s `srLabel` part is renamed **`srText`**, matching `Avatar`/`LogoItem`'s naming for the
    same visually-hidden-text concept. `StockBadge`'s `out` level now reads the shared `soldOut`
    message key instead of a separately-translatable `stockOut` (identical string in both locales).
  - `AvatarGroup` warns once in dev when `max` is out of the 0–3 range it clamps to, matching the
    package's existing override-warning convention; `Chip`'s leading `Avatar` scales its icon/
    initials fallback down to the chip's own leading size instead of leaving them sized for a 2rem
    circle, and now passes `label` as the `Avatar`'s `name` so a broken image falls back to initials
    rather than the generic icon.
  - `frameAspectRatio`, `formatDate`, `useSlotPresence`, `useHeadingTag`/`HeadingLevel`,
    `roundRatingToHalf`/`ratingStarStates`, and `initialsFromName` are now exported from the root
    entry, matching their plan-1 peers (`cx`, `mixToward`, `useUiId`, …); `tagRecipe`/`listFormat`
    stay internal (class strings and a join helper, not public API).
- **`Toast`, `Toaster` and `useToast` — Task 3 of the "overlays, navigation, feedback" sub-project.**
  A brief, non-blocking status message in a fixed bottom-right region (design spec's Toast
  section): `useToast()` is a module-level queue (`show`/`dismiss`/`clear`/`toasts`), callable from
  anywhere, not only from a `Toaster`'s own subtree; `Toaster` is the one host an app mounts once
  (`<Toaster />`, no props required) and owns every timer, the region's placement, and rendering the
  queue. `show({ variant, title, text?, action?, duration?, id? })` resolves `variant` (default
  `"success"`) and `duration` together — `success` 6000ms, `warning` 10000ms, both overridable,
  `danger` always `0` regardless of what is passed (never auto-dismissed); an `id` dedupes (a second
  `show()` with the same `id` replaces that toast in place rather than adding a second one); at most
  three toasts queue at once, the oldest evicted when a fourth arrives. Parts (`data-part`): `Toast`
  — `root`, `icon`, `title`, `text`, `action`, `close`; `Toaster` — `root`, `list`. Every timer pauses
  while the pointer is over the stack or focus is inside it, and resumes for whatever time was left;
  `Esc` closes only the toast that holds focus (its `keydown` handler also `preventDefault()`s, so a
  toast teleported inside an open `Dialog` does not also close the dialog behind it — see the
  Deviations entry). Two live regions, never nested: non-danger toasts render inside an always-
  present `role="status" aria-live="polite"` `list`; a danger toast is `role="alert"` on `Toast`'s
  own root, rendered as a further direct child of `root`, a sibling of `list`, never inside it.
  While a modal `Dialog` is open, `Toaster` teleports its region into that dialog's own element
  (`TOAST_HOST_KEY`, from Task 1's `dialogStack`) instead of `<body>`, so a toast raised mid-flow is
  never inert behind it. `useToast` is SSR-safe: no `window`/`document` access and no timer starts
  outside `Toaster`. New `tailwind.css` utilities: `eldra-toast-width` (the region's own width,
  capped at `100vw - 2rem`), `text-toast-title`, and the `eldra-toast-in` entrance keyframes (fade +
  0.5rem rise over `duration-base` `ease-out`; reduced motion needs no second keyframe — the zeroed
  duration token already produces no movement) — all registered in `src/utils/cx.ts`'s merge groups.
  New messages: `dismissNotification` ("Dismiss notification", the close button's name, distinct
  from the generic `close`), `notifications` (the region's `aria-label`), in both `en-US` and
  `is-IS`. `README.md` gained the `Toast`/`Toaster` Customisation rows, a `useToast` Composables
  write-up, and four Deviations entries (no exit animation, `Toaster`'s two-part anatomy despite the
  danger group, `list`'s `hidden`-while-empty collapse, and the Escape `preventDefault()`).
- **`Dialog` and `useDialog`/`dialogStack` — Task 1 of the "overlays, navigation, feedback"
  sub-project, and the foundation `Drawer`, `Lightbox`, `SearchModal` and the `Toaster` build on.**
  `Dialog` is a small modal window for one decision or a short form (design spec's Dialog section):
  a native `<dialog>` opened with `showModal()`, no `role="dialog"` anywhere and no custom focus
  trap — a modal `<dialog>` already makes the rest of the page inert and already contains
  `Tab`/`Shift+Tab` to its own controls for free. Parts (`data-part`): `root`, `panel`, `header`,
  `title`, `close`, `description`, `body`, `footer`; slots `default` (body) and `footer`; props
  `modelValue` (two-way), `title` (required, the `<h2>`/`aria-labelledby`), `description`
  (`aria-describedby`, omitted for a form body), `size` (`sm` 24rem / `md` 32rem, both capped at
  `100vw - 2rem`), `dismissable` (default `true` — a backdrop click only), `messages`, `classes`;
  emits `update:modelValue`, `cancel` (the native `cancel` event, before the dialog actually
  closes), `close` (with how: `"escape"`, `"backdrop"`, `"button"`, or an action value passed to
  the exposed `close(returnValue)` method — `<Dialog ref="dialogRef">` then
  `dialogRef.value.close('remove')` from a footer button's own handler). `useDialog`
  (`src/composables/useDialog.ts`, exported from the root) is the reusable modal lifecycle every
  later modal surface is built on: open/close synced to `open`, initial focus (the first meaningful
  control that is not `[data-part="close"]`, applied a tick after `showModal()`), focus return to
  the opener, `Esc` always closing (never `dismissable`-gated), and a backdrop click closing only
  when `dismissable` is `true`. `dialogStack.ts` (also exported) is the "never stack two modals"
  registry: a second `showModal()` while one is open is refused with a dev-only console warning and
  the refused dialog's own `v-model` is put back to `false`; it also owns the page-scroll lock
  (`<html>` gets `overflow: hidden` while any modal is open) and `TOAST_HOST_KEY` — a plain
  `Ref<HTMLDialogElement | null>`, **not** a Vue injection key despite matching this package's
  `*_KEY` naming convention (see its own doc comment: a `Toaster`, plan-3 Task 3, mounts as a
  sibling of whatever opens a `Dialog`, and `provide`/`inject` cannot connect siblings) — that
  Task 3's `Toaster` will read to render its live region inside the open dialog rather than being
  inert behind it. New `tailwind.css` utilities: `text-dialog-title`, `eldra-dialog-width(-sm)`,
  `eldra-dialog-max-height`, and the `eldra-dialog-in`/`-reduced` entrance keyframes (fade + 0.5rem
  rise + scale over `duration-slow` `ease-out`; reduced motion is a real 200ms linear fade, not the
  zeroed-duration token, the same exception `animate-eldra-pulse` makes for the Button spinner) —
  all registered in `src/utils/cx.ts`'s `cx()` merge groups. `README.md` gained the `Dialog`
  Customisation row, a `useDialog` Composables write-up and four Deviations entries (the close
  button's active state as a 2% scale rather than a 1px translate, the `close` event's reason for a
  plain external close, `TOAST_HOST_KEY`'s not-an-injection-key shape, and `defineExpose`d
  `close`/`isTop` instead of an `actionValue` prop); `docs/ui.md` gained an "Overlays" section.
- **`Tabs`, `Tab` and `TabPanel`** — task 7 of the "overlays, navigation and feedback"
  sub-project (design spec's "Tabs" section, APG tabs pattern with automatic activation by
  default). Two ways to build one: `items` (`{ value, title, content? }`) renders the whole thing
  from data; for panel content richer than plain text, place `<Tab>`s in the `tabs` slot and
  `<TabPanel>`s in the default slot instead. Both share one implementation — `items` renders as
  exactly that `Tab`/`TabPanel` pair internally — and one new `TABS_KEY` context
  (`src/components/tabs/context.ts`, exported from the root entry): each `Tab` registers itself in
  `onMounted`/unregisters in `onBeforeUnmount`, which is what gives `Tabs` its children's order
  (Vue mounts siblings in document order) with no prop telling it what that order is, needed both
  for the spec's "defaults to the first tab" rule and for cross-tab arrow-key moves.

  Roving tabindex: only the selected tab has `tabindex="0"`, the rest `-1`, set from selection and
  moved together with `aria-selected` on every change. `←`/`→` move focus one tab, wrapping at the
  ends; `Home`/`End` jump to the first/last. Under the default `activation="auto"` moving focus
  selects immediately; `"manual"` moves focus only, and `Enter`/`Space` select through the tab's
  own native `<button>` activation — no keydown handling for either key exists at all, since a
  second path risked firing selection twice. Each panel is `role="tabpanel"
aria-labelledby` its
  tab, `hidden` when inactive, and gets `tabindex="0"` only when it holds no focusable content of
  its own (the brief's "panel focusability rule" — see the README's Deviations entry).

  `underline` (default) draws a per-tab indicator bar, and `pills` a per-tab filled background —
  the spec's "the indicator does not slide" means there is no shared, position-animated element to
  slide in the first place: each `Tab` owns its own indicator (or, for pills, its own fill), shown
  or hidden by a `duration-fast` colour transition alone. The tab list scrolls horizontally rather
  than wrapping, scrollbar hidden via the new `eldra-scrollbar-hide` `tailwind.css` utility (no
  stock Tailwind equivalent, registered in `src/utils/cx.ts`'s own merge group). `Tab`'s own type
  style reuses `VariantPicker`'s `text-variant-pill` (same numbers, same "no baked-in weight"
  reasoning) rather than a new utility; see the README's Deviations entry for that and for the
  spec's `label` property shipping as `ariaLabel` (package convention) and the lack of a
  `disabled` tab, which the spec's own "Tabs" section never mentions.

  Parts (`data-part`, and `classes` keys): `root`, `list`, `tab`, `indicator`, `panel` — the last
  three drawn by `Tab`/`TabPanel`, which `Tabs` forwards its own `classes.tab`/`.indicator`/
  `.panel` to in the `items` API, and which a standalone `<Tab>`/`<TabPanel>` takes directly in the
  slots API. Stories: `Underline`, `Pills`, `Manual`, `ManyTabs`, `LongContent`, `Narrow`,
  `ReducedMotion`, `ForcedColors`.
- **`Accordion` and `AccordionItem`** (design spec's "Accordion" section) — the first component of
  the "overlays, navigation and feedback" sub-project. Native `<details>`/`<summary>` disclosure
  rows: `Accordion` is a plain grouping wrapper (`multiple`, default `true`; `false` puts every
  child `AccordionItem` in the same native `name` group, generated when not given, so the browser
  closes the previously open sibling itself). `AccordionItem` takes `title`, an optional `help`
  line (part of the accessible name for free, since both are plain text inside the same
  `<summary>`), `modelValue` (two-way, mirroring the native `open` attribute — see the README's
  Deviations entry for why this is `modelValue` and not the spec's own `open`), `headingLevel`
  (`2`–`4`, no default — plain text unless the page outline needs a heading) and `href` (a link
  row: a plain `<a>` styled as the same trigger, no `<details>`, no chevron, no panel). The chevron
  is Tabler's `chevron-down` geometry, rotating 180° on open via a new self-conditioned
  `eldra-accordion-chevron` utility (`details[open] & { rotate: 180deg }`, reduced motion baked
  in); the panel fades in via `eldra-accordion-panel` (`@starting-style` plus
  `transition-behavior: allow-discrete` on `opacity`/`display`) rather than animating height — see
  the README's Deviations entry for why a grid-rows height animation was rejected. Same-`name`
  exclusivity is native in every current browser and feature-detected
  (`src/components/accordion/detailsExclusivity.ts`), with a JS fallback that only runs where the
  platform lacks it — which is also what the test suite (happy-dom) exercises, since that engine
  implements neither the grouping algorithm nor the `.name` property.
- **`Drawer` — Task 2 of the "overlays, navigation, feedback" sub-project, built on Task 1's
  `useDialog`.** A modal side sheet for long content (design spec's Drawer section): the cart,
  filters and quick view slide in from the right; the mobile menu from the left. Native `<dialog>`
  + `showModal()`, sharing `Dialog`'s one-modal-at-a-time `dialogStack` slot. Parts (`data-part`):
  `root`, `panel`, `header`, `title`, `count`, `close`, `body`, `footer`; slots `default`
  (scrolling body) and `footer` (fixed); props `modelValue` (two-way), `side` (`"right"` default /
  `"left"`), `title` (visible `<h2>`, `aria-labelledby`), `ariaLabel` (the accessible name with no
  visible heading — the menu drawer: `ariaLabel="Menu"` — the brief's own `label` renamed to match
  this package's "accessible-name-only props are `ariaLabel`" convention), `count` (appends "(3)"
  in `muted` next to `title`), `width` (a CSS length feeding `--eldra-drawer-width`, default
  `28rem`, always capped at the viewport), `messages`, `classes`; emits `update:modelValue`,
  `cancel`, `close` (with how — the identical `"escape"`/`"backdrop"`/`"button"`/action-value shape
  `Dialog`'s own `close` uses). No `dismissable` prop: the spec gives a drawer's backdrop click no
  exception, unlike `Dialog`'s. Below a 48rem **viewport** (one of only two rules in the whole
  design spec measured on the viewport rather than a container — the other is form-field text) the
  drawer covers the full screen, via a plain `@media (width < 48rem)` query baked into the new
  `eldra-drawer-width` utility itself, never a `@container` query. The right side (cart, filters,
  quick view) focuses the close button on open by default, unless a control inside is marked
  `autofocus` — the opposite of `Dialog`'s own "never the close button while a better candidate
  exists" — computed as `Drawer`'s own `initialFocus` passed into the same `useDialog` call
  `Dialog` uses; the left side (the menu) gets no override, so `useDialog`'s existing default (the
  first focusable that is not `[data-part="close"]`) already gives "the first link in the menu" for
  free. A new `closeDrawer(name)` message (`en-US`/`is-IS`) gives the close button a name-specific
  accessible name ("Close cart", "Close menu") from whichever of `title`/`ariaLabel` names the
  drawer, falling back to the plain `close` message with neither. New `tailwind.css`: `text-drawer-
  title`, `eldra-drawer-width` (the width variable, viewport clamp and full-screen media query all
  in one utility), and the `eldra-drawer-in-right`/`-left` entrance keyframes (a `translateX` slide
  over `duration-slow` `ease-out`, applied to the root `<dialog>` the same way `Dialog`'s own
  `animate-eldra-dialog-in` is) — reduced motion reuses `Dialog`'s own `eldra-dialog-in-reduced`
  fade rather than a third keyframe, since both spec sections ask for the identical plain opacity
  fade. All new utilities registered in `src/utils/cx.ts`'s `cx()` merge groups. `README.md` gained
  the `Drawer` Customisation row, a `useDialog` Composables note, and Deviations entries (`label` →
  `ariaLabel`, the viewport-not-container full-screen rule, the width variable, the right-side
  close-button-first focus rule, no `dismissable` prop, the reused reduced-motion keyframe, the
  root-not-panel animation placement, the name-specific close message, and the `modelValue`/`close`
  event naming versus the spec's literal `open`/`openChange`/`afterLeave`); `docs/ui.md`'s
  "Overlays" section gained a `Drawer` bullet.
- **`Tooltip`** (design spec's "Tooltip" section, plan 3 task 4) — a short, non-modal text label
  that names an icon-only trigger on hover and keyboard focus, or adds a description to one that
  already has a visible label (`role="label"` / `role="description"`). Built directly on
  `useFloating` and `useOverlay` — never on `usePopover`, and never joining its "only one open at a
  time" registry, so showing a tooltip can never close somebody else's open `Select`. `placement`
  (`top`/`bottom`) and `align` (`start`/`center`/`end`) cover the spec's Variants table;
  `useFloating`'s `FloatingPlacement` gained `top-end`/`bottom-end` to express `align="end"`. The
  bubble is teleported like the popover panels (a new internal `useTeleportTarget`, shared with
  `usePopover`, which now reads from it too with no behaviour change) but stays mounted
  permanently and fades with a CSS transition, unlike a `usePopover` panel's mount-and-replay
  keyframe — a transition only plays on a change to an element already in the DOM. WCAG 1.4.13:
  dismissible (`Esc`, without moving focus), hoverable (a CSS bridge across the visual gap) and
  persistent (stays until hover and focus both end). The trigger's `aria-labelledby`/
  `aria-describedby` is wired onto the slotted element itself via `cloneVNode`, the one place in
  the package that reaches into a slot's own vnode. See the README's Deviations section for the
  full reasoning on each of these.
- **`Carousel` and `useCarousel`** — task 10 of the "overlays, navigation and feedback"
  sub-project (design spec's "Carousel" section). A native scroll-snap track with arrows, an
  optional counter and dots, and optional autoplay with a mandatory Pause/Play button (WCAG
  2.2.2): `ariaLabel` (required, the region's own accessible name), `perView` (a number or
  `{ base, md, lg }`, default `1.25`; `md`/`lg` are the package's own 48rem/64rem container-query
  breakpoints — the same ones `Container`'s gutter step reads), `controls` (`"header"` default or
  `"below"`), `dots`, `counter`, `autoplay` (ms; any non-zero value always renders Pause/Play).
  Arrows and dots never loop — they disable at the ends, and a focused arrow that becomes disabled
  moves focus to the other one; only autoplay wraps from the last slide back to the first.
  Autoplay pauses on hover, on focus and while the tab is hidden, and never starts at all under
  reduced motion. `useCarousel` (`src/components/carousel/useCarousel.ts`, exported from the root)
  is the whole behaviour with no rendering of its own — index tracking from real scroll geometry
  (with an index-based fallback where none exists), previous/next/`goTo`, edge detection, autoplay
  — reading the track's own DOM children directly rather than Vue's slot vnodes, and annotating
  each one in place (`data-part="slide"`, `role="group"`, `aria-roledescription="slide"`, an "n of
  total" `aria-label`, the `eldra-carousel-slide` sizing class) via a `MutationObserver`, so a
  consumer's own `<li>`/`<figure>`/component root becomes the slide with no wrapper added — the
  same file a future `Lightbox` (task 11) reuses unchanged for its own track. See the README's
  Deviations entries for the ways this simplifies the spec's own product-row/gallery split (one
  slide-labelling rule for both, one fixed track name, no separate "slideshow" suffix on
  Pause/Play, an unbolded counter).
- **`Lightbox`** — task 11 of the "overlays, navigation and feedback" sub-project (design spec's
  "Lightbox" section). A full-screen native `<dialog>` image viewer for product galleries, built on
  `useDialog` and `useCarousel` unchanged: `modelValue`/`index` (both two-way), `images` (`{ src,
  alt, caption?, width, height }[]`), `ariaLabel` (required), `thumbnails`. A counter, close button
  and previous/next arrows sit in a bar/stage around a one-image-per-view track; arrows never loop,
  and a focused arrow that becomes disabled moves focus to the other one, exactly like `Carousel`.
  Opens at `index` with no scroll animation, then scrolls smoothly on every later move unless
  reduced motion is on. Initial focus is the close button (the opposite of `Dialog`'s own rule);
  focus returns to the opener on close. `←`/`→` move the image from anywhere in the viewer, not
  only a focused track. There is no backdrop click and no `dismissable` prop — the viewer's own
  ground covers the backdrop entirely. `Image` (this task) gained a `fit?: 'cover' | 'contain'`
  prop for the Lightbox's own "never crop a full-resolution photo" rule; see the README's
  Deviations entries for that and the rest of this task's judgment calls (the always-full-screen
  reading of the spec's own viewport exception, the `<div>`-not-`<figure>` slide wrapper axe fix,
  and the `*Image` message vocabulary).
- **`Lightbox` fix: full-resolution images no longer fetch while the viewer is closed.** Every
  slide's `Image` was `priority` (eager) and unconditionally in the DOM, on the mistaken premise
  that a closed `<dialog>`'s own `display: none` blocks every fetch regardless of `loading` — true
  for `loading="lazy"`, **false for an eager `<img>`**, which starts fetching the moment it is
  connected to the DOM. A `Lightbox` mounted closed next to a product gallery downloaded every
  full-resolution photo immediately. `Image` is now `v-if="model"` inside each slide (the slide
  `<div>` wrapper itself stays mounted, since `useCarousel`'s own index/count maths reads its
  children directly and must not depend on `MutationObserver` timing across an open/close
  transition); every slide stays `priority` once it exists, since by definition that is only while
  the viewer is open. Also: the track's own `aria-label` is now the spec's literal "Images" (a
  dedicated `lightboxImages` message key), not `Carousel`'s own "Slides", which the original task
  reused by oversight. New tests cover the closed/open/reopened-closed image lifecycle and the
  track's own label; see the README's Deviations entries for the full reasoning.
- **Task 13 (starter, docs, closing) for the "display, commerce and layout" sub-project.** The
  starter (`examples/starter-nuxt`) drops its last duplicated primitives of package components:
  `UiBadge.vue`, `UiPrice.vue` and `UiRating.vue` (plus their stories and `__tests__`) are deleted,
  and every block/page that used them now imports `Badge`/`StockBadge`, `Price` and `Rating`
  straight from `@eldrajs/ui`, the same way blocks already import `Button`/`Input`/`Link`/`Icon`/
  `Image`. `UiImage.vue` stays (it carries Studio's own framing contract, not a duplicate — see
  the README's Deviations entry); `UiAccordion*`/`UiDialog`/`UiDrawer`/`UiTab*` stay (plan 3).
  `README.md`'s Customisation table now has a row for every one of this package's 38 components
  (`src/componentNames.ts`), guarded against drift by the new
  `src/__tests__/readmeCoverage.spec.ts`; the "sixth component" ordinal collision in this file
  (`Avatar`/`LogoItem`/`Skeleton`/`EmptyState` all separately claiming "sixth") is renumbered by
  actual landing order (`LogoItem` seventh, `Skeleton` eighth, `EmptyState`/`EditorPlaceholder`
  ninth); `README.md`'s Deviations section gained the `Container`/`Section` entries
  (`data-section-bg`, `SECTION_KEY`'s nesting warning) and the `EditorPlaceholder`-icon-via-`Icon`
  entry that earlier tasks recorded in their own reports but never actually added to the file.
  `ProductCard`'s title link now uses `outline-none`, matching `stretchedLink.ts`'s own
  `STRETCHED_LINK_OUTLINE` ruling, instead of the `outline-hidden` it shipped with (a double-ring
  bug under forced colours that Task 12's own report flagged for a later task to fix, since
  `ProductCard` merged after `ContentCard`/`FeatureCard` despite landing as the earlier-numbered
  task). `docs/ui.md` gained a full one-line-per-component list; `docs/starter-kit.md` reflects the
  starter's primitive table after this move.
- **`ContentCard` and `FeatureCard`** — the editorial/journal card and the icon feature card
  (design spec's "Content card" and "Feature card" sections), both composing `Image`, `Skeleton`
  and a shared "whole card is one link" pattern. `ContentCard` renders optional media (`ratio`
  `3x2`/`4x3`/`16x9`, `radius-lg`), an eyebrow, a title (the stretched link), a clamped excerpt, a
  date + meta line (`date` formatted through the new `src/utils/date.ts#formatDate` as
  `<time datetime>`), and a `variant` (`plain`/`surface`/`outlined`) — `plain` with no `image`
  renders as `surface` automatically, `surface` shows an optional "Read the update"-style link cue
  pinned to the card's bottom, `outlined` pins a count meta ("24 products") there instead.
  `FeatureCard` renders an icon tile, title, body and, only when `href` makes it linked, a "Learn
  more" cue (new `learnMore` message key) — unlinked cards have no tab stop at all. Both take
  `headingLevel` (2–6, default `3`) and `as` (the same `Button`/`Link` contract: a string tag still
  takes `href`, a component takes it as `to`).

  Root `<article>`/`<div>`, the whole card a single tab stop with the standard focus ring around it
  at `radius-lg` corners — the shared pattern lives in
  `src/components/card/stretchedLink.ts` (`CARD_FOCUS_PROXY`, `STRETCHED_LINK`,
  `STRETCHED_LINK_OUTLINE`), the same `eldra-focus-proxy` shape `Checkbox`'s drawn box uses, applied
  here to a *visible* title `<a>` rather than a hidden input. New `text-content-card-title` and
  `text-content-card-excerpt` `tailwind.css` utilities (the latter shared by `FeatureCard`'s `body`,
  since both read the same 0.9375rem spec number).

  See `README.md`'s Deviations section for the shared stretched-link file (and the note for
  `ProductCard`, landing in the same wave, to reuse it), the `outline-none` vs. `outline-hidden`
  ruling, and the `formatDate` locale behaviour.
- **`EmptyState` and `EditorPlaceholder`** — the ninth component of the "display, commerce and
  layout" sub-project (design spec's "Empty and error states" section). `EmptyState` is the shared
  "nothing here / no results / error" panel shown inside a block: an icon circle, a required
  `title`, optional `text` (max 36ch, `null` renders nothing), and an `actions` slot scoped with
  `{ retrying }` so a caller's own "Try again" `Button` can bind `:loading="retrying"` itself. With
  no `actions` slot, `variant="error"` alone renders a built-in "Try again" `Button` (new `tryAgain`
  message key) wired to `retrying` and emitting `retry` — `empty`/`noResults` have no generic
  action to fall back to, since the spec's own examples are all store-specific. `variant`
  (`empty`/`noResults`/`error`, default `empty`) sets the role — `status` for the first two,
  `alert` for `error` — and colours the icon circle `danger` for `error`, default icon or caller's
  own alike. With no `icon` prop a built-in Tabler-geometry icon is drawn per variant (inbox,
  magnifying glass, warning triangle) at the spec's 1.75rem / 1.5 stroke, the same "copy the path
  data, no runtime `@tabler/icons-vue` dependency" approach `StockBadge`'s icons already use.
  `plain` drops the boundary and background for a state already inside a drawer, list or card;
  `headingLevel` (2–6, default `3`) picks the title's heading element. New `text-empty-state-title`
  `tailwind.css` utility.

  `EditorPlaceholder` is the Studio page-builder's own hint for an unfilled block field — an
  optional icon, a required `label` (the action, e.g. "Add products"), and optional `help`
  guidance — never rendered on the live storefront and, per the spec's own accessibility note,
  carrying no ARIA role. `inline` shrinks the padding from 2rem to 1rem for a hint inside a compact
  inline field (an empty heading). New `eldra-editor-placeholder-border` `tailwind.css` utility
  (1.5px dashed boundary, distinct from `EmptyState`'s own 1px one).

  See `README.md`'s Deviations section for the default-icon-per-variant choice, the
  `empty`/`noResults`-have-no-built-in-action ruling, and the new `tryAgain` message key.
- **`Container` and `Section`** — the layout primitives every block is built from (design spec's
  "Container and section" section). `Section` sets the background (`none`/`surface`/
  `surface-strong`/`primary`/`accent`) and the vertical `spacing` (`none`/`sm`/`md`/`lg`, from the
  new `--eldra-section-*` tokens split into separate `pt-*`/`pb-*` utilities); `Container` sets the
  max content width (`narrow`/`content`/`wide`/`full`, the existing `--eldra-container-*` scale)
  and the side gutters (`--eldra-gutter-mobile/-tablet/-desktop`, breakpointed on the **block**
  width via the `@tablet`/`@content` container queries already declared for `Button`, not the
  viewport). `Section` renders `<section aria-labelledby>` when given `labelledBy`, `<section
  aria-label>` when given only `label`, or a plain `<div>` with neither — `as` overrides the tag
  outright, independent of the aria attributes, for a `<header>`/`<footer>` landmark that needs no
  name of its own. A `primary`/`accent` `Section` marks itself `class="group/section"
  data-section="primary|accent"`, the same mechanism `Button`, `Link`, `Price` and `Rating` already
  read for their own colour inversion (task 6 is the first to render it); every background,
  including `none`, is also marked with the new `data-section-bg`, which a new unlayered rule in
  `tailwind.css` reads to drop a `Section`'s own top padding when the **previous** sibling `Section`
  shares its background (spec Do/Don't: "alternate none and surface between neighbouring blocks
  instead of adding divider lines") — unlayered CSS always wins the cascade over the layered
  `pt-*` utility it overrides, regardless of specificity, so `Section`'s own `spacing` stays an
  ordinary, always-overridable class. `Section` is `@container`, which is what every block's own
  breakpoints (and `Container`'s gutters) measure — the anatomy's "block root" — and it provides
  the new `SECTION_KEY` for its own subtree, so a `Section` mounted inside another warns in
  development against the spec's "sections are never nested inside another section". The starter
  (`examples/starter-nuxt`) moves onto both in the same change: every block replaces its copied
  `UiContainer`/`UiSection` primitives with these, `app/assets/main.css` no longer declares its own
  container/gutter rules or `--spacing-section`/`-lg` (`Container`/`Section` own that now), and the
  regenerated block previews are the visible result.
- **`Chip` and `ChipGroup`** — an operator addition beyond design spec 1 (the private component
  library's `FilterChip`, for a store migrating onto this package): a removable tag or a
  selectable filter chip, never both at once on the same element (see `README.md`'s Additions
  entry for why). `size` `sm`/`md`, `removable` (a `"Remove <label>"` button, `Backspace`/`Delete`
  on a focused root or that button), `selectable`/`selected` (a real `aria-pressed` `<button>`,
  filled `primary` when selected), an optional leading `icon` or `avatar`, `disabled`. `ChipGroup`
  (`modelValue: string[]`, `label`, `disabled`) is a `role="group"` slot wrapper, like
  `ButtonGroup`, that derives a member chip's selected state and toggle from context rather than
  props. New `CHIP_GROUP_KEY`/`ChipGroupContext` exported from the root entry for a consumer
  building a chip-like control of its own.
- **`Avatar` and `AvatarGroup`** — the sixth component of the "display, commerce and layout"
  sub-project (design spec's Avatar section). `Avatar` is the people/maker identity atom: a round
  `sm`/`md`/`lg`/`xl` (2rem/2.5rem/3.5rem/6rem) circle that falls back image → initials → the
  generic user icon. `src` accepts an `ImageMedia` (`Image`'s own type) or a bare URL string, and
  falls back automatically on a failed `<img>` load, not only a missing `src`. Initials are the
  first letter of the given and family name, uppercase (`src/utils/avatar.ts#initialsFromName`;
  a single-word name takes its own first two letters instead of a lone one). `decorative`
  (default `true`) hides the avatar from assistive technology, for the common case where the name
  is printed right next to it (a review byline); `false` renders a standalone avatar instead,
  `role="img"` with `aria-label` set to `name`, and a dev-only console warning fires if that name
  is missing (WCAG 1.1.1/4.1.2). New `text-avatar-initials-{sm,md,lg,xl}` and
  `eldra-avatar-icon-{sm,md,lg,xl}` `tailwind.css` utilities.

  `AvatarGroup` stacks up to three avatars plus a "+N" counter (never more than four circles in
  total — `max` is clamped to 0–3 regardless of what is passed), each avatar `decorative` and
  overlapping the last by 25% of its diameter with a 2px `background` ring. The whole group is one
  `role="group"` named by a single accessible sentence — `aria-labelledby` pointing at a visually
  hidden `srText` part — built by the new `avatarGroup(label, names, more)` message:
  `"Makers: Ingrid, Tomas, Maya and 4 more"`, joined by the new
  `src/utils/listFormat.ts#formatConjunctionList` (`Intl.ListFormat` per locale, with its English
  Oxford comma stripped to match the spec's own example, and a hand-written fallback for a runtime
  with no `Intl.ListFormat` at all). See `README.md`'s Deviations section for the `max` clamp, the
  fixed `sm` group size (the brief's own `AvatarGroupProps` type has no `size` prop) and the
  Oxford-comma ruling.
- **`LogoItem`** — the seventh component of the "display, commerce and layout" sub-project (design
  spec's Logo item section). One logo in a stockist/press logo cloud: `name` (used as the logo
  image's `alt`, never "logo", and as the wordmark text), an optional `logo` (`ImageMedia | null`;
  no logo renders the wordmark fallback, never an empty cell), and an optional `href` that renders
  the cell as a link (`as` follows `Link`'s own contract — a string tag still takes `href`, a
  component takes it as `to`). The rendered element is always a real `<li>`, since `<ul role="list">`
  only reads as a list once its children are real `<li>`s; unlinked, the `<li>` is the cell itself,
  linked, the `<a>`/`as` becomes the cell (padding, 4rem min-height, the `eldra-focus` ring at
  `radius-md`) and the outer `<li>` is bare — see the README's Deviations entry for why `root`
  moves rather than staying on one fixed tag. The logo image is greyscale + 110% contrast at 75%
  opacity, contained within 2.5rem × 9rem (new `--eldra-logo-image-max-height`/`-max-width`
  variables), rising to 100% opacity on hover only when linked; the wordmark is `muted` turning
  `text` on hover, in a new `text-logo-wordmark` type style. A linked item's accessible name gets
  the new `stockistSite` message (" (stockist site)") appended automatically when `href` looks
  external (an absolute URL) — `LogoItem` has no `external` prop like `Link`'s, so this is judged
  from the href itself — and `linkContext` overrides the judgement either way, rendered verbatim.
- **`Skeleton`** — the eighth component of the "display, commerce and layout" sub-project (design
  spec's Skeleton section). A neutral, shimmering loading placeholder: `variant` picks the shape —
  `text` (default; `lines` rows, each a percentage width cycling 85/70/55/35% deterministically by
  index, or the row's own `100%` for a single line), `title` (one fixed 60%-wide bar), `circle`
  (`size`, default `2.5rem`, width = height, fully round), `media` (`ratio`, default `4x5`, the
  same presets `Image`'s `src/utils/ratio.ts` uses), `btn` (the shared `control-height`, matching a
  resting `Button`). Every shape is the `eldra-skeleton` utility (`tailwind.css`) — the shimmer
  `Price`'s own loading state already draws — which was already reduced-motion aware (no change
  needed there). `width` sizes the root itself instead of letting it fill its container: the root
  is `block`/`w-full` by default (never `inline-*`) so the default percentage-wide `text`/`title`
  shapes resolve against something even inside an ordinary block layout; `width` is the escape
  hatch for a shrink-to-fit ancestor (`inline-flex`/`inline-block`), where a percentage width would
  otherwise collapse to nothing exactly like the trap `Price`'s own loading state once had — every shape then
  renders at the root's own (now definite) full width instead of its default fraction of it. The
  root is `aria-hidden="true"`; there is no live region — a loading region's own `aria-busy`/hidden
  text is the caller's responsibility, not this primitive's. `Price` and `Image` keep their own
  inline loading skeletons unchanged (follow-up: point them at `Skeleton` itself in a later pass).
- **`ProductCard`** — the first composed component of the "display, commerce and layout"
  sub-project (design spec's Product card section): the product tile used in every grid, carousel
  and search result, assembling `Image`, `Price`, `Rating`, `Badge`, `StockBadge`, `Button` and
  `Skeleton` — all already shipped — rather than duplicating any of them. `product` is one object
  (`ProductCardProduct`: `title`, `url`, `vendor`, `featuredImage`, `price`, `rating`, `colours`,
  `badge`, `stock`, `available`); `showVendor`/`showRating`/`showSwatches`/`quickAdd` toggle the
  optional rows, `ratio` picks the media's aspect (`4x5`/`1x1`/`3x4`, default `4x5`), `headingLevel`
  sets the title's heading level (default `3`), `loading` swaps the whole card for a skeleton, and
  `currency`/`locale` pass straight through to `Price`. The whole card is one stretched link (a
  card-covering `::after` on the title's `<a>`, anchored to the card root so it is not clipped to
  the title's own box) with the design spec's proxy focus ring (`eldra-focus-proxy`) drawn on the
  card itself, `radius-lg` cornered; quick add sits above that overlay (`relative z-10`) so
  clicking it never navigates, and is named "Quick add" plus the full product title via the new
  `quickAdd(title)` function message, applied as the button's `aria-label`. Sold out
  (`available: false`) dims the media to 60% opacity, shows an outline "Sold out" `Badge` in the
  media-corner badge stack (never alongside a sale/new badge — a third badge is never rendered),
  and replaces quick add with a disabled "Sold out" button. The sale badge's rounded percentage
  ("−20%") derives from `price.compareAt`/`price.amount`, independently of the caller's own
  `badge` field. Colour dots show up to three plus a "+N" overflow, `aria-hidden`, summarised by a
  new hidden `swatchesAvailable(n)` message ("Available in N colours"). An addition beyond the
  spec's own 8-part anatomy: when `product.stock` is set (and the product is not sold out), a
  `StockBadge` status line renders above quick add — see the README's Deviations section for why,
  and for the corner "Sold out" badge being a plain `Badge` rather than `StockBadge` despite the
  task brief's own framing. New messages: `quickAdd`, `quickAddLabel`, `newBadge`,
  `loadingProduct`, `swatchesAvailable`, in both `en-US`/`is-IS`.
- **`Image`** — the fifth component of the "display, commerce and layout" sub-project (design
  spec's Image section). The responsive media frame every card and block builds on: a fixed aspect
  preset (`auto`, `1x1`, `4x3`, `3x2`, `16x9`, `3x4`, `4x5`, default `4x3`) sets the frame's
  `aspect-ratio` (`src/utils/ratio.ts`) — `auto` uses `media.width`/`height`'s own ratio when both
  are given, or 4:3 when there is no `media` at all, so the frame always reserves its space and
  never shifts the layout while an image loads. `focal` (0–100 percent on each axis, default
  centred) sets `object-position`; once `zoom` (1–2) is above 1 the media also scales around a
  `transform-origin` clamped into the safe band for that zoom, so a focal point near an edge never
  pulls the image away from the frame's own edge and exposes it (never stretched, never
  letterboxed). With no `media`, the live site shows a hatched `surface` placeholder (new
  `eldra-image-placeholder-hatch` `tailwind.css` utility) with a photo icon and "No image",
  `role="img"`/`aria-label="No image available"` unless `decorative` is set; a dev-only console
  warning fires whenever `media` is set but neither `alt` nor `decorative` says anything about it
  (WCAG 1.1.1). `caption` renders a `<figcaption>` and makes the root a `<figure>`. `rounded`
  (`none`/`lg`/`xl`) maps to `radius-lg`/`radius-xl` on the frame. `priority` is for the first hero
  image only (`loading="eager"`, `fetchpriority="high"`); every other image defaults to
  `loading="lazy"`, `decoding="async"`. `loading` renders a skeleton (`eldra-skeleton`) at the
  frame's own ratio instead of `media`/the placeholder. `media.type: 'video'` renders a `<video>`
  with native controls instead of an `<img>`, never autoplaying. `Image` sets `inheritAttrs: false`
  and forwards every attribute except `class`/`style` (which go to the root) onto the `<img>`/
  `<video>` element, so a consumer's `data-testid`, `width`/`height` or a framing helper's
  `data-*` markers land on the media element they describe. New `noImage`/`noImageAvailable`
  messages. The starter's `UiImage` (`examples/starter-nuxt/app/components/ui/UiImage.vue`) is now
  a thin wrapper over `Image` rather than its own hand-rolled `<img>` — see `README.md`'s
  Deviations section for the framing-contract ruling and why it is a wrapper, not a replacement.
  Fix round 1: `UiImage` gained `rounded`/`fill`/`fit`/`classes`, mapped onto
  `Image`'s `rounded` prop and `classes.frame`/`classes.media`, so every block that needs a
  radius (`hero`, `gallery`, `feature-grid`, `testimonials`, `image`), a background fill
  (`hero`'s `image-background` variant) or an uncropped view (the gallery lightbox) still gets
  one now that a caller's plain `class`/`style` land on `Image`'s root rather than the `<img>`
  itself — see `README.md`'s Deviations section.
  Fix round 2: the navigation block's logo (not a CMS-framed image — no
  `framing`, no `entryId`/`fieldPath`) no longer goes through `UiImage` at all, since its bare
  `class="h-8 w-auto"` had the same class-lands-on-the-root problem round 1 fixed everywhere else;
  it is a plain `<img>` now. `fit="contain"` also shrink-wraps the frame (`classes.frame` gains
  `w-auto max-w-full`) and constrains the media on both axes (`classes.media` becomes
  `object-contain h-auto w-auto max-w-full max-h-[inherit]`) instead of only changing
  `object-fit`, so a portrait image in the gallery lightbox scales down to fit a height cap like
  `max-h-[85vh]` instead of being clipped by the frame's `overflow-hidden` — see `README.md`'s
  Deviations section.
- **`Button` never grows past the shared control height** (operator addition, 2026-09-25: "make
  all scales match so sm button = sm input, base button = base input, large input = large
  button"). The design spec grows an `md` `primary` button to a 2.75rem touch target below a
  48rem container; every other sized control already shared `control-h-sm`/`control-h`/
  `control-h-lg` with `Input`, so that one growth was the reason a primary button next to an `md`
  input rendered taller. `Button` now stays on the shared control-height scale at every variant
  and size, in every container (README Deviations). `--eldra-target-touch` and the `target-touch`
  utility are unchanged.
- **Every enabled button shows `cursor: pointer`** (operator report, 2026-09-25), overriding
  Tailwind v4 preflight's `button { cursor: default }`: every live `Button` variant, the
  `Input`/`SearchBar`/`UnitInput`/`CurrencyInput` clear buttons, a live `QuantityStepper` +/-
  button, a live `Select`/`MultiSelect` trigger, clear button and `MultiSelect` tag remove button,
  and `Switch`. A disabled or loading control keeps its own cursor (`cursor-not-allowed`,
  `cursor-progress`); `Select`/`MultiSelect`'s read-only trigger keeps `cursor-default`; the
  `UnitInput` drag handle keeps `cursor-ns-resize`. `Link` needed no change.
- **`UnitInput`/`CurrencyInput` tighten trailing action pairs** (operator report, 2026-09-25). With
  the clear button and the drag handle both showing, each action is now `1.5rem` wide with no gap
  between them (still the WCAG 2.5.8 24px minimum) instead of two `2rem` squares a full `gap-1`
  apart — the row previously read as `$1,234,567.89   ×   ↕`, far wider than any other icon pair in
  the library. A single trailing action (`Input`, `SearchBar`, or `UnitInput`/`CurrencyInput` with
  only the clear button or only the drag handle) is unchanged.
- **`Rating`** — the fourth component of the "display, commerce and layout" sub-project (design
  spec's Rating section). A read-only five-star rating in half steps: `value` (0–5) rounds to the
  nearest 0.5, rendering full, half (a clipped filled star over an outline star) and empty stars —
  always `text` colour, never yellow or brand colour, with a `border-strong` outline on the empty
  ones so they still meet 1.4.11 on any ground. One accessible sentence
  (`messages.rating(value, count)`, "Rated 4.5 out of 5, 128 reviews") carries the rating for
  assistive technology on `role="img"`/`aria-label`; the stars, value and count underneath are all
  `aria-hidden`, so `showValue`/`showCount` are purely visual — even the stars-only variant keeps
  the full accessible name. `count = 0` renders "No reviews yet" (`messages.noReviews`) instead of
  a value or count, with an optional `emptyAction` slot below it, never a fabricated "0.0". `href`
  (ignored while `count` is `0`) turns the whole rating into one link to the reviews — a single tab
  stop, never one per star — whose visible count switches to a pluralised "128 reviews"
  (`messages.reviewCount`), underlined and thickening on hover; the focus ring is drawn on the root
  via the same proxy-focus technique `Checkbox`/`VariantPicker` use, so it wraps the whole rating
  rather than just the link text, and the root keeps a 1.5rem minimum height (2.5.8). Two sizes,
  `md`/`lg`, changing only the star size — value/count text stays 0.875rem at both. New
  `eldra-rating-half` `tailwind.css` utility (the half star's `clip-path` overlay) and
  `src/utils/rating.ts` (`roundRatingToHalf`/`ratingStarStates`), exported nowhere but used by the
  component and unit-tested on their own.
- **`Price`** — the third component of the "display, commerce and layout" sub-project (design
  spec's Price section). Formats `amount` (minor units) with `Intl.NumberFormat`, so `4800` reads
  `$48.00` in `en-US`/`USD` and `6990` reads `6.990 kr.` in `is-IS`/`ISK` (no minor units, "."
  thousands grouping) — never a hand-concatenated currency symbol. Sale turns on automatically only
  when `compareAt` is greater than `amount`: the current price turns `accent`, the compare-at
  renders as a real `<s>`, `muted` and struck through, and both are preceded by a visually hidden
  "Sale price"/"Regular price" label (`messages.salePrice`/`regularPrice`, or `labels.sale`/
  `regular` per instance) so a screen reader reads "Sale price $38.40 Regular price $48.00" even
  though many screen readers do not announce strike-through on their own. `from` shows a "From"
  label (`messages.from`/`labels.from`); `unitPrice` renders a second, full-width line ("$5.10 /
  100 g", `messages.perUnit`); three sizes, only `sm`/`lg` of which set an explicit size — `md`'s
  current price inherits the surrounding text, and `compareAt`/`from`/`unit` scale at `0.9em` of
  whichever size the root ends up at; `loading` replaces the whole price with one shimmering text
  skeleton. New `provideEldraUiCurrency`/`useEldraUiCurrency`/`CURRENCY_KEY`
  (`src/composables/useLocale.ts`), `LOCALE_KEY`'s sibling for the store currency `Price` formats
  with by default (`USD`), and a new `eldra-skeleton` shimmer utility (`tailwind.css`) that the
  `Skeleton` primitive (a later task) reuses for every shape. Every part also carries the
  `group-data-[section=…]/section:` colour-switching classes `Button` and `Link` already use, so a
  `Price` outside a card already reads correctly once `Section` (a later task) lands, without a
  change here.
- **`Badge` and `StockBadge`** — the first two components of the "display, commerce and layout"
  sub-project (design spec's Badge section). `Badge` is a static, non-interactive `<span>` (or
  `as`) for product flags, categories, materials and order states: six tones, `outline` and `pill`
  shapes, a `variant` of `sale`/`new` that overrides `tone`, an optional decorative leading icon
  (a dev warning when a `success`/`warning`/`danger` badge has none), and a visually hidden
  `hiddenSuffix` that completes a symbol ("−20%" reads "−20% off"). `StockBadge` is the section's
  inline stock status line — icon plus words, no fill — for the four `StockLevel`s (`in`, `low`,
  `out`, `preorder`), each with a fixed colour, a built-in icon and a default message
  (`messages.stockIn`/`stockLow(n)`/`stockOut`/`stockPreorder(date?)`), overridable per instance
  with `message`.
- **`Select`, `MultiSelect` and `SearchBar` panels are teleported and positioned against the
  viewport.** They were rendered inside the control, positioned `absolute`ly with `z-popover`, so
  any ancestor with `overflow: hidden` clipped them and any later stacking context (a sticky header
  with a `z-index`, a card with `isolate`) painted over them however high that `z-index` was. The
  panel now goes through a `<Teleport>` to `document.body` — or into the open native `<dialog>` the
  control sits in, since that renders in the browser's top layer and `body` would be behind it —
  with floating-ui's `fixed` strategy; `autoUpdate` keeps it on the trigger through every scroll.
  Nothing about opening, closing, the keyboard, `matchWidth`, flipping or the entrance changed, and
  a server render still emits no panel at all. Three consequences worth knowing, all in the
  README's new **Layering** section: a descendant CSS selector rooted **above** the control no
  longer reaches the panel (`data-part` and the `classes` prop still do, and so does
  `#<control-id>-panel`); `--eldra-*` overrides must be set on `:root` rather than on a wrapper
  `<div>`, because the panel no longer inherits from one; and the panel is no longer in document
  order after its trigger, so the `Tab` walk into it is restored by `usePopover`'s new
  `tabRedirect` rather than by the browser (see below). New `teleport` prop on all three controls —
  `true` (default), a CSS selector string, or `false` for the old in-place rendering.
- **The `SearchBar`'s results panel is now exactly as wide as its field.** It always looked that
  way, but only because its containing block happened to stop it: it is a shrink-to-fit box with a
  `min-width` from the field and no `max-width`, and the teleport would have let it grow to the
  window. `useFloating`'s `matchWidth` takes `'exact'` for that — a floor *and* a ceiling — which
  is what the spec's "Matches the field's width" asks for. `Select`'s panel keeps the floor only,
  and can now really grow to its own `min(22rem, 90vw)` the way its spec describes; in place it
  could never exceed its trigger.
- **`Tab` still walks into a teleported panel that has tab stops.** Sequential focus follows the
  DOM, and the panel has left it — so `usePopover`'s new `tabRedirect` puts back exactly two steps:
  `Tab` on the **last** tab stop the control still holds (its trigger, or the clear button beside
  it, or anything else carrying `data-eldra-overlay-owner`) moves focus to the panel's first
  focusable, and `Shift+Tab` on that first focusable moves it back there. Everything between stays
  the browser's own order, including the steps inside the control. `Tab` on the panel's **last**
  focusable is left alone, so focus leaves for the page and the popup closes behind it — an exit in
  both directions, which is what keeps this a redirect and not a keyboard trap (WCAG 2.1.2). A
  non-searchable `MultiSelect` therefore still walks trigger → clear button → footer Clear → Done
  exactly as the spec's Keyboard table describes; searchable controls, which already move focus
  into the panel on open, are untouched.
- **A `<dialog>` teleport target is now chosen by `:modal`, not just by `open`.** Only a dialog
  opened with `showModal()` is in the top layer, and a non-modal `<dialog open>` can sit inside a
  modal one; the nearest ancestor that claims the top layer wins. Where no ancestor claims it — or
  the engine does not implement `:modal` — the nearest open dialog is still used, which is the
  cheaper mistake of the two.
- **`useOverlay` returns `isInside(node)`**, the same question its closing rules ask: trigger,
  content, or anything under a `data-eldra-overlay-owner` matching the content's id. Its
  `focusables()` now takes an optional root (and includes that root when it is itself a tab stop),
  so one answer to "what is a tab stop" serves both halves of a teleported overlay.
- **`usePopover` gained `teleport`, and `useFloating` gained `strategy`.** `usePopover` returns
  `teleportTo` and `teleportDisabled` for a `<Teleport>` around your own panel, resolving the
  enclosing open `<dialog>` for you and staying disabled until mount so the pair is SSR-safe.
  `useFloating`'s `strategy` is `'absolute'` by default, so nothing changes for an existing caller.
- **`parseLocaleNumber` reads a trailing decimal separator as the whole number.** `"12."` is `12`,
  and so is `"12,"` under `is-IS`; a lone `-`, `.` or `,` is still `null`. A numeric field whose
  fraction digits were deleted before the field was left used to commit an empty value.
- **The numeric typing filter refuses the locale group separator on whole-number fields.** `1,5`
  typed into a `QuantityStepper` under `en-US` used to leave the field showing what an Icelandic
  customer reads as "one point five" while committing fifteen. It now shows an
  **ungrouped** editing string while focused (`1,000` becomes `1000` and back on blur), which is
  what makes refusing the character cost nothing. `filterNumericBeforeInput` still accepts it on a
  decimal field, so pasting `1,234.50` still means 1234.5.
- **A disabled `Button` with a component `as` no longer navigates.** A router link navigates from
  its own click listener rather than from the default action, so `preventDefault()` arrived after
  the route had already changed. While disabled the element falls back to the plain `<a href>` for
  the same destination — same `aria-disabled`, same `tabindex="-1"`, same `href` — and routes again
  as soon as it is enabled.
- **`Select` and `MultiSelect` triggers show the focus ring while their popover is open.** A
  trigger opened with the pointer is focused but not `:focus-visible`, so the ring stayed hidden
  under an open panel. New `eldra-focus-open` utility, keyed to the trigger's own `aria-expanded`;
  it is a modifier of `eldra-focus` and registered in `cx`'s merge config with a group of its own.
- **`joinIds` deduplicates per id rather than per argument**, so composing `'a b'` with `'b c'`
  gives `'a b c'` instead of announcing `b` twice.
- `dist/style.css` no longer ships a rule for the press class the scale replaced. Tailwind's source
  scan reads this package's `README.md` and `CHANGELOG.md` as well as `src/`, and all three named
  that class while explaining the change — which emitted real CSS for a class on no element.

- **New components: `UnitInput` and `CurrencyInput`**, replacing the `NumberInput` that appeared
  earlier in this same unreleased window and **never shipped**. They are one-to-one ports of the
  two fields Eldra's private component library ships, so a store that knows those fields knows
  these: the value is formatted in the field **while it is typed into** (`$1,234.5`, `1.234 kr.`,
  `1,234 km`) rather than on blur, with the caret mapped through each reformat by numeric content,
  `ArrowUp`/`ArrowDown` stepping by `step`, arrow/backspace/delete rules that step over separators
  and never eat the symbol, `,` and `.` both inserting the locale's own decimal, undo/redo, an
  optional pointer-only drag handle (`enableDragAdjust`), a clear button, and an emptied field that
  stays empty until you leave it and then falls back to `min`. They draw `Input`'s box, sizes,
  focus ring and error boundary; `name` posts the **raw** number through a hidden input. Exported
  from the root with `UnitInputProps`/`UnitInputPart` and `CurrencyInputProps`/`CurrencyInputPart`.
  **Anyone who took `NumberInput` from a pre-release build**: `UnitInput` replaces it —
  `format="currency"` becomes `CurrencyInput` (or `isCurrency`), `format="unit"` is `UnitInput`'s
  default shape, `precision` is `maxFraction`, and there is no plain `decimal` format: a field with
  no unit and no currency is not one of these two.
- **New `./vee-validate` components: `FieldUnitInput` and `FieldCurrencyInput`**, both binding
  `number | null`. `FieldNumberInput` is gone with the component it wrapped.
- **New: `provideEldraUiLocale()` / `useEldraUiLocale()` / `LOCALE_KEY`** — the number locale as a
  provide/inject pair, the same shape as the messages one and a separate key on purpose. It is the
  default for `UnitInput`, `CurrencyInput` and `QuantityStepper`; each component's own `locale`
  prop still wins, and with nothing provided every field formats in `en-US` as before.
- **Typing into `QuantityStepper` is filtered.** The field is `type="text"`
  (a native number input cannot hold a locale-grouped value), so it did not have the browser's own
  numeric filtering: you could type letters into a quantity and only the blur corrected it. A
  `beforeinput` filter now cancels a non-numeric insertion, lets deletions/undo/redo through, and
  **sanitises a paste instead of refusing it** — pasting `12ab3` inserts `123`. The helper is
  exported as `filterNumericBeforeInput` for a consumer building a numeric control of their own.
  `UnitInput` and `CurrencyInput` deliberately do **not** use it: a non-numeric keystroke lands
  there and the reformat strips it, which is the private components' own behaviour.
- **The tick in a `Checkbox` and in a multi-select option is a real tick.** Both were drawn to the
  spec's literal 2 : 1 ink box and read as a shallow V; both are now Tabler's `check` geometry
  (≈3 : 2) scaled to fit the same box with the same 2px stroke, centred. The indeterminate dash is
  unchanged. A consumer who styled `[data-part="check"] path` by its `d` attribute should stop.
- **A pressed `Button` scales to 98% instead of moving down 1px.** The `active:` one-pixel
  downward translate utility is gone from every variant, replaced by `active:scale-[0.98]`; `link`
  keeps no press movement, and a disabled or loading button has none either. Under
  `prefers-reduced-motion: reduce` the button does not scale at all. `eldra-focus`'s transition
  list gained `scale` at `--eldra-duration-fast`, beside `translate`. A consumer whose own CSS
  targeted the old press class should target `active:scale-[0.98]`.
- **One popover entrance for `Select`, `MultiSelect` and `SearchBar`:** a fade plus a uniform scale
  from 98% over `--eldra-duration-base`, growing from the corner the panel is anchored by. The
  slide is gone, and with it `--eldra-popover-slide` — `usePopover`'s `panelStyle` no longer writes
  it, and the `eldra-popover-in` keyframes no longer read it. `--eldra-popover-origin` now carries
  a two-value `transform-origin` (`top left` / `bottom left`) rather than `top` / `bottom`. The
  `SearchBar`'s results panel had no entrance at all before this and now plays the same one.
- **`Input`, `SearchBar` and `UnitInput` share one field class recipe** (`src/components/input/classes.ts`).
  `SearchBar`'s field was a hand-copied duplicate that had drifted: it had lost the
  `--eldra-input-radius` variable and the `max-md:` mobile type-size override, so it rounded and
  resized differently from every `Input` beside it. No API change; the search field simply behaves
  like the other fields now.
- **`src/utils/number-format.ts` gains `localeSeparators`, `currencyFractionDigits`, and
  `currencyDisplay`/`unitDisplay` on `NumberFormatOptions`** — all additive, all exported from the
  root.

- **`peerDependencies.vue` is now `^3.5.0`** (was `^3.4.0`). Every control's ids come from Vue's
  `useId()`, added in 3.5 — on 3.4 the install succeeded and the first control to mount threw
  `useId is not a function`. No code change; the declared range now matches what the package does.
- **`@vueuse/core` is no longer a dependency.** It was never imported: floating positioning is
  `@floating-ui/vue` directly and the overlay/model composables are this package's own. Runtime
  dependencies are now `@floating-ui/vue` and `tailwind-merge`.
- **`Button` gains `as`** (design spec "Customisation layers" §5), with `Link`'s contract exactly:
  with `href` set, a component `as` receives the destination as `to` (`NuxtLink`, `RouterLink`) and
  a string `as` is used as the tag and still receives `href`; with no `href` it is ignored and the
  component is a `<button>`. So a same-site call to action routes instead of reloading the document.
  Icon-only, loading, `aria-pressed` and the disabled-link semantics are unchanged.
- **`Icon` and `VisuallyHidden` now render `data-part="root"`**, like every other component — a
  consumer's `[data-part="root"]` selector or E2E locator no longer misses exactly these two.
- **`describedBy` composes everywhere instead of replacing.** On `Input`, `Textarea`, `Checkbox`,
  `Select` and `MultiSelect`, a `describedBy` prop used to *replace* the field wrapper's error and
  help ids, so `<FieldWrapper error="…"><Input described-by="x"/></FieldWrapper>` silently stopped
  describing the error. Every control now merges the same way — its own ids first, then the field
  context's — deduplicated, and the attribute is omitted rather than empty. The helper the
  components use, `joinIds`, is exported from the root for a consumer composing their own control.
- **`FieldContext` gains `labelId`**, the id of the wrapper's `<label>` (or a group's `<legend>`).
  `Select` and `MultiSelect` read it for `aria-labelledby` instead of rebuilding `` `${id}-label` ``
  by string convention. A consumer typing against `FieldContext` must add the field.
- **`@eldrajs/ui/resolver` also exports `componentNames` and the `ComponentName` type**, so a
  consumer registering every component globally, or typing their own wrapper map, has the list.
- **`@eldrajs/ui/vee-validate` also exports `FIELD_ONLY`**, the props a `Field*` keeps for itself
  and must not forward — the other half of what `useFieldControl` is exported for.
- A stylesheet fix with no visual change: `eldra-field-invalid`'s corner radius is lifted into an
  `--eldra-field-invalid-radius` custom property instead of a three-deep `var()` fallback written
  inline in its `calc()`. The computed value is identical; it stops PostCSS printing a
  "Parse error … unexpected RPAREN" warning in every consumer's build log.

- `@eldrajs/ui/vee-validate` follow-ups:
  - `FieldBinding` gains **`path`**, defaulting to `name`. A `VariantPicker`'s `name` is its
    *visible* option name as well as the radios' shared native name, so one prop was serving as both
    the legend and the key in `values` — `<FieldVariantPicker name="Size" path="size" />` now keeps
    the legend and puts the value where it belongs. Every other control is unaffected: a
    `RadioGroup`'s and `CheckboxGroup`'s `name` is only the native group name (their question is
    `legend`), and an `Input`'s is the native name outright. `path` is never forwarded to the
    control, and `apiErrors`, `initialValues`, `validationSchema` and the `errors` slot prop are all
    keyed by it.
  - `FormLayout` gains **`focusOnInvalid`** (default `true`). The `./vee-validate` `Form` sets it to
    `false`, because it validates asynchronously and so owns the focus move itself — otherwise a
    submit the layout refuses moved focus twice. The `invalid` event and the refusal are unchanged.
  - A **`group` `FieldWrapper`'s `<fieldset>` now carries `tabindex="-1"`**, so an error summary
    link to a group (whose id is the fieldset's — a group has no single control) actually moves
    focus rather than only scrolling. It stays out of the tab order, and programmatic focus still
    prefers the first real control inside it.
  - `FieldSearchBar` no longer forwards `name`: a `SearchBar` has no such prop and its native field
    is always `q`.
  - Documented precisely: how long an `apiErrors` entry survives a change to a *different* field
    (before submit, or with per-field rules, it stays; after a submit with a form-level
    `validationSchema`, vee-validate's `validated-only` revalidation replaces it), that a `Form`
    never posts without scripting (`handleSubmit` prevents the default — use `FormLayout` directly
    for that), and that fields are revalidated while submitting, unlike the spec's Submitting state.

- `@eldrajs/ui/vee-validate` — the optional adapter entry: `Form`, eleven `Field*` components
  (`FieldInput`, `FieldTextarea`, `FieldCheckbox`, `FieldCheckboxGroup`, `FieldRadioGroup`,
  `FieldSwitch`, `FieldSelect`, `FieldMultiSelect`, `FieldQuantityStepper`, `FieldVariantPicker`,
  `FieldSearchBar`), `API_ERRORS_KEY` and the `useFieldControl` composable they are built on.
  `vee-validate ^4.12` stays an **optional** peer: `src/vee-validate/**` is the only place in the
  package that imports it, and `src/__tests__/veeValidateIsolation.spec.ts` proves the root entry
  loads with it mocked to throw *and* that neither `dist/index.js` nor any chunk it imports carries
  a `vee-validate` specifier.

  Each `Field*` calls `useField(name, rules, { label })` and binds the value to the agnostic
  component's `modelValue`, `handleBlur` to its blur (`focusout` for the three fieldset controls,
  because native `blur` does not bubble), and the message to `invalid` / `error` — but only once the
  field has been touched or the form submitted, which is the design spec's "validate on submit, then
  on blur" rule applied to the *display* rather than to when validation runs. Every other prop, slot
  and attribute is forwarded; `modelValue`, `invalid` and `error` are `Omit`ted from each
  `Field*Props` type, so passing one is a compile error rather than a prop that does nothing.

  `Form` wraps `useForm` and renders `FormLayout` with all of its props passed through. It emits
  `submit(values, ctx)` through `handleSubmit` (never with values that failed validation) and
  `invalid(errors)` otherwise, takes `submitting` from `isSubmitting`, moves focus to the first
  invalid field once validation comes back, and draws the spec's error-summary alert after a failed
  submit — a link per error, pointing at the control's own id, replaceable through the
  `errorSummary` slot. `apiErrors` attaches a server's field errors with `setErrors` and each one is
  dropped the moment its own field changes. `successMessage` fills `FormLayout`'s polite status
  region after a submit passes validation.

  Because `FieldWrapper` is validation-agnostic and cannot read a vee-validate field, the wrapper
  gets its message from `Form`'s default slot instead: `<template #default="{ errors }">` with
  `:error="errors.<name>"`. `errors` carries only what should currently show, on the same gate the
  controls use. Documented in `README.md` and demonstrated in the `Forms/Form` stories
  (`Newsletter`, `Contact`, `ApiErrors`).
- New message `formErrors(n)` in both catalogues ("There are 2 problems with this form" /
  "Það eru 2 villur í þessu eyðublaði"), the error summary's own line.
- `FormLayout`'s focus-the-first-invalid-field logic moved to
  `src/components/form-layout/focusInvalid.ts` so the `./vee-validate` `Form` reuses it rather than
  keeping a second copy that could drift. No behaviour change.

- `@eldrajs/ui/resolver` — `EldraUiResolver({ prefix = 'Eldra' })`, a plain
  `unplugin-vue-components` resolver (`{ type: 'component', resolve(name) }`) resolving
  `<prefix><Name>` for every component the root entry exports (default prefix `Eldra`; never `Ui`).
  Backed by a hand-maintained `src/componentNames.ts`, guarded against drift from `src/index.ts` by
  a test that imports the real entry and compares its component keys.
- `README.md` reorganised into the design spec's section list (Install, Styles, Fonts,
  Customisation, Messages, Composables, Resolver, the forthcoming `./vee-validate` entry,
  Accessibility and testing, Deviations) and its Deviations list completed with every recorded
  departure from the spec for `Button`, `Link`, `Input`, `Textarea`, `VariantPicker` and `SearchBar`
  that had not made it there yet (the `Textarea` live-region entry was written against a threshold
  the component no longer uses and has been corrected, not merely added). Composables gained
  `usePopover`, the composable `Select`, `MultiSelect` and `SearchBar` actually build their popup on
  — previously undocumented even though it is exported from the root. `docs/ui.md` added to the
  kit's docs.
- Public-repo hygiene: the private Eldra library's package specifier, which had leaked into
  `README.md` and `src/resolver.ts`'s own JSDoc, is gone from both; a new
  `src/__tests__/publicRepoHygiene.spec.ts` scans every source file plus `README.md`/`CHANGELOG.md`
  for the private npm scope and a couple of representative internal-only hostnames so it cannot
  recur unnoticed.
- `SearchBar` — the storefront search field with a live, grouped results panel: a real
  `<form role="search" method="get" :action>` with the field named `q`, so `Enter` with no active
  row reaches the Search page with or without scripting (`submit` fires with the query first and
  prevents nothing). The field is a `role="combobox"` (`aria-expanded`, `aria-controls`,
  `aria-autocomplete="list"`, `aria-activedescendant`, `autocomplete="off"`) and the results panel
  is a **non-modal popup**, never a dialog: it is positioned with `useFloating` against the field
  (matching its width), closed by `useOverlay`, and focus never leaves the caret — rows are reached
  through `aria-activedescendant` and a pointer press inside the panel does not blur the field.
  Four views, exactly one at a time: `idle` (recent rows, a row that empties them, then popular
  chips), `results` (Products max 4, Collections max 3, Journal and help max 3 — articles then
  pages — then "See all N results"), `none` (the query by name, one line of advice and the popular
  chips as suggestions) and `loading`, which appears only once a request has been in flight for
  300ms so a fast response never flickers the panel. Matches are marked with weight and an
  underline (a `<mark>` with no background), ignoring case and accents; the active row is marked by
  a fill, an arrow and `aria-activedescendant`, never colour alone. `/` anywhere on the page focuses
  the field (never while someone is typing elsewhere), `ArrowDown`/`ArrowUp` walk every row across
  groups without wrapping, `Enter` follows the active row (or fills the field from a recent row or
  chip, or submits), `Escape` clears the active row, then the query, then closes, and `Tab` closes
  and moves on — options are never in the tab order. Only one search bar on a page answers `/`: the
  first one mounted with `shortcut` on owns it and hands it to the next when it unmounts. A visually
  hidden polite live region announces "4 results for “mer”", or "No results for “teapot”", 400ms
  after typing stops. Recent searches live in `localStorage["eldra-ui:recent-searches"]` when
  `recent` is not given: read on mount and **written when a search actually happens** — the form is
  submitted, or a row is followed — most recent first, deduplicated without regard to case, capped
  at 5, with every storage call wrapped so a browser that refuses simply keeps no history. "Clear
  recent searches" empties them and emits `clearRecent`. A query with no `results` yet shows no
  panel at all (and, after 300ms, the loading view): the "no results" view is an answer from the
  shop, not the absence of one. `size` is `"md"` or `"lg"`, `pill` rounds the
  field fully, `autofocus` is for the Search page, `resultTypes` picks the groups, `showRecent`
  turns the history off, and `classes`/`messages`/the `item` and `empty` slots are the styling and
  content hooks. New type utilities `text-search-meta`, `text-search-title` and `text-search-kbd`,
  and a new `eldra-search-panel-height` (`min(32rem, 70vh)`, on Tailwind's `max-h` merge group).
- New composable `usePopover` (exported from the package root): the open/closed life of a non-modal
  popup anchored to a control — the "only one open at a time" registry, `useOverlay`'s closing
  rules, `useFloating`'s position plus the two entrance variables the keyframes read, the open →
  activate → `afterOpen` sequence, and the label-forwarded-click latch. `Select`, `MultiSelect` and
  `SearchBar` all open their panel with it; it replaced ~160 lines that were line-identical between
  the first two, and neither their tests nor their screenshot baselines moved.
- New messages `noResultsFor(query)`, `searchSuggestions`, `searchProducts`, `searchCollections`,
  `searchJournal` and `searchAdvice`. `clearRecent` is now the spec's own "Clear recent searches"
  (it was "Clear recent"), and `resultsCount` and `viewAllResults` both take an optional second
  argument: `resultsCount(4, 'mer')` is "4 results for “mer”" and `viewAllResults(12, 'mer')` is
  "See all 12 results for “mer”", while the one-argument call is unchanged apart from
  `viewAllResults`' verb ("See all N results", was "View all N results" — `is-IS` already said
  "Sjá allar").

- `VariantPicker` — a native radio group in a `<fieldset>` for a product option (size, colour):
  pills (default) or swatches. `modelValue` is two-way, defaulting to the first available option;
  `name` is used unmodified as the shared native radio `name` and in the legend ("Size: M"). Every
  radio shares one `name`, so arrow keys move and select natively — no key handling of any kind
  lives in the component. `options[].available: false` marks a sold-out option or combination: it
  stays selectable (never `disabled`), draws a struck-through pill or swatch, and adds ", sold out"
  to its accessible name (`messages.soldOut`) and to the legend when it is the selected value.
  Swatches carry the one per-item colour the spec allows (`options[].swatch`) as an inline style;
  the disc's edge is a real `border-strong` boundary (not a shadow), so pale colours stay visible
  at a 3:1 boundary in forced-colours mode, and the colour name is `sr-only` text inside the label,
  never colour alone. The sold-out diagonal line — on both pills and swatches — is an inline SVG
  `<line stroke="currentColor">` rather than a `background`/`box-shadow` trick: the pill's own line
  needs `vector-effect="non-scaling-stroke"` to stay a constant 1px regardless of the pill's
  label-dependent width, and forced-colours mode drops `background-color`/`box-shadow` outright, so
  only a real stroke survives there for either shape. New type utilities `text-variant-legend`/
  `text-variant-pill` (size and line only, so the two weights each needs are the stock
  `font-normal`/`-medium`/`-semibold` utilities, not baked into the shorthand); new border-width
  utilities `eldra-variant-pill-border`/`eldra-variant-swatch-ring`/`eldra-variant-swatch-edge`;
  new inset-line utility `eldra-variant-pill-selected-line` for the sold-out-and-selected pill's
  2px boundary, the same technique `eldra-radio-card-selected` uses.
- `QuantityStepper` — a decrease/input/increase group for a basket quantity, never reaching 0.
  `modelValue` is two-way (default `min`); `min`/`max` default `1`/`99`; `size` is `"md"` or
  `"sm"`; `itemName` is appended to both button names ("Increase, Stoneware mug") for use in a
  list of several lines; `error` renders the same error row a `FieldWrapper` draws, linked by
  `aria-describedby`; `locale` (default `"en-US"`) drives display formatting and parsing of a
  typed value. Pressing a button, or `ArrowUp`/`ArrowDown` in the field, steps by 1 and clamps to
  `[min, max]`, firing `change` once — never per keystroke. A typed value is rounded to a whole
  number and clamped on blur or `Enter`; a non-number becomes `min`; "0" and values past `max` are
  silently corrected rather than shown as an error. The relevant button is `aria-disabled="true"`
  at a limit (not `disabled`), so it stays focusable. A polite, visually-hidden live region
  announces the settled value once per commit. The field is `type="text"` with
  `inputmode="numeric"` and `role="spinbutton"` (`aria-valuenow`/`-valuemin`/`-valuemax`) rather
  than the design spec's literal `<input type="number">` — see the component's own doc comment:
  a native number input cannot hold a locale-grouped typed value (`is-IS`'s `"1.234"`).
- New utility `src/utils/number-format.ts`: `createNumberFormat`/`formatNumber` wrap
  `Intl.NumberFormat` for a decimal, currency or unit value, and `parseLocaleNumber` turns text a
  person typed in their own locale back into a `number`, deriving the group and decimal separators
  from `Intl.NumberFormat(locale).formatToParts()` rather than assuming an arrangement (so
  `is-IS`'s `"1.234,56"` and `en-US`'s `"1,234.56"` both parse to `1234.56`).
- New message `quantityUpdated(n)`, and new type utilities `text-stepper-value`/
  `text-stepper-value-sm` (the stepper value's 0.9375rem/0.875rem, weight 600, tabular type).
- `Switch` now merges a `FieldWrapper`'s `help` text into its `aria-describedby`, alongside its own
  `description` when it has one (own id first), instead of only ever describing itself.
- `MultiSelect` — the custom multiple select: the same trigger, popover, listbox, search field,
  groups, rich options, keyboard and "only one open at a time" rule as `Select`, with a checkbox on
  every row (`aria-multiselectable="true"`, `aria-selected` per row), a trigger summary of up to
  `maxSummary` labels followed by a "+N" pill, a removable tag list under the control
  (`showTags: false` turns it off) and a panel footer holding a polite live count, Clear and Done.
  `modelValue` is a `string[]`; `change`, `clear`, `open`, `close` and `search` are emitted, and a
  hidden native `<select multiple name>` underneath stays in sync both ways and fires a bubbling
  `change`, so forms post every selected value. Toggling never closes the popover: `Enter` (and
  `Space` without a search field) toggles, `Alt+ArrowUp` toggles and closes, `Tab` walks into the
  footer with the popover still open, `Backspace` in an empty search field takes the last tag off,
  and `Backspace`/`Delete` on the closed trigger clear everything. A `disabled` or `readonly`
  control keeps its tags readable and drops their remove buttons, as it already drops the clear
  button. Slots: `option` (`{ option, selected, active }`), `value` (`{ options }`), `tag`
  (`{ option }`) and `empty`.
- `Select`'s panel is now the same component `MultiSelect` opens. The search field, the listbox, the
  groups, the option rows, the empty state, the press guard that keeps a click inside the panel from
  blurring the focused element, and the active row's scroll-into-view live in one place; the two
  controls differ only in what choosing a row does. Nothing about `Select` changed — every part,
  class and screenshot baseline is identical.
- New messages `selected`, `selectedCount(n)`, `noneSelected` and `done`, and the default
  `multiSelectPlaceholder` is now the spec's `"Any"` (`is-IS`: `"Allt"`) rather than
  `"Select options"`.
- New utilities `text-select-pill` (the "+N" pill's 0.75rem/600 tabular type) and
  `eldra-select-check-radius` (an option checkbox's 0.25rem corner), with the variables
  `--eldra-select-pill-line` and `--eldra-select-check-radius`.
- `Select` — the custom single select: a `<button role="combobox">` trigger over a non-modal
  popover, never the platform's native select UI, with a hidden native `<select name>` (and
  `<optgroup>`s) underneath that stays in sync and fires a bubbling `change`, so forms post the
  value and existing listeners keep working. `modelValue` is two-way; `change`, `clear`, `open`,
  `close` and `search` are emitted. `options` take a `group`, `hint`, `meta` (+ `metaTone`
  `warning`/`danger`), `swatch`, `icon` and `disabled`, and the chosen option's swatch or icon
  shows in the trigger. `searchable` turns itself on past 10 options and puts a search field
  (`role="combobox"`, `aria-autocomplete="list"`, inset focus ring) at the top of the panel;
  filtering ignores case and diacritics, bolds and underlines the matched run, hides groups with no
  matches and shows "No matches for “…”" as real text. `clearable` adds a clear button beside the
  chevron (`Backspace`/`Delete` clear too), `placeholder`, `leadingIcon`, `invalid`, `describedBy`,
  `required`, `disabled`, `readonly`, `size` (`sm`/`md`/`lg`, the same box as `Input`) and
  `placement` (`auto` flips above when there is no room; `above` always opens above) round it out.
  Slots: `option` (`{ option, selected, active }`), `value` (`{ option }`) and `empty`. The whole of
  the design spec's two keyboard tables is implemented, including `PageUp`/`PageDown` by ten,
  `Alt+ArrowUp`, `Escape` clearing the query before it closes, `Tab` closing without trapping
  focus, and type-ahead with a 0.6s buffer. Opening one select closes any other open one.
- `useListbox` — the listbox keyboard and active row, exported from the package root: `Select` and
  the coming `MultiSelect` share it, and so can a control of your own. It owns no DOM; `activeId`
  is what you bind to `aria-activedescendant`, and choosing, clearing and querying are callbacks.
  `normalizeText` is exported with it, for case- and diacritic-insensitive matching.
- New message `noMatchesFor(query)` ("No matches for “…”"), used by `Select`'s empty state when a
  search query is showing; `noResults` is still used when there is none.
- New CSS variables: `--eldra-select-panel-max-height` (`20rem`), `--eldra-select-panel-max-width`
  (`22rem`, clamped to `90vw`), `--eldra-z-popover` (`30`, above the sticky header),
  `--eldra-select-group-tracking`, `--eldra-select-option-line`, `--eldra-select-swatch-edge` and
  `--eldra-select-match-weight`/`-underline`/`-underline-offset`. New utilities
  `eldra-focus-inset-always` (the inset ring on any focus, for a select's search field) and
  `animate-eldra-popover-in` (the popover's entrance, instant under reduced motion; its direction
  comes from `--eldra-popover-origin`/`--eldra-popover-slide` so a panel that flips does not replay
  it), and `eldra-select-option-active`/`-selected`, which give the active and the selected row a
  real boundary under forced colours, where a fill and a weight difference both disappear.
- **Breaking-ish:** the default `selectPlaceholder` message is now `"Select"` (`is-IS`: `"Velja"`),
  the design spec's own default, rather than `"Select an option"`.

- `useOverlay` and `useFloating` — the two composables every **non-modal** popup in this package is
  built from (Select, Multi-select, the Search bar's results panel), exported from the package root
  so a consumer can build one of their own. Neither traps focus: the design spec reserves
  `<dialog>` and focus traps for modal surfaces and says these popups are not dialogs, so `Tab`
  always moves on and focus landing outside is what closes the popup.
  `useOverlay({ open, trigger, content, setOpen, closeOnOutsideClick?, closeOnEscape?,
  returnFocus? })` returns `{ close, focusFirst, focusables }` and listens on `document` only while
  `open` is `true` — a captured `pointerdown` outside the trigger, the content, or any element
  under `data-eldra-overlay-owner="<the content's id>"` (so a teleported panel still counts as
  inside); a bubbling `focusout` whose new owner is outside; and a bubbling `Escape`, which it both
  `preventDefault()`s and stops, so a popup inside a native `<dialog>` does not close the dialog
  behind it. `returnFocus` (default on) puts focus back on the trigger on `Escape` and when focus
  went nowhere, and never pulls it off the element a pointer press just moved it to. Every listener
  comes off when the overlay closes or the scope is disposed.
  `useFloating(reference, floating, { placement?, offset?, matchWidth?, flip? })` wraps
  `@floating-ui/vue` (`autoUpdate`, `offset`, `flip`, `shift`, `size`) and returns
  `{ styles, placement, update }`. `placement` takes the design spec's own words — `auto` (below,
  flipping above when it does not fit) and `above` (always above, never flips) — as well as the
  four concrete `bottom`/`bottom-start`/`top`/`top-start` values, and `flip` overrides either
  default. `styles` is a plain `:style` object (`position`, `top`, `left`, plus `minWidth` under
  `matchWidth`) rather than a transform, leaving `transform` free for the popover's own open
  animation. `matchWidth` is a floor, not a fixed width — the spec's popover is "min width =
  trigger, grows to fit its content up to min(22rem, 90vw)", and that clamp is the panel's own
  `max-width`.

- `Switch` — an on/off control for a setting that takes effect immediately, `<button type="button"
  role="switch" aria-checked>` with the visible label as its own content (so the accessible name
  matches the screen) and no key handling of its own: `Space`/`Enter` toggle for free from a real,
  native button. `modelValue` is two-way and `change` fires with the new boolean; `size` is `md`
  (2.75 × 1.5rem track) or `sm` (2.25 × 1.25rem, filter bars); `description` adds a second `muted`
  line, linked by `aria-describedby` and kept `aria-hidden` so it never joins the accessible name;
  a hidden `<input type="checkbox">` mirrors `modelValue` and carries `name` for a plain form
  submit, disabled exactly when the switch is. On/off is shown by the thumb's position and a check
  icon as well as colour, never colour alone; the thumb slides and the track fills over
  `duration-fast`, both owning their own transition since neither carries the focus ring (the
  button does, at the spec's `radius-sm` corner). Per-part `classes` for `root`, `track`, `thumb`,
  `label` and `description`. Inside a plain (non-group) `FieldWrapper`, a `Switch` drops its own
  `label` part and takes the wrapper's id, the same shape `Checkbox`'s `labelsControl` uses — not
  part of the design spec, which never discusses a Switch inside a field wrapper, but named
  explicitly by the task. CSS variables: `--eldra-switch-radius` (default `radius-full`),
  `--eldra-switch-track-border-width` (default `1.5px`) and `--eldra-switch-thumb-offset` (default
  `0.1875rem`, the thumb's rest inset from the track's start edge).
- `@eldrajs/ui/tailwind.css` gains `eldra-switch-track-border`, `eldra-switch-thumb-offset`,
  `text-switch-label` and `text-switch-description` (the Switch's own border-width, thumb-inset and
  type-style utilities, none of them a spacing-scale multiple or an existing type token).
- `RadioGroup` — a native radio group in a `<fieldset>` with a `<legend>`, one shared `name`
  (generated when you give none) and no key handling of its own: arrow keys, wrapping, skipping
  disabled options, and the group's single tab stop are all native `<input type="radio">`
  behaviour. `modelValue` is the two-way selected value and `change` fires with it; `options` is
  `{ value, label, hint?, meta?, disabled? }[]`, and `label`/`hint`/`meta` are also scoped slots.
  `layout` is `vertical` (default), `row` (wraps, for short labels) or `cards` — the whole option
  becomes a bordered card with `meta` pushed to the end in tabular numerals, selection shown by a
  filled radio, a `surface` fill and a 2px `primary` border (never colour alone). `size` (`md`/`lg`)
  changes the radio in plain layouts only; a card's radio is always `md`. `required` is native, on
  every radio. `error` sets `aria-invalid="true"` on **every radio** (unlike `CheckboxGroup`'s,
  which stays on the fieldset) and links the message by `aria-describedby`, drawn by the same row
  `FieldWrapper` and `CheckboxGroup` use. The focus ring is drawn on the radio in every layout,
  including cards, through the same `eldra-focus-proxy` utility `Checkbox` uses. Per-part `classes`
  for `root`, `legend`, `options`, `option`, `radio`, `label`, `hint`, `meta`, `error` and
  `errorIcon`. CSS variables: `--eldra-radio-card-border-width` (default `1px`),
  `--eldra-radio-card-radius` (default `radius-md`); the radio circle itself reuses
  `--eldra-checkbox-border-width`/`-invalid`, since the spec gives it the same numbers.
- `Checkbox` inside a `FieldWrapper` — a plain wrapper already renders a `<label for>` naming the
  box, so the box no longer renders a second `<label>` of its own (its root becomes a `<span>`);
  one control, one label. The control is now positioned over the drawn box rather than `sr-only`
  inside it, so the box stays clickable with no label of its own to click through. The spec's
  single-consent shape — the sentence beside the box — is `<FieldWrapper group>`. `FieldContext`
  gains `labelsControl`, which also stops `Checkbox`, `Input` and `Textarea` adopting the context
  `id` inside a `group`, where that id belongs to the `<fieldset>` itself.
- `Checkbox` — an invalid box that is checked or indeterminate keeps its `primary` fill and its
  mark; the error is the 2px `danger` boundary alone. A `background` fill under a
  `primary-contrast` mark drew the tick in the page's own colour.
- `Checkbox` — the tick and the dash are drawn at the sizes the spec gives them (tick 0.625 ×
  0.3125rem, dash 0.625rem wide, both 2px).
- `CheckboxGroup` — `classes` gains an `errorIcon` key, and the error row is now the same
  component a `FieldWrapper` draws.

- `Checkbox` — a native `<input type="checkbox">`, visually hidden inside its own `<label>` so the
  whole row (box, label, hint) is the click target and is at least 1.5rem tall, drawn as a box with
  a tick or a dash. `modelValue` is two-way and `change` fires with the new boolean; `indeterminate`
  sets the native property (re-applied after every toggle, because activating a checkbox clears it
  in the browser) and `aria-checked="mixed"` beside it, with `controls` naming the children an
  indeterminate parent stands for. `size` is `md` (1.125rem box, nudged onto the first text line) or
  `lg` (1.5rem, top-aligned); `hint` adds a `muted` second line under the label; `value`/`name` are
  the native form values; `invalid`, `required`, `describedBy` and `id` fall back to the
  `FieldWrapper`'s context exactly as `Input`'s do. Because the input is hidden, the standard focus
  ring is drawn on the **box** through the new `eldra-focus-proxy` utility — the focus-ring
  foundation's "Proxy focus" rule. Per-part `classes` for `root`, `box`, `check`, `label` and
  `hint`. CSS variables: `--eldra-checkbox-radius` (default `radius-sm`),
  `--eldra-checkbox-border-width` (`1.5px`) and `--eldra-checkbox-border-width-invalid` (`2px`).
- `CheckboxGroup` — a real `<fieldset>` with a `<legend>`, so the question is read with every
  option. `modelValue` is the two-way array of checked values (and `change` fires with the new
  array, never the same instance twice), `options` is `{ value, label, hint?, disabled? }[]`,
  `layout` is `vertical` (0.5rem gaps) or `row` (0.5rem × 1.5rem, wrapping, for short labels like
  sizes), and `name` is the one form field name they share. `error` renders the message with its
  `alert-circle` icon and links it to the **fieldset** with `aria-describedby`, marking that
  `aria-invalid="true"` while the individual options stay valid. It needs no `FieldWrapper` around
  it, and must not be put inside one with `group` set — that would nest a second `<fieldset>` and
  legend around the first. Per-part `classes` for `root`, `legend`, `options` and `error`.
- `Input`, `Textarea` — the error boundary now follows the field's own radius (`--eldra-input-radius`
  / `--eldra-textarea-radius`, through the new `--eldra-field-radius`) rather than always
  `radius-md`, and `--eldra-field-border-width` now drives the control's real border as well as the
  inset line that completes it, so the two can no longer come apart. The danger boundary is also
  dropped on a **disabled** field (`aria-invalid` stays: still invalid, just not correctable here)
  and kept on a **read-only** one, on the root and the control alike.
- `defaultCharacterMeaning` is exported as `Readonly<Record<string, RegExp>>`. Documented: a mask
  format with no placeholder slots in it (`'--'`) formats and strips every value to `''`, and a
  masked field loses the caret to the end of the value after an edit in the middle of it.

- `FieldWrapper` — the wrapper every form control sits in: the visible `label` with its `required`
  asterisk (`aria-hidden`, with the control's native `required` doing the announcing) or
  `(optional)` mark, the control, the `error` with its `alert-circle` icon, and a foot row carrying
  `help` at the start and a `counter` (`{ max, value }`, `danger` weight 600 once over the limit) at
  the end. It provides `FIELD_KEY`, so a bare `<Input />` or `<Textarea />` inside it needs no `id`,
  no `aria-describedby`, no `aria-invalid` and no `required` of its own — `describedBy` is the error
  id **first**, then help, then the counter, and only ids that actually render. The error is a plain `<p>` linked by
  id, never a live region: announcing a failed submit belongs to the form. `full` spans both columns
  of a two-column `FormLayout`, and `group` renders the whole wrapper as a `<fieldset>` with the
  label as its `<legend>` — the spec's shape for a set of checkboxes or radios that answer one
  question, with the help and error linked to the fieldset itself — the `<legend>` is the
  fieldset's first child, which is what names it, and the fieldset carries the field's id so a
  failed submit can name the group. Slots: `default` (the control),
  `label`, `help`, `error` — a slot is content, so a `#error` slot makes the field invalid exactly
  as the prop does, and one toggled on or off is followed. Per-part `classes` for `root`, `label`,
  `legend`, `requiredMark`, `optionalText`, `control`, `error`, `errorIcon`, `foot`, `help` and
  `counter`.
- `FormLayout` — a real `<form novalidate>` that arranges fields in a single column, a responsive
  two-column grid or an inline row, and closes with an actions row. `heading` names it through
  `aria-labelledby` (`headingLevel`, 2–4, picks the element; "h4" in the spec is the type style, not
  the level), `ariaLabel` names one with no visible heading; `action` and `method` keep it posting
  without scripting. On submit the form asks the DOM which fields are invalid
  (`[aria-invalid="true"]`, which every control in this package sets from its field's `error`): if
  any are, the submit is stopped, focus moves to the first one and **`invalid`** fires with their
  ids; otherwise **`submit`** fires with `{ event, data }` — the native event, undefaulted so the
  form still posts, and the form's own `FormData`, read with the event's `submitter` so a named
  submit button contributes its own name/value pair (how a form tells "Save draft" from "Publish"). The `errorSummary` slot draws the spec's alert
  box above the fields (`surface` fill, 1px `danger` border, `danger` icon) around your list of
  links to the failed fields, and `statusMessage` feeds a permanent, visually hidden polite
  `role="status"` region so a success is announced without moving focus. The two-column pairs appear
  from a **36rem container** (not a viewport width), so a form in a narrow page-builder column
  behaves like a form on a phone; below it everything stacks and the actions go full width with the
  primary first, without moving in the DOM, and a leading back link pushes itself to the start of a
  wide row without a class from the caller. `submitting` provides `FORM_SUBMITTING_KEY`, which makes
  the `type="submit"` Button loading and every other action disabled while the fields stay editable.
  The form is a `@container`, which is what lets the md primary Button inside it grow to the 2.75rem
  touch target on a narrow *form*. Slots: `default` (fields), `errorSummary` and `actions`; per-part
  `classes` for `root`, `heading`, `errorSummary`, `fields`, `actions` and `status`.
- `FORM_LAYOUT_KEY` is exported alongside `FORM_SUBMITTING_KEY` and `FIELD_KEY`, so a consumer
  composing its own field or form wrapper can join the same wiring.
- The `optional` message is now `"optional"` (`"valfrjálst"`), lower case: the `FieldWrapper`
  renders it in parentheses as the spec's `(optional)` mark.
- `@eldrajs/ui/tailwind.css` gains `text-field-note` (the 0.8125rem / 1.45 line a field's help and
  error text share, with no `font-weight` of its own) and the `--container-two-col` breakpoint
  (36rem), which is the form layout's two-column edge — `@two-col:` and `@max-two-col:`.
- **`Button`**: the 2.75rem touch-target growth below a 48rem container is now the **primary**
  action's alone, per the spec's "Controls keep their height on mobile. Only primary action buttons
  grow to `target-touch`." A secondary, outline, ghost or danger `md` button keeps the 2.5rem
  control height it shares with the inputs beside it, so a mixed actions row no longer has two
  button heights in it on a narrow container.

- `Textarea` — multi-line text entry that grows with its content from `minHeight` (`5rem` by
  default) up to 16rem, then scrolls: `field-sizing: content` where the runtime supports it, with a
  measured `rows` fallback (re-measured against `scrollHeight`/`clientHeight` on mount, on every
  `input`, and on a programmatic `v-model` change alike) where it does not. `counter` shows
  `"n / maxLength"` in the foot row once `maxLength` is also set — `muted` under the limit, `danger`
  weight 600 once the value runs over it (typing past this *soft* limit is still allowed);
  `hardLimit` also sets the native `maxlength`, so typing stops there instead. The counter itself
  carries no `role` or `aria-live`; a separate visually hidden, always-rendered `role="status"`
  `aria-live="polite"` region announces once on crossing 80% of the limit ("20 characters left")
  and once on passing it ("Over the limit by 3"), clearing itself on leaving a zone so re-crossing
  it announces again — never on every keystroke. `input` fires alongside `update:modelValue` on
  every keystroke; `change` fires the committed value. `invalid`, `describedBy` (the counter wires
  its own id in automatically), `required`, `readonly` and `disabled` share `Input`'s states and its
  field-context wiring through `FIELD_KEY`; the per-part `classes` prop covers `root`, `control`,
  `foot` and `counter`. `--eldra-textarea-radius`, `--eldra-textarea-min-height` and
  `--eldra-counter-line-height` restyle it without touching a class.
- Messages — `overLimit` (a `Textarea`'s over-the-limit announcement: en-US "Over the limit by 3",
  is-IS "Yfir hámarkinu um 3").
- `@eldrajs/ui/tailwind.css` gains `text-counter` (a field's character-counter type style: the
  caption token's size on a `1.5` line, with no `font-weight` of its own so the over-limit state's
  `font-semibold` is a plain, reliably-ordered stock utility rather than fighting a shorthand `font`
  declaration).

- First release: a public, MIT-licensed Vue 3 core component library for Eldra storefronts, built
  to the Eldra starter design spec and WCAG 2.2 AA. Peers on `vue` ^3.4; `vee-validate` ^4 is an
  optional peer used only by the `@eldrajs/ui/vee-validate` entry.
- `@eldrajs/ui/tokens.css` declares the design system as `--eldra-*` custom properties on `:root`:
  17 colour roles, 12 type styles, the spacing, radius, shadow, layout, duration, easing and layer
  scales. A `@media (prefers-reduced-motion: reduce)` block zeroes every duration. Setting these
  variables is how a store restyles the components — no value in the package is a literal.
- `@eldrajs/ui/tailwind.css` is the Tailwind v4 theme over those variables, for consumers who run
  Tailwind themselves: import it after `@import 'tailwindcss'`. It maps the `color`, `font`,
  `spacing`, `radius`, `shadow`, `ease` and `container` namespaces onto the tokens (resetting the
  stock palettes it replaces) and adds the `text-*` type-style utilities, `control-h{,-sm,-lg}`,
  `target-min`, `target-touch`, `duration-{fast,base,slow}`, `z-{sticky,drawer,dialog,toast}` and
  the one focus ring: `eldra-focus`, `eldra-focus-always` and `eldra-focus-inset`, each with a
  `forced-colors` fallback.
- `@eldrajs/ui/style.css` is the same theme compiled with the components' utilities, for consumers
  without Tailwind.
- `Icon` — renders a Tabler (or any) icon component at the spec's four sizes (1, 1.25, 1.5 and
  2rem) with stroke 1.75, in the current text colour. Decorative (`aria-hidden`) unless `label` is
  given, which makes it `role="img"` with an accessible name.
- `Button` — the spec's one action control, in six variants (`primary`, `secondary`, `outline`,
  `ghost`, `link`, `danger`) and three sizes. Renders a native `<button>`, or an `<a href>` when
  `href` is set. `loading` hides the label and icons without changing the width, shows a spinner
  and swaps the accessible name to `label`; `iconOnly` makes it square and named by `label`;
  `pressed` exposes `aria-pressed` with a fill, not only a hue; `disabled`, `block` and the
  per-part `classes` prop complete the set. Hover fills are `color-mix()` of the tokens, so a
  rebranded `primary` or `accent` carries them with it, and on a `primary` or `accent` section the
  variants invert on their own. `--eldra-button-radius`, `--eldra-button-line-height` and
  `--eldra-button-font-size-lg` restyle it without touching a class.
- `ButtonGroup` — the layout helper: a wrapping row with a `space-3` gap, or a segmented control
  with `attached` (`role="group"`, square inner corners, 1px neighbour overlap, the focused button
  raised above its neighbours). It is a container-query context, which is what lets an md Button
  inside it grow to the 2.75rem touch target when the block is narrower than 48rem.
- `FORM_SUBMITTING_KEY` — the injection key a form layout provides so that, while the form
  submits, its `type="submit"` Button becomes a loading button and every other action is disabled.
- `@eldrajs/ui/tailwind.css` gains `text-button-{sm,md,lg}`, `animate-eldra-spin` and
  `animate-eldra-pulse` (with the `eldra-spin`/`eldra-pulse` keyframes), and a `--container-tablet`
  key so `@max-tablet:` is the spec's "narrower than 48rem" container query.
- `VisuallyHidden` — content for assistive technology only, with `as` for the rendered element and
  `focusable` for the skip-link pattern.
- Messages: `useMessages`, `provideEldraUiMessages` and `MESSAGES_KEY` resolve the strings the
  components emit themselves in the order English defaults → provided → the component's `messages`
  prop. `enUS` is the default set; `@eldrajs/ui/messages/is-IS` now ships the Icelandic one.
- `cx` and `partClass` merge classes with a `tailwind-merge` instance extended with this package's
  own `@utility` classes (type styles, control heights, `target-min`/`target-touch`, the
  `eldra-focus` family, motion durations, layers and the spinner animation) as their matching or
  own class groups, so a consumer's `classes.container: 'text-lg'` now replaces `text-button-md`
  instead of landing beside it. `mixToward` builds the `color-mix(in oklab, …)` string that derived
  states use. `useUiId` produces SSR-safe ids and `useControllableModel` the controlled/
  uncontrolled `v-model` behaviour.
- `Link` — text navigation in three forms: `inline` (always underlined, 1px at 55% of the text
  colour thickening to 2px on hover), `standalone` (weight 600, optional trailing `arrow-right`
  that moves 2px right on hover, no underline at rest), and `external` (`target="_blank"`,
  `rel="noopener noreferrer"`, the `external-link` icon and visually hidden "(opens in a new tab)").
  `tone="muted"` is for footer and meta-line links. With no `href` it renders a
  `<span data-part="root">` with the same text and no link semantics, per the spec's "render plain
  text instead of a link." `as` takes a tag or a router-link component (a component receives the
  destination as `to`, matching Vue Router / NuxtLink). On a `primary` or `accent` section it
  inherits the section's contrast colour. `--eldra-link-radius` restyles the focus ring's corner
  radius.
- `@eldrajs/ui/tailwind.css` gains `eldra-link-radius` (Link's 2px focus-ring corner radius, with
  no radius token that small).
- `Button` — a `loading` button with no `label` now also warns once in development that it loses
  its accessible name while loading (the visible label is `visibility: hidden`), next to the
  existing icon-only warning.
- `@eldrajs/ui/tailwind.css` — `eldra-focus` and `eldra-focus-inset` now own the transition list of
  the element they sit on: one `transition` shorthand covering colour, border, text-decoration,
  `translate` and `opacity` at `duration-fast` and the ring's own `outline-width`/`box-shadow` at
  `duration-base`, plus the reduced-motion rule. Before this the ring never grew in — a component's
  own `transition-[…] duration-fast` was a later rule for the same shorthand property and replaced
  the ring's entries wholesale, so it snapped to full size. **If you put the focus ring on your own
  element, do not add a `transition-*`/`duration-*` utility beside it**; add the property you need
  to the ring's list instead. `motion-reduce:transition-none` is no longer needed and stays
  harmless where it is.
- `Button` — a disabled link button (`href` plus `disabled`) now keeps its `href` and gains
  `aria-disabled="true"` and `tabindex="-1"`, with navigation prevented on click. It used to drop
  the `href`, which also dropped `role="link"`, so assistive technology stopped naming the element
  exactly when the user needed to hear that it was unavailable.
- `Button` — `aria-pressed` is emitted only on a `<button>`; a `pressed` link button drops it (a
  link cannot be pressed) and warns in development. `pressed` on any variant but `outline` also
  warns: the design spec gives the toggle fill to `outline` alone, so the other variants look
  identical pressed and unpressed.
- `ButtonGroup` — the attached group raises the focused button with `z-10` inside an `isolate`
  context rather than `position: relative`. Every Button is already `relative`, so the old raise
  did nothing and the next button's 1px overlap covered the focus ring. Its inner corners and
  overlap are now logical (`rounded-s-none`, `rounded-e-none`, `-ms-px`), so a segmented control
  reads correctly in an RTL document.
- `cx` — `eldra-link-radius` (Link's focus-ring corner radius) is now registered in the `rounded`
  class group, so a consumer's `classes.root: 'rounded-full'` replaces it instead of landing
  beside it as an unmerged duplicate. A new spec,
  `src/__tests__/custom-utility-coverage.spec.ts`, parses every `@utility` out of `tailwind.css`
  and fails if any of them is not covered by the merge config, so the next custom utility cannot
  ship unregistered the same way.
- Messages — `opensInNewTab` (`en-US` "(opens in a new tab)", `is-IS` "(opnast í nýjum flipa)") is
  now parenthesised and lower-case, matching the design spec's own wording for the text a
  screen-reader appends after an external link's label.
- `Input` — single-line text entry in seven native types (`text`, `email`, `tel`, `number`,
  `search`, `url`, `password`) and three sizes (2rem / 2.5rem / 3rem). `leadingIcon` and the
  `leadingIcon` slot put a decorative icon inside the field; `clearable` (on by default for
  `type="search"`) adds a real `<button type="button">` that shows only while there is a value,
  empties the field and returns focus to it; the `suffix` slot shares the end-edge area with it.
  `invalid` sets `aria-invalid="true"` and draws the spec's 2px `danger` boundary without the value
  shifting a pixel; `describedBy`, `required`, `readonly` and `disabled` complete the states, and
  the per-part `classes` prop covers `root`, `leadingIcon`, `control`, `clearButton` and `suffix`.
  The focus ring is on the `<input>` itself and shows on *any* focus, pointer included, as the spec
  requires of text fields. `--eldra-input-radius`, `--eldra-control-font-size`,
  `--eldra-control-font-size-mobile`, `--eldra-control-line-height` and `--eldra-field-border-width`
  restyle it without touching a class.
- `Input` masks — `mask` takes a format such as `(###) ###-####` or `A#A #A#` (`#` a digit, `A` a
  letter, `*` either, everything else a separator). The field shows the formatted text while
  `v-model` stays the **raw** value, so what you submit is what you store. The engine is exported
  as `applyMask`, `stripMask` and `defaultCharacterMeaning` for the same job outside a component.
- `FIELD_KEY` / `FieldContext` — the injection key a field wrapper provides so the control inside it
  takes its `id`, `aria-describedby`, invalid and required state without any wiring. Any explicit
  prop on the control wins over it.
- `@eldrajs/ui/tailwind.css` gains `text-control{,-sm,-lg,-mobile}` (the compact-control type
  styles, on the spec's fixed 1.5rem line; `max-md:text-control-mobile` is the spec's viewport
  exception that keeps a focused field at 1rem below 48rem so iOS never zooms) and
  `eldra-field-invalid` (the second 1px line that makes a field's error boundary read as 2px).
- `cx` — `eldra-focus-always` no longer shares a class group with `eldra-focus`. It modifies the
  ring rather than replacing it, so `cx('eldra-focus eldra-focus-always')` used to collapse to
  `eldra-focus-always` alone: a `:focus` rule with no outline, infill or transition behind it. Any
  text field of your own that carries both classes now keeps both.
- Messages — `charactersLeft`, `resultsCount` and `viewAllResults` now read naturally at one
  ("1 character left", "1 result", "View 1 result"), in English and in Icelandic (which takes the
  singular for any count ending in 1 except 11).
- **The focus ring fades in instead of growing.** `eldra-focus`, `eldra-focus-always`,
  `eldra-focus-inset`, `eldra-focus-inset-always` and `eldra-focus-proxy` now draw the two-tone ring
  at its full 2px infill + 2px ring at all times and animate its opacity over `duration-base`,
  through a new registered custom property `--eldra-focus-alpha` (`@property`, `syntax: '<number>'`)
  feeding `color-mix()` into both shadow colours. Animating the geometry (an `outline-width` and a
  `box-shadow` spread from 0 to 2px) could never be smooth: browsers paint both at whole device
  pixels, so the growth had two or three frames and looked like a dropped-frame stutter. The
  resting and focused appearances are unchanged; only the arrival is. No component class changes.
  Engines without `color-mix` or without `@property` show the ring at full size with no fade, and
  forced-colours mode is unchanged (a static `outline` in the system `Highlight` colour).
  **If you restyle the ring**, note it is now one `box-shadow` pair rather than a `box-shadow` plus
  an `outline`, and `--eldra-focus-alpha` is what the `transition` list carries.
- **`Breadcrumb` — Task 8 of the "overlays, navigation, feedback" sub-project** (design spec's
  "Breadcrumb" section). A `<nav aria-label="Breadcrumb">` landmark wrapping an `<ol>`, one `<li>`
  per level: props `items` (`{ label, href? }[]`, root first — the last entry always renders as the
  current page, `<span aria-current="page">`, never a link, whatever `href` it carries), `collapseAfter`
  (default `1`, levels kept at the start), `keepLast` (default `2`, levels kept at the end), `linkAs`
  (every level link's tag/component, `Link`/`LogoItem`'s own `as` contract, named `linkAs` because
  this component's own root is spec-fixed at `<nav>` — the same reason `ContentCard`/`FeatureCard`/
  `ProductCard` use `linkAs` rather than `as`), `classes`. Parts (`data-part`): `root`, `list`,
  `item`, `link`, `current`, `separator`, `ellipsis`. No events, no slots — purely data-driven, the
  same shape `LogoItem` takes.

  The collapse (spec: "driven by the breadcrumb's own width, not the viewport") is pure CSS: a
  `@container` root plus the existing `--container-tablet` (48rem) breakpoint `Container`'s own
  gutters already use, so a middle level carries `@max-tablet:hidden` and the ellipsis carries
  `hidden @max-tablet:inline-flex` — no `ResizeObserver`, no JS width measurement. Activating the
  ellipsis (`Enter`/`Space`, native `<button type="button">` semantics — no keydown handling needed)
  sets one internal `expanded` ref that reveals every level and removes the ellipsis from the DOM
  for good, then moves focus to the first revealed link once Vue's next tick has rendered it. The
  ellipsis's accessible name is a new `showMoreLevels(n)` message ("Show 3 more levels", singular
  "Show 1 more level"); the landmark's own name is a new `breadcrumbLabel` message ("Breadcrumb"),
  both `en-US`/`is-IS`. The separator is an inline Tabler `chevron-right` SVG (`aria-hidden`), not
  text, so it is never announced. **No title is ever truncated** — the design spec is explicit
  ("Product titles are never truncated; the trail wraps") and binding over an earlier truncation
  rule in the task's own interface comment; see the README's Deviations entry. `Breadcrumb` also
  emits the spec's own `BreadcrumbList` JSON-LD from the same `items`, as a `<script type=
  "application/ld+json">` set with `v-text` (not `v-html` or `{{ }}` — see the README's Deviations
  entry for why). `README.md` gained the `Breadcrumb` Customisation row and four Deviations entries
  (no truncation, the SVG separator, the message-catalogue names and the `v-text` JSON-LD); the
  `linkAs` naming joins `ContentCard`/`FeatureCard`/`ProductCard` in the Customisation section's
  own `as`-vs-`linkAs` rule rather than getting a Deviations entry of its own. `docs/ui.md`'s
  "Navigation, overlays and feedback" list gained its line.
- **`Breadcrumb` fix: `keepLast: 0` no longer duplicates the whole trail.** `endItems` reached a
  bare `props.items.slice(-props.keepLast)`, and `Array.prototype.slice(-0)` is specified to
  behave as `slice(0)` — the whole array, not an empty one, because `-0` is not `< 0` — so the
  current page leaked into the collapsible middle as a demoted, non-current item while `endItems`
  rendered the entire trail again on top of it. Every level-count computation (`hasMiddle`,
  `startItems`, `middleItems`, `endItems`) now reads a clamped `effectiveKeepLast` (`Math.max
  (props.keepLast, 1)`) instead of the raw prop: the trail's last item is always the current page
  (see `BreadcrumbItem`'s own comment) and can never be collapsed away, so `keepLast: 0` behaves
  the same as `1` rather than losing that guarantee. New regression tests cover `keepLast: 0`,
  `collapseAfter: 0`, `collapseAfter + keepLast >= items.length`, and `keepLast > items.length`.
