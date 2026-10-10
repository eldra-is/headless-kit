# Web Studio SDK changelog

`@eldrajs/sdk` is its own package from 0.1.0; entries before that are the versions of
`@eldra-is/vue-ui-components`, where it shipped as the `./sdk` and `./sdk/vite` entry points. This file is
hand-maintained: every change a consumer of the SDK can see gets a line under Unreleased in the same
change, naming the contract version when the contract moved. Release-please writes `RELEASE-NOTES.md`
from commit messages and does not describe the SDK. The contract's own history is `CONTRACT.md` in the
platform repository.

## Unreleased

- Contract 2.17.0 (customer prices) on top of 2.16.0. Business login: `shopIssuer`, `ELDRA_SHOP_CLIENT_ID`, `createPkcePair`,
  `pkceChallenge`, `buildAuthorizeUrl`, `exchangeAuthorizationCode`, `refreshTokens` and
  `buildLogoutUrl` (OIDC authorization code with PKCE against the shop realm, `EldraOidcError` on
  failure), `bearer(accessToken)`, and `customer.me(context)` for the signed-in business customer
  and their company memberships (`GET /customer/v1/me`, new in contract 2.16.0). The token is passed
  per call in `context.headers`. `EldraCustomerMe`, `EldraShopUser` and `EldraCustomerMembership`
  are derived from the generated contract like every other response type. `refreshExpiresAt` is
  `undefined` when the server sends no `refresh_expires_in`. See `docs/business-login.md`.
- Customer prices (contract 2.17.0): catalog product, list and collection-product reads and cart
  writes accept a signed-in token and `X-Customer-Id` per call in `context.headers`. Priced
  variants carry `listPrice`, list items carry the customer's `minPrice` and `maxPrice`, and priced
  responses have no `compareAtPrice`. `customerHeaders(accessToken, customerId?)` builds the
  headers. Priced responses are `Cache-Control: private, no-store`. See `docs/customer-prices.md`.
- Customer carts (contract 2.17.0): cart and order error ids `CART_CUSTOMER_MISMATCH` (also on a
  signed-in read), `CART_SIGN_IN_REQUIRED` (a guest may still remove a line),
  `CART_CUSTOMER_PRICES_OFF`, `ORDER_CUSTOMER_PRICES_OFF`, `CART_DISCOUNT_NOT_FOR_CUSTOMER_PRICES`,
  `CART_PRICES_UNAVAILABLE`. Every cart answer is `private, no-store`; binding drops the discount
  code; list items carry `listPrice`. The docs explain tracking the binding and moving the cart.
- Customer carts (contract 2.17.0): an archived or unknown company now answers 409
  `CART_CUSTOMER_UNAVAILABLE` on cart writes and 409 `ORDER_CUSTOMER_UNAVAILABLE` on order create and
  preview (before: 503 `*_PRICES_UNAVAILABLE`); treat them like `*_CUSTOMER_PRICES_OFF`. A bound
  cart shows the prices stored when lines were added, and the order re-prices, so show the order
  preview total before payment. No change to the generated contract.
- Sales orders and delivery locations (contract 2.18.0) for a signed-in business customer's active
  company: `customer.locations(context)` (`GET /customer/v1/locations`, the default first, `[]` for
  none), `salesOrders.preview(input, context)`, `salesOrders.create(input, { idempotencyKey },
  context)`, `salesOrders.list(options, context)` and `salesOrders.get(id, context)`. `create`
  requires the idempotency key and rejects without one, sending nothing; keep the key across
  retries (a 502, a 503 or a timeout may follow a placed order, and the same key replays it) and
  mint a new one when the cart or the form changes. Types derived from the contract:
  `EldraCustomerLocation`, `EldraSalesOrderPreview`, `EldraSalesOrderPreviewLine`,
  `EldraSalesOrderCredit`, `EldraSalesOrder`, `EldraSalesOrderLine`, `EldraSalesOrderWarning`,
  `EldraSalesOrderDelivery`, `EldraSalesOrderStatus`, `EldraSalesOrderList`,
  `EldraSalesOrderListItem`, `EldraSalesOrderListOptions`, `EldraSalesOrderPreviewInput`,
  `EldraCreateSalesOrderInput`. Warnings on create: `SALES_ORDER_STOCK_NOT_SET_ASIDE`,
  `SALES_ORDER_PAYMENT_NOT_RECORDED` (the order stands). See `docs/sales-orders.md`.
- Error ids are typed: `EldraHttpError.errorId` is `EldraErrorId`, the known `EldraShopErrorId` and
  `EldraSalesOrderErrorId` values or any other string. New with sales orders: `CUSTOMER_BLOCKED`,
  `SALES_ORDER_CREDIT_LIMIT_EXCEEDED`, `SALES_ORDER_CREDIT_CHECK_UNAVAILABLE`,
  `SALES_ORDER_CART_NOT_BOUND`, `SALES_ORDER_CART_EMPTY`, `SALES_ORDER_TOO_MANY_LINES`,
  `SALES_ORDER_LINE_INVALID`, `SALES_ORDER_CART_ALREADY_ORDERED`, `SALES_ORDER_LOCATION_UNKNOWN`,
  `SALES_ORDER_TERMS_UNAVAILABLE`, `SALES_ORDER_CART_UNAVAILABLE`,
  `SALES_ORDER_IDEMPOTENCY_KEY_REQUIRED`, `SALES_ORDER_NOT_FOUND`, `SALES_ORDER_UPSTREAM_REFUSED`
  (502: the supplier's order service refused the platform; never sign the person out over it), and
  the reused `ORDER_CUSTOMER_UNAVAILABLE`, `ORDER_CUSTOMER_PRICES_OFF`, `ORDER_PRODUCT_UNAVAILABLE`,
  `ORDER_PRICES_UNAVAILABLE`, `ORDER_IDEMPOTENCY_CONFLICT`. `EldraHttpError.errors` carries the
  problem's details, such as `salesOrderId` on `SALES_ORDER_CART_ALREADY_ORDERED` and `variantId`
  on `SALES_ORDER_LINE_INVALID`.

## 0.2.7 — 2026-10-09

- `analyticsTrackerScript`'s documentation no longer says events always reach the gateway; with
  `eventOrigin` set they go to that first-party proxy.

## 0.2.6 — 2026-10-08

- Responsive images: `responsiveImage` returns `src`, `srcset`, `sizes`, `width` and `height` for
  an `<img>` from any media URL or object the API returns; `imageSrcset`, `imageUrl`,
  `imageVariantFor`, `isEldraImage` and `ELDRA_IMAGE_VARIANT_WIDTHS` are the parts. A bare media
  URL serves 800 px, so a storefront rendering it as-is was soft on wide screens. External URLs
  and formats the host does not resize come back unchanged. See `docs/images.md`.

## 0.2.5 — 2026-09-25

- `analyticsTrackerScript` builds the analytics tracker `<script>` attributes from the same
  configuration as the client, so the script comes from the gateway the site reads from. Events go
  there too, unless `eventOrigin` names a first-party proxy to send them through.

## 0.2.4 — 2026-09-23

- `checkout.handoffUrl` defaults to the hosted checkout at `https://checkout.eldra.app` (exported
  as `DEFAULT_ELDRA_CHECKOUT_URL`) when the client uses the default API base URL, so a production
  storefront no longer needs a checkout URL setting. `checkoutUrl` and the `ELDRA_CHECKOUT_URL` env
  keys still override it; a client on any other gateway must still name its checkout.

## 0.2.3 — 2026-09-23

- `EldraHttpError.errorId` carries the problem's specific reason, such as `CART_NOT_FOUND` or
  `CART_INSUFFICIENT_STOCK`. The docs told you to branch on `code` for these, but the gateway puts
  them in `errorId`; `code` is only the category (`NOT_FOUND`, `CONFLICT`) and is unchanged.

## 0.2.2 — 2026-09-20

- Restore `previewToken` on the SDK client and Vite generator after the move from
  `vue-ui-components`. Accepts a string or callback and sends `X-Preview-Token`; the generator
  forwards it to both type endpoints without embedding it in generated files.

## 0.2.1 — 2026-09-16

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
