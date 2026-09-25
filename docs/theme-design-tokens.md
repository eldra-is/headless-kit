# Design tokens

Theme `tokens.json` is the framework-neutral source of color tokens and layout container presets. New themes use descriptor catalogs with the required `narrow`, `content`, `wide`, and `full` containers. CMS values contain token ids or validated custom colors, never CSS variable names or utility classes.

`@eldrajs/vite-plugin-theme` exposes two CSS entries:

- `virtual:eldra/tokens.css` emits the generic `--eldra-color-*` and `--eldra-container-*` variables. `@eldrajs/theme-nuxt` imports this entry automatically.
- `virtual:eldra/tailwind-theme.css` is opt-in. Configure `eldraTheme({ tailwind: true })`. The module imports Tailwind v4 and emits top-level `@theme static` `--color-*` variables backed by the generic Eldra variables.

**A JS-level side-effect import of that virtual id works:**

```ts
import 'virtual:eldra/tailwind-theme.css';
```

`packages/vite-plugin-theme/src/__tests__/plugin.spec.ts`'s Tailwind test does exactly this, from a
`.ts` entry, and passes — `vite-plugin-theme`'s `resolveId` hook resolves the bare id normally
through Vite's plugin chain.

**A CSS-level `@import` of the same id does not work, and this is not theme-specific.** Verified
with a real `nuxi generate` against `examples/starter-nuxt` (see the starter-kit foundations
project's Task 1 report): `@tailwindcss/vite` resolves every `@import` inside a CSS file with its
own filesystem resolver (`enhanced-resolve`), not through Vite's `resolveId` plugin chain, so it
never reaches `vite-plugin-theme`'s hook that maps the bare id to the resolved virtual module. A
theme whose CSS entry starts with

```css
@import 'virtual:eldra/tailwind-theme.css';
```

fails the build with `Error: Can't resolve 'virtual:eldra/tailwind-theme.css'`. This matters in
practice because a real theme almost always wants to combine the adapter's color variables with its
own hand-authored `@theme` extension (fonts, radii, shadows) and `@layer base` rules in **one** CSS
file — and Nuxt's `css: [...]` array only accepts CSS files, so the JS-level import above is not an
option there either. A second CSS entry carrying only the `@theme` extension does not work as a
workaround: Tailwind v4 treats each file containing `@import "tailwindcss"` as its own independent
build root, so a sibling file's `@theme` block is never merged into it.

**The fallback every theme should use instead:** keep `eldra.tailwind: false` (the default) and
author the CSS entry as a single self-contained Tailwind root —

```css
@import 'tailwindcss';

@theme static {
  --color-primary: var(--eldra-color-primary);
  /* … one line per color token in tokens.json … */
}

@theme {
  /* the theme's own font/radius/shadow/spacing extension */
}
```

register `@tailwindcss/vite` directly in the theme's own Vite config (the adapter asserts
`tailwindcss@4.x` is installed when `tailwind: true`, but never registers the actual transform
plugin itself — every consumer must add `vite: { plugins: [tailwindcss()] }`), and keep the
generated `@theme static` color block in sync with `tokens.json` with a small script checked in CI.
`--eldra-color-*` custom properties are available regardless of the `tailwind` option (`theme-nuxt`
always imports `virtual:eldra/tokens.css`), so the generated block's `var(--eldra-color-<id>)`
references resolve either way.

**A theme on `@eldrajs/ui` writes no generated block at all**, which is what the starter now does:
`@import '@eldrajs/ui/tailwind.css'` after `@import 'tailwindcss'` brings the whole `@theme`
mapping with it (`--color-<role>: var(--eldra-color-<role>)` for every role, plus radii, shadows,
fonts and the package's utilities), and unlike the virtual module it is an ordinary `node_modules`
file Tailwind's CSS resolver finds. The theme's `tokens.json` ids and the package's role names are
then the same set, so no sync script can drift. One ordering rule replaces it: the package's
defaults must come _before_ `virtual:eldra/tokens.css`, or the package's values would win over the
theme's own. See [`docs/starter-kit.md`](starter-kit.md) and
`examples/starter-nuxt/app/assets/main.css` for the starter's exact version of this.

Literal theme-source classes such as `bg-primary`, `text-muted`, and `border-border` then compile
normally. Do not build class names from CMS values and do not add CMS content as a Tailwind source.
Enabling the adapter (`tailwind: true`) without `tailwindcss` major 4 installed fails the build with
an actionable error.

Vue's `EldraLayout` accepts the resolved catalog through its `designTokens` prop or the provided Eldra context. It emits nonce-compatible generic token CSS and validates every referenced container id before rendering. Explicit responsive width, maximum width, margin, and padding values override the corresponding preset declarations at each breakpoint.

Live Studio updates are accepted only through the versioned bridge after the theme advertises the `design-tokens` capability. The runtime validates the complete bounded resolved catalog before atomically replacing the prior catalog; stale or malformed updates are ignored.
