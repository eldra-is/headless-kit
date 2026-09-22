# Design tokens

Theme `tokens.json` is the framework-neutral source of color tokens and layout container presets. New themes use descriptor catalogs with the required `narrow`, `content`, `wide`, and `full` containers. CMS values contain token ids or validated custom colors, never CSS variable names or utility classes.

`@eldrajs/vite-plugin-theme` exposes two CSS entries:

- `virtual:eldra/tokens.css` emits the generic `--eldra-color-*` and `--eldra-container-*` variables. `@eldrajs/theme-nuxt` imports this entry automatically.
- `virtual:eldra/tailwind-theme.css` is opt-in. Configure `eldraTheme({ tailwind: true })`, then import the virtual CSS from the application entry. The module imports Tailwind v4 and emits top-level `@theme static` `--color-*` variables backed by the generic Eldra variables.

```ts
import 'virtual:eldra/tailwind-theme.css';
```

Nuxt themes can instead set `eldra.tailwind: true`; the module adds the virtual CSS entry automatically.

Literal theme-source classes such as `bg-brand-primary`, `text-brand-primary`, and `border-brand-primary` then compile normally. Do not build class names from CMS values and do not add CMS content as a Tailwind source. Set `tailwind: false` (the default) for non-Tailwind themes. Enabling the adapter without `tailwindcss` major 4 fails the build with an actionable error.

Vue's `EldraLayout` accepts the resolved catalog through its `designTokens` prop or the provided Eldra context. It emits nonce-compatible generic token CSS and validates every referenced container id before rendering. Explicit responsive width, maximum width, margin, and padding values override the corresponding preset declarations at each breakpoint.

Live Studio updates are accepted only through the versioned bridge after the theme advertises the `design-tokens` capability. The runtime validates the complete bounded resolved catalog before atomically replacing the prior catalog; stale or malformed updates are ignored.
