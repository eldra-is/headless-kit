# Eldra headless kit

Packages for building a storefront on the [Eldra Web Studio](https://eldra.is) public API, in any
framework.

| Package                                    | What it is                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@eldrajs/sdk`](packages/sdk)             | Client for CMS, catalog, cart, checkout handoff, orders and inventory. Framework-free; types generated from the versioned public contract. |
| [`@eldrajs/rich-text`](packages/rich-text) | Framework-free rendering of CMS rich text: the document types, plain-text extraction, an escaping `toHtml`, embed normalisation.           |
| [`@eldrajs/vue`](packages/vue)             | Vue 3 components: the `RichText` renderer with per-node and per-mark overrides.                                                            |

```bash
pnpm add @eldrajs/sdk
```

```ts
import { createEldraClient } from '@eldrajs/sdk';

const eldra = createEldraClient({ orgId: 'your-organisation-id' });
const { data: products } = await eldra.catalog.listProducts();
```

Start with [docs/getting-started.md](docs/getting-started.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md).

MIT licensed — see [LICENSE](LICENSE).
