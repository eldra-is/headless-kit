# Eldra headless kit

Packages for building a storefront on the [Eldra Web Studio](https://eldra.is) public API, in any
framework.

| Package                                    | What it is                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`@eldrajs/sdk`](packages/sdk)             | Client for CMS, catalog, cart, checkout handoff, orders and inventory. Framework-free; types generated from your gateway at build time. |
| [`@eldrajs/rich-text`](packages/rich-text) | Framework-free rendering of CMS rich text: the document types, plain-text extraction, an escaping `toHtml`, embed normalisation.        |
| [`@eldrajs/vue`](packages/vue)             | Vue 3 components: the `RichText` renderer with per-node and per-mark overrides, and `EldraImage` for responsive media.                  |

```bash
pnpm add @eldrajs/sdk
```

```ts
import { createEldraClient } from '@eldrajs/sdk';

const eldra = createEldraClient({ orgId: 'your-organisation-id' });
const { data: products } = await eldra.catalog.listProducts();
```

Start with [docs/getting-started.md](docs/getting-started.md); for images, [docs/images.md](docs/images.md); for business-customer sign-in, [docs/business-login.md](docs/business-login.md); for customer prices, [docs/customer-prices.md](docs/customer-prices.md); for orders on account, [docs/sales-orders.md](docs/sales-orders.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md).

MIT licensed — see [LICENSE](LICENSE).
