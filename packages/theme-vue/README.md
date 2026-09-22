# @eldrajs/theme-vue

Vue 3 bindings for the Eldra theme SDK: `EldraBlockZone` and `EldraLayout` render a page's block
tree, `EldraRichText` renders a rich-text document, and `useEldra`/`provideEldra` share the entry
context down the component tree. `useEldraPreview`/`startEldraPreview` wire a theme up to the
Studio page-builder preview — live block edits, breakpoint switching, design tokens and the
in-place overlay — over `@eldrajs/theme-core`'s bridge. It imports only `vue` and
`@eldrajs/theme-core`.

```bash
pnpm add @eldrajs/theme-vue
```

## Usage

```ts
import { createApp } from 'vue';
import { EldraBlockZone, provideEldra } from '@eldrajs/theme-vue';

const app = createApp({
  setup() {
    provideEldra({ entry, client });
  },
});
```

`EldraBlockZone`/`EldraLayout` resolve block components from the `virtual:eldra/blocks` module
that `@eldrajs/vite-plugin-theme` generates at build time — this package never bundles a stub for
it, so it must be consumed through the Vite plugin.

See [docs/themes.md](../../docs/themes.md) for the full theme integration guide.
