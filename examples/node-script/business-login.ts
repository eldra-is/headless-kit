// Business login on a server, as four Web-standard handlers (Request in, Response out) that any
// runtime can mount: Node, Nitro/h3, Hono, a worker. A sketch of the rules in docs/business-login.md;
// the storefront starter (eldra-is/storefront-starter, server/routes/auth/) is the full reference.
import {
  bearer,
  buildAuthorizeUrl,
  buildLogoutUrl,
  createEldraClient,
  createPkcePair,
  EldraHttpError,
  EldraOidcError,
  exchangeAuthorizationCode,
  refreshTokens,
  type EldraOidcTokens,
} from '@eldrajs/sdk';

export interface BusinessLoginConfig {
  /** `shopIssuer({ keycloakBaseUrl, orgId })`. */
  issuer: string;
  /** `ELDRA_SHOP_CLIENT_ID` unless your realm names the client otherwise. */
  clientId: string;
  /** Private server config. Never bundled into browser code. */
  clientSecret: string;
  /**
   * Read X-Forwarded-Proto/-Host for this site's origin. Only when a proxy in front of the server
   * overwrites both headers on every request; otherwise a client can set them.
   */
  trustProxy: boolean;
  /** Built with the organization's UUID: the gateway refuses an alias in X-Org-Id on a shop token. */
  eldra: ReturnType<typeof createEldraClient>;
}

interface PendingLogin {
  state: string;
  codeVerifier: string;
  redirectUri: string;
}

type Session = { login?: PendingLogin; tokens?: EldraOidcTokens };

/** Swap for Redis, KV or a database in production; memory only works on a single server. */
export interface SessionStore {
  get(id: string): Promise<Session | undefined>;
  set(id: string, session: Session, ttlSeconds: number): Promise<void>;
  delete(id: string): Promise<void>;
}

export function memoryStore(): SessionStore {
  const entries = new Map<string, { session: Session; expires: number }>();
  return {
    async get(id) {
      const entry = entries.get(id);
      if (!entry || entry.expires < Date.now()) return undefined;
      return entry.session;
    },
    async set(id, session, ttlSeconds) {
      entries.set(id, { session, expires: Date.now() + ttlSeconds * 1000 });
    },
    async delete(id) {
      entries.delete(id);
    },
  };
}

const COOKIE = 'eldra_session';
const TOKEN_TIMEOUT_MS = 10_000;
/** Token calls get a deadline: a stalled identity provider must not hold requests open. */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });

/** 256 bits from the platform's CSPRNG, as hex. */
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionId(request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=') || undefined;
  }
  return undefined;
}

function sessionCookie(id: string, maxAge: number, secure: boolean): string {
  return [
    `${COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function ttlFor(tokens: EldraOidcTokens): number {
  // No refresh_expires_in from the server: pick a lifetime yourself.
  if (tokens.refreshExpiresAt === undefined) return 1800;
  return Math.max(1, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000));
}

/** The origin this request came to, which Keycloak matches against the registered redirect URIs. */
function siteOrigin(request: Request, config: BusinessLoginConfig): string {
  const url = new URL(request.url);
  if (!config.trustProxy) return url.origin;
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim() || undefined;
  const proto = first('x-forwarded-proto');
  const protocol = proto === 'http' || proto === 'https' ? proto : url.protocol.slice(0, -1);
  return `${protocol}://${first('x-forwarded-host') ?? url.host}`;
}

function redirect(location: string, status: 302 | 303, cookie?: string): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    // The logout URL carries id_token_hint; never let it leak through a referrer.
    'Referrer-Policy': 'no-referrer',
  });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status, headers });
}

export function businessLogin(config: BusinessLoginConfig, store: SessionStore) {
  const tokenClient = {
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    fetch: timedFetch,
  };

  /** GET /auth/login: a pending login under its own short-lived session id. */
  async function login(request: Request): Promise<Response> {
    const origin = siteOrigin(request, config);
    const { codeVerifier, codeChallenge } = await createPkcePair();
    const state = randomId();
    const redirectUri = `${origin}/auth/callback`;
    const id = randomId();
    await store.set(id, { login: { state, codeVerifier, redirectUri } }, 600);
    const url = buildAuthorizeUrl({ ...tokenClient, redirectUri, state, codeChallenge });
    return redirect(url, 302, sessionCookie(id, 600, origin.startsWith('https:')));
  }

  /** GET /auth/callback: the pending login works once; the signed-in session gets a fresh id. */
  async function callback(request: Request): Promise<Response> {
    const secure = siteOrigin(request, config).startsWith('https:');
    const failed = () => redirect('/account?signin=failed', 302, sessionCookie('', 0, secure));
    const pendingId = sessionId(request);
    const pending = pendingId ? (await store.get(pendingId))?.login : undefined;
    if (pendingId) await store.delete(pendingId); // single-use, valid or not
    const query = new URL(request.url).searchParams;
    const code = query.get('code');
    if (!pending || !code || query.get('state') !== pending.state) return failed();

    let tokens: EldraOidcTokens;
    try {
      tokens = await exchangeAuthorizationCode({
        ...tokenClient,
        code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
      });
    } catch (error) {
      // Log the OAuth error code only; never the request, the code or tokens.
      console.warn(
        'code exchange failed:',
        error instanceof EldraOidcError ? error.error : 'error'
      );
      return failed();
    }
    // A new id: whatever id the browser held before signing in (one an attacker may have planted)
    // never becomes a signed-in session.
    const id = randomId();
    const ttl = ttlFor(tokens);
    await store.set(id, { tokens }, ttl);
    return redirect('/account', 302, sessionCookie(id, ttl, secure));
  }

  /** GET /api/me: the signed-in business customer, refreshing the access token when it is close to expiry. */
  async function me(request: Request): Promise<Response> {
    const id = sessionId(request);
    let tokens = id ? (await store.get(id))?.tokens : undefined;
    if (!id || !tokens) return Response.json({ error: 'SIGNED_OUT' }, { status: 401 });

    if (tokens.expiresAt - Date.now() < 60_000) {
      try {
        tokens = await refreshTokens({ ...tokenClient, refreshToken: tokens.refreshToken });
      } catch (error) {
        if (error instanceof EldraOidcError && error.error === 'invalid_grant') {
          await store.delete(id);
          return Response.json({ error: 'SIGNED_OUT' }, { status: 401 });
        }
        throw error;
      }
      await store.set(id, { tokens }, ttlFor(tokens));
    }

    try {
      const customer = await config.eldra.customer.me({ headers: bearer(tokens.accessToken) });
      return Response.json(customer, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (!(error instanceof EldraHttpError)) throw error;
      switch (error.errorId) {
        case 'SHOP_TOKEN_INVALID': // 401: sign in again
          await store.delete(id);
          return Response.json({ error: 'SIGNED_OUT' }, { status: 401 });
        case 'SHOP_NO_MEMBERSHIP': // 403: this login buys for no customer company
        case 'FEATURE_DISABLED': // 403: the organization has business sales turned off
          return Response.json({ error: error.errorId }, { status: 403 });
        case 'SHOP_LOGIN_UNAVAILABLE': // 503: try again shortly
          return Response.json({ error: error.errorId }, { status: 503 });
        default:
          throw error;
      }
    }
  }

  /**
   * POST /auth/logout, from a form on this site. Never a GET: any page could sign the customer out
   * with an image tag. Fetch metadata (Sec-Fetch-Site) or, in older browsers, Origin must say the
   * request came from this site.
   */
  async function logout(request: Request): Promise<Response> {
    const origin = siteOrigin(request, config);
    const site = request.headers.get('sec-fetch-site');
    const sameOrigin = site ? site === 'same-origin' : request.headers.get('origin') === origin;
    if (request.method !== 'POST' || !sameOrigin) return new Response(null, { status: 403 });

    const cleared = sessionCookie('', 0, origin.startsWith('https:'));
    const id = sessionId(request);
    const tokens = id ? (await store.get(id))?.tokens : undefined;
    if (id) await store.delete(id);
    if (!tokens) return redirect('/', 303, cleared);

    // Back-channel: end the Keycloak session from the server, so the refresh token dies even if
    // the browser never follows the redirect. Best effort.
    const form = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
    });
    await timedFetch(`${config.issuer.replace(/\/+$/, '')}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }).catch(() => undefined);

    // Then the browser through Keycloak's logout, so its own cookies go too. Do not log this URL.
    const url = buildLogoutUrl({
      issuer: config.issuer,
      clientId: config.clientId,
      postLogoutRedirectUri: `${origin}/`,
      idTokenHint: tokens.idToken,
    });
    return redirect(url, 303, cleared);
  }

  return { login, callback, me, logout };
}
