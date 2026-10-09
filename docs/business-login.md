# Business login

Business customers sign in through the organization's shop realm in Keycloak, then call
`customer.me()` with their access token. `@eldrajs/sdk` ships the pieces: URL builders for the
authorize and logout endpoints, PKCE, the code exchange and the refresh. It owns no session and
no routes; your server does.

> **Never call the token endpoint from the browser with a client secret.** `exchangeAuthorizationCode`
> and `refreshTokens` take the storefront client's `clientSecret`. Anything bundled into client code
> is public. Run both on your server, keep the secret in private runtime config, and keep tokens
> in a sealed, `httpOnly` cookie, never in `localStorage`.

The issuer is `${keycloakBaseUrl}/realms/shop-${orgId}`, and the client id is `storefront`
(`ELDRA_SHOP_CLIENT_ID`).

```ts
import { shopIssuer } from '@eldrajs/sdk';

const issuer = shopIssuer({ keycloakBaseUrl: 'https://auth.example.com', orgId: 'org-123' });
```

## The flow

1. `createPkcePair()` and a random `state`; keep `codeVerifier` and `state` in the session.
2. Redirect to `buildAuthorizeUrl({ issuer, clientId, redirectUri, state, codeChallenge })`.
3. On the callback, check `state`, then `exchangeAuthorizationCode(...)` with the `code` and the
   stored `codeVerifier`. Store the returned tokens in the session.
4. Before an access token expires (`expiresAt` is epoch milliseconds), call `refreshTokens(...)`.
5. Read the user with `client.customer.me({ headers: bearer(accessToken) })`.
6. Sign out: clear the session, then redirect to `buildLogoutUrl({ issuer, clientId, postLogoutRedirectUri, idTokenHint })`.

Token endpoint failures throw `EldraOidcError` (`status`, `error`, `errorDescription`), for example
`invalid_grant` for a used or expired code. `customer.me()` throws `EldraHttpError`: 401
`SHOP_TOKEN_INVALID` (refresh or sign in again), 403 `SHOP_NO_MEMBERSHIP` (the person has no
company in this organization).

## Nuxt (Nitro) sketch

```ts
// server/routes/auth/login.get.ts
import { buildAuthorizeUrl, createPkcePair } from '@eldrajs/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const session = await useSession(event, { password: config.sessionPassword });
  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = crypto.randomUUID();
  await session.update({ codeVerifier, state });
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
  const session = await useSession(event, { password: config.sessionPassword });
  const query = getQuery(event);
  if (!session.data.state || query.state !== session.data.state) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid state' });
  }
  const tokens = await exchangeAuthorizationCode({
    issuer: config.public.shopIssuer,
    clientId: config.shopClientId,
    clientSecret: config.shopClientSecret, // private runtime config, server only
    code: String(query.code),
    redirectUri: `${getRequestURL(event).origin}/auth/callback`,
    codeVerifier: session.data.codeVerifier,
  });
  await session.update({ ...tokens, state: undefined, codeVerifier: undefined });
  return sendRedirect(event, '/account');
});
```

```ts
// server/api/auth/me.get.ts
import { bearer, refreshTokens } from '@eldrajs/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const session = await useSession(event, { password: config.sessionPassword });
  if (!session.data.accessToken) throw createError({ statusCode: 401 });
  if (session.data.expiresAt - Date.now() < 60_000) {
    await session.update(
      await refreshTokens({
        issuer: config.public.shopIssuer,
        clientId: config.shopClientId,
        clientSecret: config.shopClientSecret,
        refreshToken: session.data.refreshToken,
      })
    );
  }
  return eldra.customer.me({ headers: bearer(session.data.accessToken) });
});
```

`eldra` is your `createEldraClient(...)` instance. The access token goes to the gateway only as
`Authorization: Bearer`; the SDK never stores it.
