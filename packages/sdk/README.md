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

## What is in the client

| Group       | Methods                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `catalog`   | `listProducts`, `getProduct`, `listCategories`, `listCollections`, `getCollection`, `listCollectionProducts`, `search` |
| `cms`       | `list`, `get`, `getEntryByUniqueField`, `resolveEntryList`                                                             |
| `cart`      | `addItem`, `get`, `updateItem`, `removeItem`, `applyDiscount`, `removeDiscount`                                        |
| `checkout`  | `url`                                                                                                                  |
| `orders`    | `get`, `recover`                                                                                                       |
| `inventory` | `availability`                                                                                                         |
| `features`  | `getOrganization`, `list`, `isEnabled`, `getCapabilities`, `getCommerce`                                               |
| `platform`  | `config`                                                                                                               |

`checkout.url({ cartId, locale })` is where a storefront sends the shopper. The platform hosts the
checkout page, so the client asks the platform where (`platform.config()`, a public read cached per
client instance, sent without the organisation header because the route takes none) and returns
`{checkoutUrl}/checkout/{orgId}/{cartId}`. It rejects — with a different message for each cause, and
the read failure as `cause` where there was one — when the platform published no checkout URL, when
the config could not be read, and when what was published is not an absolute `http(s)` URL. A
storefront should treat all three as "no Check out to show" rather than something to report to a
shopper.

`features.getCommerce()` answers what the store sells in — `{ currency, taxInclusivePricing,
defaultTaxRate }` — or `null` when the organisation publishes no commerce settings, which is the
honest answer for a store that has not configured any: a storefront can then render a price as a
number rather than under a currency symbol nobody chose. It reads the same organisation document the
rest of the group reads, so a caller already holding an `EldraOrganizationDetails` should take
`commerce` off it instead of asking again.

## Retrying what the gateway refused for now

The gateway rate-limits a client by requests per minute, so a static build of a real catalogue —
thousands of reads from one address in a few minutes — meets that limit routinely. A `429` is not an
answer, and neither is a `503` while the gateway restarts or a connection the network drops, so the
client asks again: **idempotent requests only** (`GET`/`HEAD`/`OPTIONS` — a `POST` that timed out may
well have been applied), at most five attempts including the first, honouring `Retry-After` (seconds
or HTTP-date, up to a minute) and otherwise waiting 250 ms doubled per attempt, capped at 5 s, with
jitter. Every other status — a `404`, a `422`, a `401` — is returned on the first answer, as before.
The caller's `AbortSignal` ends it immediately, during a wait as much as during a request.

```ts
const eldra = createEldraClient({
  orgId: 'your-organisation-id',
  retry: { attempts: 5, baseDelayMs: 250, maxDelayMs: 5000 }, // the defaults
});

// One request, no waiting:
createEldraClient({ orgId: 'your-organisation-id', retry: { attempts: 0 } });
```

A consumer-supplied `httpClient` replaces the transport, so the retry is that client's own.

Every failed request throws `EldraHttpError` with `status`, the problem's category `code` (such as
`NOT_FOUND`) and its specific `errorId` (such as `CART_NOT_FOUND`); branch on `errorId`.
`createCartSession` and `createOrderAccessTokens` persist the cart id and order tokens without
throwing where storage is unavailable.
