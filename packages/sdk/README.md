# @eldrajs/sdk

The client for the Eldra Web Studio public storefront API: CMS, catalog, cart, checkout handoff,
orders, inventory. Framework-free — plain `fetch`, runs in a browser, in Node, in SSR, at the edge.

```bash
pnpm add @eldrajs/sdk
```

```ts
import { createEldraClient } from '@eldrajs/sdk';

const eldra = createEldraClient({ orgId: 'your-organisation-id' });
const { data } = await eldra.catalog.listProducts();
```

## Types come from your gateway

The package ships no response types. Add the Vite plugin and they are generated into your project
on every dev start and build, from the gateway you point at:

```ts
import { eldra } from '@eldrajs/sdk/vite';

export default defineConfig({
  plugins: [eldra({ orgId: process.env.ELDRA_ORG_ID })],
});
```

That writes `.eldra/web-studio/` — your CMS schemas as types, the gateway's API contract as types,
and a typed client wrapper — and from then on `eldra.cart.get(id)` returns the cart your gateway
actually returns. Commit the folder; it is what your CI type-checks against, and the diff is how
you see the API change. Without the plugin, responses are `unknown` and you name the type at the
call site.

The full walkthrough is [docs/getting-started.md](../../docs/getting-started.md).

## Preview mode

Both `createEldraClient` and the Vite plugin accept `previewToken` as a string or callback and send
it as `X-Preview-Token`. Configure each separately; the generator never embeds the token in its
output. See [preview mode](../../docs/getting-started.md#preview-mode) for examples and header
precedence.

## Images

A media URL from the API serves an 800 px copy. Build a `srcset` over the sizes the media host
serves (400 to 2560 px) so the browser picks one that is sharp on the screen in front of it:

```ts
import { responsiveImage } from '@eldrajs/sdk';

const image = responsiveImage(product.thumbnail, {
  sizes: '(min-width: 1024px) 25vw, 50vw', // how wide the image is drawn
  aspectRatio: 4 / 5, // reserves the space: width="800" height="1000"
});
// spread onto <img>: { src, srcset, sizes, width, height }
```

`imageSrcset`, `imageUrl(source, 'xl')` and `imageVariantFor(width, density)` are there for the
parts on their own. Anything that is not an Eldra media asset comes back unchanged. The variants,
choosing `sizes`, and avoiding layout shift are in [docs/images.md](../../docs/images.md).

## What is in the client

| Group       | Methods                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `catalog`   | `listProducts`, `getProduct`, `listCategories`, `listCollections`, `getCollection`, `listCollectionProducts`, `search` |
| `cms`       | `list`, `get`, `getEntryByUniqueField`, `resolveEntryList`                                                             |
| `cart`      | `addItem`, `get`, `updateItem`, `removeItem`, `applyDiscount`, `removeDiscount`                                        |
| `checkout`  | `handoffUrl`                                                                                                           |
| `orders`    | `get`, `recover`                                                                                                       |
| `inventory` | `availability`                                                                                                         |
| `features`  | `getOrganization`, `list`, `isEnabled`, `getCapabilities`                                                              |

Every failed request throws `EldraHttpError` with `status`, the problem's category `code` (such as
`NOT_FOUND`) and its specific `errorId` (such as `CART_NOT_FOUND`); branch on `errorId`.
`createCartSession` and `createOrderAccessTokens` persist the cart id and order tokens without
throwing where storage is unavailable.
