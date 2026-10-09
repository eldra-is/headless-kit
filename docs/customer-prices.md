# Customer prices

A signed-in business customer (see [business-login.md](business-login.md)) can get their own
prices from the same catalog and cart calls. The types come from the generated contract (2.17.0):
priced variants add an optional `listPrice`, and list items carry the customer's `minPrice` and
`maxPrice` plus `listPrice`, the list price of the variant `minPrice` came from.

## Calls

Server-side only. Pass the access token, and the active company when the person has more than
one, in `context.headers` of each call:

```ts
import { customerHeaders } from '@eldrajs/sdk';

const headers = customerHeaders(session.accessToken, session.customerId);
const products = await eldra.catalog.listProducts({ limit: 20 }, { headers });
const product = await eldra.catalog.getProduct(id, undefined, { headers });
const cart = await eldra.cart.addItem(input, { headers });
```

A type-checked version is [examples/node-script/customer-prices.ts](../examples/node-script/customer-prices.ts).

`customerHeaders(token)` is `bearer(token)`; with a company id it adds `X-Customer-Id`. Without
`X-Customer-Id` the gateway uses the person's only company, or answers 409 `SHOP_CUSTOMER_REQUIRED`.
`X-Org-Id` must be the organization's UUID, never an alias: the gateway refuses an alias with a shop
token as `SHOP_TOKEN_INVALID`, on priced reads and cart writes alike (build the client with `orgId`).
Never send the token from the browser, and never send an `Authorization` header without a token:
leave `headers` out for a guest.

## Showing prices

`price` is what this customer pays. When `listPrice` is present, show it struck through next to
`price`. `compareAtPrice` is absent on priced responses; `listPrice` takes its place. Sort order
stays by list price. Search results (`catalog.search`) are always list prices.

## Caching

Priced responses are `Cache-Control: private, no-store` and `Vary: Authorization, X-Customer-Id`.
Never cache them (CDN, `fetch` cache, Nitro route cache) and never render them statically or
prerender them; render signed-in pages dynamically with `no-store` too.

## Cart binding

A write with a signed-in token binds an unbound cart to that customer, reprices every line and
drops the cart's discount code. A cart a signed-in buyer creates is bound from the start. Every
cart answer, a guest's too, is `Cache-Control: private, no-store`.

**Remember the binding yourself.** The web cart never says which customer it is bound to. Store
the customer id beside the cart id. When the buyer changes company, signs out, or loses business
login (session ended, B2B off), move the cart: create a new cart under the new identity and replay
the old cart's lines through `addItem`, then keep the new cart id. The starter's cart code is the
reference implementation.

- Signed-in write, or read, of a cart bound to another customer: 409 `CART_CUSTOMER_MISMATCH`.
- Guest write to a bound cart: 409 `CART_SIGN_IN_REQUIRED`, except `removeItem`, which a guest may
  do. Adding, changing a quantity and the discount routes need the signed-in buyer. A guest read by
  cart id stays open.
- Discount codes do not combine with customer prices: 409 `CART_DISCOUNT_NOT_FOR_CUSTOMER_PRICES`.
- Price service down: 503 `CART_PRICES_UNAVAILABLE` (nothing was saved; retry).
- B2B switched off: cart writes on a bound cart are 409 `CART_CUSTOMER_PRICES_OFF`, and order
  create and preview are 409 `ORDER_CUSTOMER_PRICES_OFF`. Move the basket to a guest cart.

## Errors on priced reads

| Status | Code                                                    | Meaning                                            |
| ------ | ------------------------------------------------------- | -------------------------------------------------- |
| 401    | `SHOP_TOKEN_INVALID`                                    | Token expired or invalid: refresh or sign in again |
| 403    | `SHOP_NO_MEMBERSHIP`, `SHOP_CUSTOMER_NOT_MEMBER`        | No company, or not the active company's member     |
| 403    | `FEATURE_DISABLED`                                      | B2B is off for the organization                    |
| 409    | `SHOP_CUSTOMER_REQUIRED`                                | Several companies and no `X-Customer-Id`           |
| 503    | `SHOP_LOGIN_UNAVAILABLE`, `CUSTOMER_PRICES_UNAVAILABLE` | Retry; do not fall back to list price silently     |

A failure never falls back to list prices. When B2B is off, a signed-in request gets
`FEATURE_DISABLED`: drop the session and continue as a guest.
