# `@eldrajs/ui`

Accessible Vue 3 core components for Eldra storefronts, themed through CSS design tokens.

Work in progress; see plan.

The components are built to `eldra-starter-spec/01-core-components.md` (WCAG 2.2 AA). Where this
package adds something the spec's property tables do not list, it is recorded below rather than
left for a reader to find.

## Deviations

Additions and departures from the design spec, and why.

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
- **`Button` touch growth is the primary action's.** "Only primary action buttons grow to
  `target-touch` (2.75rem)" below a 48rem container, so an `md` `primary` button grows and a
  secondary, outline, ghost or danger action beside it keeps the 2.5rem control height it shares
  with the inputs.
