# Sales orders

A signed-in business customer (see [business-login.md](business-login.md)) can order on account:
the supplier sends the goods and invoices the company later, so there is no payment step. The
calls act for the person's **active company**. The types come from the generated contract
(2.18.0): `EldraCustomerLocation`, `EldraSalesOrderPreview`, `EldraSalesOrder`,
`EldraSalesOrderLine`, `EldraSalesOrderList`, `EldraCreateSalesOrderInput` and
`EldraSalesOrderListOptions`.

A type-checked version of the code below is
[examples/node-script/sales-orders.ts](../examples/node-script/sales-orders.ts).

## Calls

Server-side only. Pass the access token on each call, and the active company as `X-Customer-Id`
when the person buys for more than one. `customerHeaders` builds both, the same way as for
[customer prices](customer-prices.md):

```ts
import { customerHeaders } from '@eldrajs/sdk';

const headers = customerHeaders(session.accessToken, session.customerId);

const { data: locations } = await eldra.customer.locations({ headers }); // default first, [] for none
const preview = await eldra.salesOrders.preview({ cartId, locationId }, { headers });
const order = await eldra.salesOrders.create(
  { cartId, locationId, purchaseOrderNumber, customerOrderDate, note },
  { idempotencyKey: attempt.idempotencyKey },
  { headers }
);
const page = await eldra.salesOrders.list({ page: 1, pageSize: 20, status: 'OPEN' }, { headers });
const one = await eldra.salesOrders.get(order.id, { headers });
```

Without `X-Customer-Id` the gateway uses the person's only company, or answers 409
`SHOP_CUSTOMER_REQUIRED`. Never send the token from the browser. A route without a token is 401
`SHOP_TOKEN_INVALID`; the SDK sends `Authorization` only when you pass it in `context.headers`.

The company, the member and every price come from the sign-in and the supplier. The body takes only
the fields above: naming a `customerId`, a price or a line is 422. `purchaseOrderNumber` is at most
40 characters, `note` at most 1000, and the company's other members see the note too.
`customerOrderDate` is `YYYY-MM-DD`.

Every answer, errors included, is `Cache-Control: private, no-store` and varies on
`Authorization, X-Customer-Id`. Never cache one, and render these pages dynamically.

## Preview before placing

The cart page shows the prices stored when each line was added. The order prices from the
company's current terms, so show the preview before the person places the order. The preview
writes nothing. It answers the lines, totals, payment term, the delivery address and
`credit: {status, wouldBlock}`. No credit limit or balance is ever answered. When `wouldBlock` is
true, placing the order will be refused with 409 `SALES_ORDER_CREDIT_LIMIT_EXCEEDED`, so say so
before the person tries. `availableNow` on a line is information only: an order on account is never
refused for stock.

The cart must be bound to the active company. A cart the person filled while signed in is bound
already. Otherwise the answer is 409 `SALES_ORDER_CART_NOT_BOUND`: add to the cart signed in first
(see [cart binding](customer-prices.md#cart-binding)).

## The idempotency key

`salesOrders.create` requires `{ idempotencyKey }`, at most 255 characters. Without a usable one it
rejects with a `TypeError` and sends nothing: that is a bug in the calling code, never a reason to
retry.

- Mint a key (a random UUID) when the person starts placing the order, and store it with that
  checkout attempt, for example in the server session.
- **Keep the same key across retries.** A 502, a 503 or a timeout may follow an order that was
  placed. Retrying with the same key replays that order instead of placing a second one. Never
  mint a new key to retry.
- **Mint a new key when the cart or the form changes.** A different body under a used key is 409
  `ORDER_IDEMPOTENCY_CONFLICT`.

Once an order is placed, its cart is removed. Start a new cart for the next order.

## Warnings

The create answers 201 with the order and `warnings: [{code}]`.
`SALES_ORDER_STOCK_NOT_SET_ASIDE` and `SALES_ORDER_PAYMENT_NOT_RECORDED` name a step the supplier
finishes after the order was placed. The order stands; do not offer to place it again. A read
answers `warnings: []`.

## Order history and reordering

`list` answers the company's orders newest first, `pageSize` 1–50 (default 50), filtered by
`status` (`OPEN`, `ON_HOLD`, `PART_DELIVERED`, `DELIVERED`, `CANCELLED`). `get` answers one order
with its lines: `quantity`, `quantityDelivered`, `backorder` and `inStockNow`. Another company's
order is 404 `SALES_ORDER_NOT_FOUND`, the same as one that does not exist.

There is no reorder call. To order again, add each line that still has a `productId` and a
`variantId` to a new cart with `cart.addItem` at the ordered `quantity`, signed in, and go through
the preview again. The cart prices the lines at today's terms.

## Errors

Every refusal is an `EldraHttpError`. Branch on `errorId`, which is typed as `EldraErrorId`.
`errors` carries the problem's details. `isEldraError(error, id)` narrows an unknown error to
that refusal and types its `errors` for the ids in `EldraProblemErrors`
(`SALES_ORDER_CART_ALREADY_ORDERED` `{salesOrderId}`, `SALES_ORDER_LINE_INVALID` `{variantId}`,
`ORDER_PRODUCT_UNAVAILABLE` `{variantIds}` here and the cart's `{itemIds}` on a web order,
`SHIPPING_CART_NOT_EXPORTABLE` `{itemIds}`). Each field is as the gateway sent it, so check it before
use:

```ts
if (isEldraError(error, 'SALES_ORDER_CART_ALREADY_ORDERED')) {
  const id = error.errors?.salesOrderId; // string | undefined
}
```

| Status | `errorId`                                                                                   | What to do                                                                       |
| ------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 400    | `SALES_ORDER_CART_EMPTY`, `SALES_ORDER_TOO_MANY_LINES`                                      | Fix the cart                                                                     |
| 400    | `SALES_ORDER_LINE_INVALID`                                                                  | `errors.variantId` cannot be ordered; remove it                                  |
| 400    | `SALES_ORDER_IDEMPOTENCY_KEY_REQUIRED`                                                      | Send a key (the SDK refuses before sending)                                      |
| 401    | `SHOP_TOKEN_INVALID`                                                                        | Refresh the token or sign in again                                               |
| 403    | `SHOP_NO_MEMBERSHIP`, `SHOP_CUSTOMER_NOT_MEMBER`, `FEATURE_DISABLED`                        | No company, not this company's member, or business sales are off                 |
| 403    | `ORIGIN_NOT_REGISTERED`                                                                     | Preview and create are origin-bound; call from a registered origin or the server |
| 404    | `CART_NOT_FOUND`, `SALES_ORDER_NOT_FOUND`                                                   | Gone, or another company's                                                       |
| 409    | `SHOP_CUSTOMER_REQUIRED`                                                                    | Send `X-Customer-Id`                                                             |
| 409    | `CUSTOMER_BLOCKED`                                                                          | The company may not order now; tell the person to contact the supplier           |
| 409    | `SALES_ORDER_CREDIT_LIMIT_EXCEEDED`                                                         | Over the credit limit (no figures are answered)                                  |
| 409    | `SALES_ORDER_CART_NOT_BOUND`                                                                | Add to the cart signed in first                                                  |
| 409    | `SALES_ORDER_CART_ALREADY_ORDERED`                                                          | The cart is already the order `errors.salesOrderId`; show it                     |
| 409    | `SALES_ORDER_LOCATION_UNKNOWN`                                                              | Not one of the company's locations; reload them                                  |
| 409    | `ORDER_PRODUCT_UNAVAILABLE`                                                                 | `errors.variantIds` are no longer sold; remove them                              |
| 409    | `ORDER_CUSTOMER_UNAVAILABLE`, `ORDER_CUSTOMER_PRICES_OFF`                                   | The company can no longer buy at its prices; move the person to a guest cart     |
| 409    | `ORDER_IDEMPOTENCY_CONFLICT`                                                                | The key was used for another body; mint a new one                                |
| 422    | (none)                                                                                      | A field is too long or malformed, or the body names something it may not         |
| 502    | `SALES_ORDER_UPSTREAM_REFUSED`                                                              | Try again later. **Never sign the person out over it**                           |
| 503    | `SALES_ORDER_TERMS_UNAVAILABLE`, `SALES_ORDER_CART_UNAVAILABLE`, `ORDER_PRICES_UNAVAILABLE` | Try again                                                                        |
| 503    | `SALES_ORDER_CREDIT_CHECK_UNAVAILABLE`, `SHOP_LOGIN_UNAVAILABLE`                            | Try again                                                                        |

Only 401 `SHOP_TOKEN_INVALID` means the person must sign in again. 502
`SALES_ORDER_UPSTREAM_REFUSED` means the supplier's order service refused the platform's own call,
not the person. After `create`, any 502, 503 or timeout may follow a placed order. Retry with the
same idempotency key.

The preview is limited to 60 calls a minute per client and the create to 20 (429).
