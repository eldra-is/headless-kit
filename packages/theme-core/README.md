# @eldrajs/theme-core

Framework-free core of the Eldra theme SDK: the client that talks to the Studio gateway, stega
encoding/decoding for the visual editor, the overlay runtime that drives in-place editing, layout
CSS, rich-text position mapping, design tokens and image framing. It imports no framework — no
Vue, no Nuxt, no DOM library — so any framework binding (`@eldrajs/theme-vue`, a future React
binding, …) can be built on top of it. The Studio &lt;-&gt; theme postMessage protocol lives at
the `./bridge` subpath, alongside `./stega`, `./overlay`, `./preview-router`, `./layout`,
`./dynamic-route`, `./template-layout`, `./reusable`, `./design-tokens` and `./image-framing`.

```bash
pnpm add @eldrajs/theme-core
```

## Usage

```ts
import { createEldraClient, stripStega } from '@eldrajs/theme-core';

const client = createEldraClient({ gatewayUrl: 'https://api.example.com', orgId: 'org_123' });
const page = await client.getEntry('page', 'home');
const title = stripStega(page.data.title);
```

See [docs/themes.md](../../docs/themes.md) for the full theme integration guide.
