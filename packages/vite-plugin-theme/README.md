# @eldrajs/vite-plugin-theme

Vite plugin for Eldra themes. Scans `blocks/*/block.json`, validates them against the manifest
schema, and emits the theme manifest plus the virtual modules a theme's runtime reads: block
components, the block manifest, per-block field projections, layout breakpoints, and generated
design-token CSS (including an optional Tailwind v4 theme layer). `./scan` exposes the scanner
standalone, used by `@eldrajs/theme-cli`'s `validate`/`types` commands.

```bash
pnpm add -D @eldrajs/vite-plugin-theme
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import eldraTheme from '@eldrajs/vite-plugin-theme';

export default defineConfig({
  plugins: [eldraTheme({ tailwind: true })],
});
```

```ts
// scan a theme directory directly
import { scanTheme } from '@eldrajs/vite-plugin-theme/scan';

const { manifest, errors } = scanTheme({ themeDir: '.', framework: 'nuxt' });
```

See [docs/themes.md](../../docs/themes.md) for the full theme integration guide.
