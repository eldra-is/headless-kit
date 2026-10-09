# Business login

Business customers sign in through the organization's shop realm in Keycloak, then call
`customer.me()` with their access token. `@eldrajs/sdk` ships the pieces: URL builders for the
authorize and logout endpoints, PKCE, the code exchange and the refresh. It owns no session and
no routes; your server does.

> **Never call the token endpoint from the browser with a client secret.** `exchangeAuthorizationCode`
> and `refreshTokens` take the storefront client's `clientSecret`. Anything bundled into client code
> is public. Run both on your server, keep the secret in private runtime config, and keep tokens
> on the server, never in `localStorage` and never in a cookie (see below).

The issuer is `${keycloakBaseUrl}/realms/shop-${orgId}`, and the client id is `storefront`
(`ELDRA_SHOP_CLIENT_ID`).

```ts
import { shopIssuer } from '@eldrajs/sdk';

const issuer = shopIssuer({ keycloakBaseUrl: 'https://auth.example.com', orgId: 'org-123' });
```

## The flow

1. `createPkcePair()` and a random `state`; keep `codeVerifier` and `state` in the session.
2. Redirect to `buildAuthorizeUrl({ issuer, clientId, redirectUri, state, codeChallenge })`.
3. On the callback, check `state` (see below), then `exchangeAuthorizationCode(...)` with the `code` and the
   stored `codeVerifier`. Store the returned tokens in the session.
4. Before an access token expires (`expiresAt` is epoch milliseconds), call `refreshTokens(...)`.
5. Read the user with `client.customer.me({ headers: bearer(accessToken) })`.
6. Sign out: clear the session, then redirect to `buildLogoutUrl({ issuer, clientId, postLogoutRedirectUri, idTokenHint })`.

Token endpoint failures throw `EldraOidcError` (`status`, `error`, `errorDescription`), for example
`invalid_grant` for a used or expired code. `customer.me()` throws `EldraHttpError`: 401
`SHOP_TOKEN_INVALID` (refresh or sign in again), 403 `SHOP_NO_MEMBERSHIP` (the person has no
company in this organization).

## Where tokens live

Keep tokens in a server-side session store, and put only an opaque random session id in the
cookie. Three Keycloak JWTs (access, refresh, id) routinely exceed the 4 kB a browser allows for
one cookie, so a cookie that carries them is silently dropped. The id is the only thing the
browser holds: `httpOnly`, `secure` in production, `sameSite: lax`, and sealed or signed. Store
the tokens under that id with a TTL equal to the refresh token's expiry (`refreshExpiresAt`), and
delete the entry on logout.

Rules the sketch follows:

- `state` must be unguessable (random, at least 128 bits) and single-use: delete it on the first
  callback, valid or not.
- `post_logout_redirect_uri` must be registered on the `storefront` client, or Keycloak refuses it.
- `id_token_hint` ends up in server logs and can leak through referrers. Send the logout redirect
  with `Referrer-Policy: no-referrer` and do not log the URL.
- On `invalid_grant` during a refresh, the session is over: delete it, clear the cookie, answer 401.
- `refreshExpiresAt` is `undefined` when the server sent no `refresh_expires_in`; pick a TTL yourself then.

## Nuxt (Nitro) sketch

Nitro's `useStorage` takes a driver per mount: memory in development, Redis or KV in production
(`nitro.storage: { session: { driver: 'redis', ... } }`). `eldra` is your `createEldraClient(...)`
instance.

```ts
// server/utils/session.ts
import type { EventHandlerRequest, H3Event } from 'h3';
import type { EldraOidcTokens } from '@eldrajs/sdk';

export interface ShopSession extends Partial<EldraOidcTokens> {
  state?: string;
  codeVerifier?: string;
}

const COOKIE = 'eldra_session';
const store = () => useStorage<ShopSession>('session');

export async function readSession(event: H3Event<EventHandlerRequest>) {
  const sid = getCookie(event, COOKIE); // set with h3 setCookie, sealed or signed
  const data = sid ? await store().getItem(`shop:${sid}`) : null;
  return { sid, data: data ?? ({} as ShopSession) };
}

export async function writeSession(event: H3Event, data: ShopSession, ttlSeconds: number) {
  const sid = getCookie(event, COOKIE) ?? crypto.randomUUID() + crypto.randomUUID();
  await store().setItem(`shop:${sid}`, data, { ttl: ttlSeconds });
  setCookie(event, COOKIE, sid, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds,
  });
}

export async function endSession(event: H3Event) {
  const sid = getCookie(event, COOKIE);
  if (sid) await store().removeItem(`shop:${sid}`);
  deleteCookie(event, COOKIE, { path: '/' });
}
```

```ts
// server/routes/auth/login.get.ts
import { buildAuthorizeUrl, createPkcePair } from '@eldrajs/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = crypto.randomUUID() + crypto.randomUUID();
  await writeSession(event, { state, codeVerifier }, 600);
  return sendRedirect(
    event,
    buildAuthorizeUrl({
      issuer: config.public.shopIssuer,
      clientId: config.shopClientId,
      redirectUri: `${getRequestURL(event).origin}/auth/callback`,
      state,
      codeChallenge,
    })
  );
});
```

```ts
// server/routes/auth/callback.get.ts
import { exchangeAuthorizationCode } from '@eldrajs/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { data } = await readSession(event);
  const query = getQuery(event);
  const { state, codeVerifier } = data;
  await writeSession(event, {}, 600); // state is single-use, valid or not
  if (!state || query.state !== state || !codeVerifier) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid state' });
  }
  const tokens = await exchangeAuthorizationCode({
    issuer: config.public.shopIssuer,
    clientId: config.shopClientId,
    clientSecret: config.shopClientSecret, // private runtime config, server only
    code: String(query.code),
    redirectUri: `${getRequestURL(event).origin}/auth/callback`,
    codeVerifier,
  });
  const ttl = tokens.refreshExpiresAt
    ? Math.max(1, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000))
    : 1800;
  await writeSession(event, tokens, ttl);
  return sendRedirect(event, '/account');
});
```

```ts
// server/api/auth/me.get.ts
import { bearer, EldraOidcError, refreshTokens } from '@eldrajs/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { data } = await readSession(event);
  if (!data.accessToken || !data.refreshToken) throw createError({ statusCode: 401 });
  let tokens = data as EldraOidcTokens;
  if (tokens.expiresAt - Date.now() < 60_000) {
    try {
      tokens = await refreshTokens({
        issuer: config.public.shopIssuer,
        clientId: config.shopClientId,
        clientSecret: config.shopClientSecret,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      if (error instanceof EldraOidcError && error.error === 'invalid_grant') {
        await endSession(event);
        throw createError({ statusCode: 401 });
      }
      throw error;
    }
    const ttl = tokens.refreshExpiresAt
      ? Math.max(1, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000))
      : 1800;
    await writeSession(event, tokens, ttl);
  }
  return eldra.customer.me({ headers: bearer(tokens.accessToken) });
});
```

The access token goes to the gateway only as `Authorization: Bearer`; the SDK never stores it.
Logout deletes the stored session with `endSession(event)` and redirects to `buildLogoutUrl(...)`.
