# Getting started

You need one thing from your Eldra organisation: its **organisation id**. It is on the General
settings page in Studio. Everything a storefront reads is public data for that organisation, so
there is no API key.

```bash
pnpm add @eldra-is/sdk
```

```ts
import { createEldraClient } from '@eldra-is/sdk';

const eldra = createEldraClient({ orgId: process.env.ELDRA_ORG_ID! });

const { data: products } = await eldra.catalog.listProducts();
const product = await eldra.catalog.getProduct(products![0].id);
```

The client is plain `fetch`. It runs in a browser, in Node, in a server-rendered request, in an
edge function. Create it once per app, or once per request on the server — it holds no state beyond
its options.

## Where it points

By default at `https://web.eldra.app/api`. For staging or local development pass `apiBaseUrl`:

```ts
createEldraClient({ orgId, apiBaseUrl: 'https://web.staging.eldra.app/api' });
```

Every option can also be a function, so a server-rendered app can read environment at request time:

```ts
createEldraClient({ orgId: () => useRuntimeConfig().public.eldraOrgId });
```

## Browsers and origins

The API answers a browser only from an origin the organisation has registered — Studio, General
settings, _Storefront origins_. Add `http://localhost:3000` (or whichever port) while developing;
a request from an unregistered origin fails with `ORIGIN_NOT_REGISTERED`. Server-side calls are
not subject to this.

## What the client covers

| Group       | Methods                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `catalog`   | `listProducts`, `getProduct`, `listCategories`, `listCollections`, `getCollection`, `listCollectionProducts`, `search` |
| `cms`       | `list`, `get`, `getByUniqueField`, `resolveEntryList` — typed by the generator below                                   |
| `cart`      | `addItem` (creates the cart when there is none), `get`, `updateItem`, `removeItem`, `applyDiscount`, `removeDiscount`  |
| `checkout`  | `handoffUrl({ cartId, locale })` — the hosted checkout takes it from there                                             |
| `orders`    | `get(orderId, { accessToken })`, `recover(token)`                                                                      |
| `inventory` | `availability`                                                                                                         |
| `features`  | the organisation's enabled features                                                                                    |

Totals come from the server. The cart's `totals` are the truth; never sum lines in the storefront.

## Types

Every response is typed from the public contract, a versioned OpenAPI document snapshotted into
the package. `ELDRA_CONTRACT_VERSION` tells you which. For any path not wrapped by a method:

```ts
import type { EldraContractResponse } from '@eldra-is/sdk';
type Categories = EldraContractResponse<'/catalog/v1/categories', 'get'>;
```

The contract follows semver: a minor bump adds, a major bump changes or removes. The SDK's
`CHANGELOG.md` names the snapshot each release carries.

## Generated CMS types

Schemas are yours, so their types cannot ship in the package. The Vite plugin generates them at
build time from the organisation's schemas:

```ts
// vite.config.ts or nuxt.config.ts
import { eldraCms } from '@eldra-is/sdk/vite';

export default defineConfig({
  plugins: [eldraCms({ orgId: process.env.ELDRA_ORG_ID })],
});
```

It writes `.eldra/web-studio/` with a typed `client.ts` wrapper, so `eldra.cms.get('page', id)`
knows the fields of `page`. Commit or ignore that folder as you prefer; regenerate when a schema
changes.

## Rich text

CMS rich text fields hold a TipTap document. Render it with `RichText` from `@eldra-is/vue`, or
to an HTML string with `toHtml` from `@eldra-is/rich-text` in any framework. See
[rich-text.md](./rich-text.md).

## Persisting the cart

`createCartSession()` keeps the cart id in `localStorage`, `createOrderAccessTokens()` keeps order
tokens in `sessionStorage`; both take an injectable storage and never throw where storage is
unavailable. The server may forget a cart; on `CART_NOT_FOUND`, drop the stored id and start a new
cart.

## Errors

Every failed request throws `EldraHttpError` with `status` and `code` — the gateway's problem code
such as `INSUFFICIENT_STOCK` or `CART_DISCOUNT_EXHAUSTED`. Branch on `code`, not on the message.
