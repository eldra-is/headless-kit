# Getting started

You need one thing from your Eldra organisation: its **organisation id**. It is on the General
settings page in Studio. Everything a storefront reads is public data for that organisation, so
there is no API key.

```bash
pnpm add @eldrajs/sdk
```

```ts
import { createEldraClient } from '@eldrajs/sdk';

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

## Preview mode

Pass `previewToken` to read CMS content using a preview token. It accepts a string or a callback
resolved for each request. For a server-side client:

```ts
const eldra = createEldraClient({
  orgId: process.env.ELDRA_ORG_ID,
  previewToken: () => process.env.ELDRA_PREVIEW_TOKEN,
});
```

A non-empty token sets `X-Preview-Token` on SDK requests, overriding that header in client or
request-context headers. Returning `undefined` or an empty string stops setting the header;
without a custom preview header, requests use the normal published-content behavior. Explicit
custom headers are preserved when `previewToken` is unset. The SDK does not discover a preview
token from environment variables automatically.

The Vite plugin accepts the same option separately:

```ts
eldra({
  orgId: process.env.ELDRA_ORG_ID,
  previewToken: () => process.env.ELDRA_PREVIEW_TOKEN,
});
```

It sends the header when fetching both CMS types and the gateway contract. It does not put the
token in request URLs or generated files, and configuring it on the plugin does not configure
runtime clients. Keep preview tokens in the preview session or server configuration, rather than
public environment variables or committed generated code. See the type-checked
[preview example](../examples/node-script/preview.ts).

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

## Generated types

The SDK ships with no response types. They come from **your gateway**, generated into your project
by the Vite plugin on every dev start and build:

```ts
// vite.config.ts or nuxt.config.ts
import { eldra } from '@eldrajs/sdk/vite';

export default defineConfig({
  plugins: [eldra({ orgId: process.env.ELDRA_ORG_ID })],
});
```

It writes `.eldra/web-studio/`:

- `cms-types.ts` — your organisation's CMS schemas, so `eldra.cms.list('page')` knows the fields
  of `page`.
- `contract.ts` — the gateway's own API (cart, orders, catalog, checkout, inventory), from
  `/api/public/openapi.json`. It fills the SDK's `EldraContract` in, so every method — `cart.get`,
  `catalog.listProducts`, `orders.recover` — is typed against exactly the gateway you point at.
  Staging gives you staging's contract; production, production's.
- `client.ts` and `index.ts` — a `WebStudioClient` wrapper with the CMS types applied.

The folder is written beside the nearest `package.json` — the project root, even where the Vite
root is a subfolder, as it is in Nuxt (`app/`). A relative `outDir` is resolved against the same
place.

**Commit the folder.** It then exists without a running gateway: CI type-checks against what was
last generated and reviewed, and when the backend changes the diff shows in the pull request. A
fetch that fails at dev start leaves the previous file in place and shows as a build warning saying
what was skipped and why — a wrong URL or an unknown organisation id is a warning, never an error.
Keep the folder whole: `index.ts` re-exports the other files, so delete all of it or none.

### Nuxt

Nuxt copies `typescript.tsConfig.include` entries verbatim into `.nuxt/tsconfig*.json`, so the
path is relative to `.nuxt/`, not to the project:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vite: { plugins: [eldra({ orgId: process.env.ELDRA_ORG_ID })] },
  typescript: { tsConfig: { include: ['../.eldra/**/*.ts'] } },
});
```

Without that include the generated `contract.ts` is not in the type-check program, nothing
augments `EldraContract`, and every response is `unknown` — the same as having no plugin at all,
which is what makes it easy to miss. Importing anything from `.eldra/web-studio` also pulls it in.

Without the plugin — a Node script, a framework the plugin does not cover yet — responses are
`unknown` and you name the type at the call site:

```ts
const products = await eldra.catalog.listProducts<{ data: { title: string }[] | null }>();
```

For any path the client does not wrap by name, once generated:

```ts
import type { EldraContractResponse } from '@eldrajs/sdk';
type Categories = EldraContractResponse<'/catalog/v1/categories', 'get'>;
```

The gateway's contract is versioned by semver — a minor bump adds, a major bump changes or removes —
and the generated `ELDRA_CONTRACT_VERSION` says which one you built against.

## Rich text

CMS rich text fields hold a TipTap document. Render it with `RichText` from `@eldrajs/vue`, or
to an HTML string with `toHtml` from `@eldrajs/rich-text` in any framework. See
[rich-text.md](./rich-text.md).

## Persisting the cart

`createCartSession()` keeps the cart id in `localStorage`, `createOrderAccessTokens()` keeps order
tokens in `sessionStorage`; both take an injectable storage and never throw where storage is
unavailable. The server may forget a cart; when a request fails with `errorId` `CART_NOT_FOUND`,
drop the stored id and start a new cart.

## Errors

Every failed request throws `EldraHttpError` with `status`, `code` and `errorId` from the gateway's
problem body. `code` is the category, such as `NOT_FOUND` or `CONFLICT`; `errorId` is the specific
reason, such as `CART_NOT_FOUND`, `CART_INSUFFICIENT_STOCK` or `CART_DISCOUNT_EXHAUSTED`, and
equals `code` when the gateway has nothing more specific to say. Branch on `errorId`, not on the
message; the [node script example](../examples/node-script/index.ts) prints both.
