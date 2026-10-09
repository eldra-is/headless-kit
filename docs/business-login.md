# Business login

Business customers sign in through the organization's shop realm in Keycloak, then call
`customer.me()` with their access token. `@eldrajs/sdk` ships the pieces: URL builders for the
authorize and logout endpoints, PKCE, the code exchange and the refresh. It owns no session and
no routes; your server does.

**Reference implementation:** the
[storefront starter](https://github.com/eldra-is/storefront-starter) (`server/routes/auth/`,
`server/utils/shop-session.ts`) does all of this in Nuxt, with refresh races between servers,
Redis sessions and tests. Start from it. This page states the rules it follows, and
[examples/node-script/business-login.ts](../examples/node-script/business-login.ts) is a
type-checked sketch of them as Web-standard `Request` → `Response` handlers.

> **Never call the token endpoint from the browser with a client secret.** `exchangeAuthorizationCode`
> and `refreshTokens` take the storefront client's `clientSecret`. Anything bundled into client code
> is public. Run both on your server, keep the secret in private runtime config, and keep tokens
> on the server, never in `localStorage` and never in a cookie (see below).

The issuer is `${keycloakBaseUrl}/realms/shop-${orgId}` (`shopIssuer({ keycloakBaseUrl, orgId })`),
and the client id is `storefront` (`ELDRA_SHOP_CLIENT_ID`). `pkceChallenge(verifier)` is the S256
challenge on its own, if you make verifiers yourself.

## The flow

1. `createPkcePair()` and a random `state`; keep `codeVerifier`, `state` and the `redirectUri` in a
   short-lived pending-login session.
2. Redirect to `buildAuthorizeUrl({ issuer, clientId, redirectUri, state, codeChallenge })`.
3. On the callback, take and delete the pending login, check `state`, then
   `exchangeAuthorizationCode(...)` with the `code`, the stored `codeVerifier` and the same
   `redirectUri`. Store the tokens under a **new** session id.
4. Before an access token expires (`expiresAt` is epoch milliseconds), call `refreshTokens(...)`.
5. Read the user with `client.customer.me({ headers: bearer(accessToken) })`.
6. Sign out with a same-origin `POST`: delete the session, end the Keycloak session from the
   server (back-channel), then redirect to
   `buildLogoutUrl({ issuer, clientId, postLogoutRedirectUri, idTokenHint })`.

Token endpoint failures throw `EldraOidcError` (`status`, `error`, `errorDescription`), for example
`invalid_grant` for a used or expired code. `customer.me()` throws `EldraHttpError`; branch on
`errorId`:

| Status | `errorId`                | Meaning and what to do                                                  |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| 401    | `SHOP_TOKEN_INVALID`     | Token missing, expired or from another realm: refresh or sign in again. |
| 403    | `SHOP_NO_MEMBERSHIP`     | The login buys for no customer company in this organization.            |
| 403    | `FEATURE_DISABLED`       | The organization has business sales turned off.                         |
| 503    | `SHOP_LOGIN_UNAVAILABLE` | The login service is unreachable: try again shortly.                    |

Build the client for `customer.me()` with the organization's UUID as `orgId`: the gateway refuses
an alias in `X-Org-Id` on a shop token with `SHOP_TOKEN_INVALID`.

## Where tokens live

Keep tokens in a server-side session store, and put only an opaque random session id in the
cookie. Three Keycloak JWTs (access, refresh, id) routinely exceed the 4 kB a browser allows for
one cookie, so a cookie that carries them is silently dropped. The id is the only thing the
browser holds: at least 128 random bits, `HttpOnly`, `Secure` in production, `SameSite=Lax`. Store
the tokens under that id with a TTL equal to the refresh token's expiry (`refreshExpiresAt`), and
delete the entry on logout. Memory works for one server only; use Redis, KV or a database behind
more than one.

## Rules

- **`state`** must be unguessable (at least 128 random bits) and single-use: delete the pending
  login on the first callback, valid or not.
- **Rotate the session id at sign-in.** The callback stores the tokens under a fresh id and sets a
  new cookie. Reusing the id the browser arrived with lets someone who planted that id (session
  fixation) ride the signed-in session.
- **Logout is a `POST` from your own page,** never a `GET` a third-party image tag can trigger.
  Accept it only when `Sec-Fetch-Site` is `same-origin`, or, when a browser sends no fetch
  metadata, when `Origin` equals your site's origin. Then delete the session, revoke the refresh
  token with a back-channel `POST` to `${issuer}/protocol/openid-connect/logout`
  (`client_id`, `client_secret`, `refresh_token`; best effort), and answer `303` to
  `buildLogoutUrl(...)` so Keycloak clears its own cookies too.
- **`id_token_hint`** ends up in server logs and can leak through referrers. Send the logout
  redirect with `Referrer-Policy: no-referrer` and do not log the URL.
- **Your site's origin** builds `redirectUri` and `postLogoutRedirectUri`, and Keycloak checks both
  against the client's registration (`post_logout_redirect_uri` must be registered on the
  `storefront` client). Behind a proxy, read `X-Forwarded-Proto` and `X-Forwarded-Host` only when
  that proxy overwrites them on every request; otherwise any client can set them. Without such a
  proxy, use the request's own URL.
- **Time out token calls.** `exchangeAuthorizationCode` and `refreshTokens` take a `fetch` option;
  pass one that adds `signal: AbortSignal.timeout(...)` (the sketch's `timedFetch`) so a stalled
  identity provider cannot hold requests open.
- **On `invalid_grant` during a refresh** the session is over: delete it and answer 401. With more
  than one server, another one may have refreshed first and rotated the token; the starter
  re-reads the store before ending the session.
- **`refreshExpiresAt`** is `undefined` when the server sent no `refresh_expires_in`; pick a TTL
  yourself then.
- **Log the OAuth `error` code only,** never the request, the code or any token.

## The sketch

[examples/node-script/business-login.ts](../examples/node-script/business-login.ts) wires the rules
above into four handlers: `login`, `callback`, `me` and `logout`, over a `SessionStore` you supply.
It imports `EldraOidcTokens` for the stored shape and uses a `timedFetch` for every token call. In
Nuxt, mount them from Nitro routes with `toWebRequest(event)`; the access token goes to the gateway
only as `Authorization: Bearer`, and the SDK never stores it.
