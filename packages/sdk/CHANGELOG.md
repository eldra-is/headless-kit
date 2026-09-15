# Web Studio SDK changelog

`@eldrajs/sdk` is its own package from 0.1.0; entries before that are the versions of
`@eldra-is/vue-ui-components`, where it shipped as the `./sdk` and `./sdk/vite` entry points. This file is
hand-maintained: every change a consumer of the SDK can see gets a line under Unreleased in the same
change, naming the contract version when the contract moved. Release-please writes `RELEASE-NOTES.md`
from commit messages and does not describe the SDK. The contract's own history is `CONTRACT.md` in the
platform repository.

## Unreleased

- The Vite plugin writes `.eldra/web-studio/` beside the nearest `package.json` instead of Vite's
  root; on Nuxt 4 the root is `app/`, and the folder landed there. A relative `outDir` is resolved
  the same way.
- A fetch the plugin skips — gateway down, unknown organisation id, wrong URL — is now a build
  warning naming what was skipped and why; it was silent. `generateEldraFiles` returns what it
  wrote and what it skipped.

## 0.2.0 — 2026-09-16

- **Breaking.** The SDK no longer ships response types. The Vite plugin — now `eldra()`, was
  `eldraCms()` — generates `contract.ts` from your gateway's `/api/public/openapi.json` next to the
  CMS types, and it augments the SDK's `EldraContract` so every method is typed against the gateway
  you build against. Without it, responses are `unknown` and request bodies and queries are plain
  objects; name the type at the call site. `ELDRA_CONTRACT_VERSION` moved into the generated file.
  `openapi-typescript` is a dependency of the `./vite` entry.

## 0.1.0 — 2026-09-15

- Contract snapshot 2.4.0. `inventory.availability` items no longer need a `locationId`: `EldraStockAvailabilityInput.locationId` is optional, and an omitted one is answered by the organisation's default inventory location, the same resolution the cart's reservation uses; the response still names the location that answered. A storefront needs no location id in its configuration any more.
- Contract snapshot 2.3.0. `PUT /shopping-cart/v1/cart/{cartID}/discount` refuses a code whose redemption limit is reached with 409 `CART_DISCOUNT_EXHAUSTED`, distinguishable from the 404 every other refusal keeps; a code that runs out while on a cart stops reducing it on the next read. No path or field changed, so no type changed; `ELDRA_CONTRACT_VERSION` is the only visible difference.
- Contract snapshot 2.2.0. The gateway renamed the thirty schemas whose names began with `._`: `._WebCart` is now `shoppingcartweb_WebCart`, `._CreateOrderResponse` is `orderweb_CreateOrderResponse`, `._OrderResponse` is `orderweb_OrderResponse`, `._PayOrderInBody` is `PayOrderInBody`, and the duplicated `._CollectionItem` and `._WebGuestBooking` folded into `dto_CollectionItem` and `handler_WebGuestBooking`. Nothing on the wire changed. The SDK's exported types (`EldraCart`, `EldraOrder`, `EldraContractPaths`, …) are derived from paths and resolve to the same shapes; only code that imports `contract/v1.ts` directly and names a schema sees the new names.

## 1.67.0 — 2026-09-10

- Contract snapshot 2.1.0 (6bae4dc). `orders.recover` now also answers `cartId`, absent when nothing could be added, and `unavailable`, the lines the shop no longer sells; orders carry `recoveredFromOrderId`; the organisation's settings carry `checkoutRecoveryUrl`.

## 1.66.1 — 2026-09-09

- Contract snapshot 2.0.0 (ddfbe5c). `POST /payment/v1/pay-order/{orderId}` requires the `X-Order-Token` header, the only type change; the SDK does not call that route, the hosted checkout does. The contract's behavioural changes in 2.0.0 (request limits on order creation, `ORDER_IDEMPOTENCY_CONFLICT`, `CART_NOT_FOUND` for an unknown `cartId`, `CART_DISCOUNT_TOO_MANY_ATTEMPTS`, rate limits) are in `CONTRACT.md`, not in the types.
- Contract snapshot 1.2.0 (7ed087e). Products, product list items and the cart carry `requiresShipping`, the only type change; order creation refuses `ORDER_SHIPPING_REQUIRED` for a cart that needs delivery and has none.
- Both snapshots landed as `chore(sdk)` commits, so release-please's notes for 1.66.1 do not mention them.

## 1.66.0 — 2026-09-09

- Contract snapshot 1.1.0 (e4185ed). Public delivery provider accounts carry `shippingPrice`, `freeShippingThreshold` and `currency`; organisation details carry `commerce` with `currency`, `taxInclusivePricing` and `defaultTaxRate`; orders carry `shippingAmount`.

## 1.65.0 — 2026-09-09

- Types come from the public storefront contract (snapshot 1.0.0, c4be48e): `contract/web-gateway.v1.json`, the generated `contract/v1.ts`, `ELDRA_CONTRACT_VERSION`, and the `EldraContractResponse`, `EldraContractBody`, `EldraContractQuery` and `EldraContractPaths` helpers. Catalog methods default their response type to the contract type and keep the generic override.
- New: `client.cart` (`addItem`, `get`, `updateItem`, `removeItem`, `applyDiscount`, `removeDiscount`), `client.orders` (`get` with the one-time access token, `recover` from a link token), `client.checkout.handoffUrl`, `client.inventory.availability`, and on `client.catalog`: `listCategories`, `listCollections`, `getCollection`, `listCollectionProducts`, `search`.
- `EldraHttpError.code` carries the gateway's problem code, such as `INSUFFICIENT_STOCK`.
- `createCartSession` and `createOrderAccessTokens` persist the cart id and the order tokens without throwing when storage is unavailable.
- `pnpm sdk:contract`, `sdk:contract:check` and `sdk:typecheck`; the pr-check workflow runs lint, the contract check, the type check and the tests on every pull request.

## 1.49.0 — 2026-06-14

- Vite plugin: a failed fetch of the CMS TypeScript definitions no longer fails the build; generation is skipped (366e720).

## 1.45.0 — 2026-06-13

- `client.cms.resolveEntryList` and the entry-list types `EldraCmsEntryList`, `EldraCmsResolveEntryListOptions`, `EldraCmsResolveEntryListResponse`, `EldraCmsResolvedEntryList`, `EldraPaginated` and `EldraPageMeta` (d6cd911).

## 1.42.1 — 2026-06-06

- The default API base URL ends in `/api`: `https://web.eldra.app/api` (b1feed0).

## 1.42.0 — 2026-06-06

- First release of the SDK (4649539): `createEldraClient`, `initEldraClient`, `getEldraClient`, `EldraHttpError`, `client.cms` (`list`, `get`, `getEntryByUniqueField`), `client.catalog` (`listProducts`, `getProduct`), `client.features` (`list`, `isEnabled`, `getCapabilities`), and the `eldraCms` Vite plugin that generates the typed CMS client files.
