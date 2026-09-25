# UI components

`@eldrajs/ui` is a public, MIT-licensed Vue 3 component library for Eldra storefronts: accessible
(WCAG 2.2 AA) actions, forms, and — as later sub-projects land — display, commerce, overlay and
navigation components, themed entirely through CSS design tokens rather than a fixed look. It has
no dependency on Studio, a theme, or any other package in this kit; any Vue 3 project can install
it on its own.

```bash
pnpm add @eldrajs/ui vue
```

Components are exported unprefixed from the root entry (`Button`, `Select`, …) and are not
registered globally — import what you use, or opt into `<EldraButton>`-style auto-imports with the
`@eldrajs/ui/resolver` entry for
[`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components).

## Styles

Pick one of three CSS entries, depending on how the consuming project builds CSS:

- `@eldrajs/ui/tokens.css` — the `--eldra-*` design token variables only.
- `@eldrajs/ui/tailwind.css` — the tokens plus a Tailwind v4 `@theme` block and the package's own
  utilities, for a project that runs Tailwind v4 itself:

  ```css
  @import 'tailwindcss';
  @import '@eldrajs/ui/tailwind.css';
  ```

- `@eldrajs/ui/style.css` — the package's own compiled stylesheet, for a project with no Tailwind
  build of its own:

  ```css
  @import '@eldrajs/ui/style.css';
  ```

## Forms

The form components are validation-agnostic: `FieldWrapper` takes an `error` string, `Input` takes
`invalid`, and where those come from is the consuming project's business. For projects that use
[vee-validate](https://vee-validate.logaretm.com/v4/), the optional `@eldrajs/ui/vee-validate` entry
ships `Form` (over `useForm` and `FormLayout`) and eleven `Field*` components (over `useField`).
`vee-validate ^4.12` is an optional peer; nothing else in the package imports it.

```vue
<Form :validation-schema="schema" @submit="send">
  <template #default="{ errors }">
    <FieldWrapper label="Email address" required :error="errors.email">
      <FieldInput name="email" type="email" autocomplete="email" />
    </FieldWrapper>
  </template>
  <template #actions>
    <Button variant="primary" type="submit">Subscribe</Button>
  </template>
</Form>
```

## More

- [`packages/ui/README.md`](../packages/ui/README.md) — the full reference: install, fonts,
  customisation (tokens, per-component CSS variables, `classes`, slots, `as`), messages and
  localisation, the composables (`useFloating`, `useOverlay`, `useListbox`), the
  `EldraUiResolver`, the `./vee-validate` entry, the accessibility/testing protocol every
  component ships, and every recorded deviation from the design spec.
- Storybook — one story per component state, screenshot-tested against committed baselines. Run it
  locally with `pnpm --filter @eldrajs/ui storybook`, or build it with
  `pnpm --filter @eldrajs/ui build-storybook`.
