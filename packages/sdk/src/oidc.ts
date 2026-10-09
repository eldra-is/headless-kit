/**
 * OpenID Connect helpers for business-customer login. Framework-free and free of Node-only APIs:
 * URL builders, PKCE through WebCrypto, and the two token-endpoint calls over `fetch`.
 *
 * The token endpoint calls take the storefront client's secret. Make them on a server only; see
 * `docs/business-login.md`.
 */

export interface EldraOidcTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  /** Epoch milliseconds when the refresh token expires; undefined when the server sent no `refresh_expires_in`. */
  refreshExpiresAt: number | undefined;
}

export class EldraOidcError extends Error {
  readonly status: number;
  /** The OAuth `error` code, such as `invalid_grant`. */
  readonly error: string;
  readonly errorDescription: string | undefined;

  constructor(status: number, error: string, errorDescription?: string) {
    super(
      `Token request failed with ${status} ${error}${errorDescription ? `: ${errorDescription}` : ''}`
    );
    this.name = 'EldraOidcError';
    this.status = status;
    this.error = error;
    this.errorDescription = errorDescription;
  }
}

export interface EldraPkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface EldraAuthorizeUrlOptions {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  prompt?: string;
}

export interface EldraTokenClientOptions {
  issuer: string;
  clientId: string;
  /** Sent as `client_secret` in the form body (client_secret_post). Server-side only. */
  clientSecret?: string;
  fetch?: typeof fetch;
}

export interface EldraExchangeCodeOptions extends EldraTokenClientOptions {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface EldraRefreshTokensOptions extends EldraTokenClientOptions {
  refreshToken: string;
}

export interface EldraLogoutUrlOptions {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string;
}

function oidcUrl(issuer: string, endpoint: string): URL {
  return new URL(`${issuer.replace(/\/+$/, '')}/protocol/openid-connect/${endpoint}`);
}

/** The default client id of the storefront client in every shop realm. */
export const ELDRA_SHOP_CLIENT_ID = 'storefront';

/** The issuer of an organization's shop realm. */
export function shopIssuer(options: { keycloakBaseUrl: string; orgId: string }): string {
  return `${options.keycloakBaseUrl.replace(/\/+$/, '')}/realms/shop-${encodeURIComponent(options.orgId)}`;
}

/** Headers carrying an access token, for `context.headers` of `customer.me()`. */
export function bearer(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Headers for a priced catalog read or a cart write: the access token plus, when the person
 * belongs to more than one company, the active company as `X-Customer-Id`. Server-side only.
 */
export function customerHeaders(
  accessToken: string,
  customerId?: string
): { Authorization: string; 'X-Customer-Id'?: string } {
  return customerId ? { ...bearer(accessToken), 'X-Customer-Id': customerId } : bearer(accessToken);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The S256 code challenge for a verifier. */
export async function pkceChallenge(codeVerifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  return base64Url(new Uint8Array(digest));
}

/** A fresh PKCE verifier (43 characters of base64url) with its S256 challenge. */
export async function createPkcePair(): Promise<EldraPkcePair> {
  const codeVerifier = base64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  return {
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    codeChallengeMethod: 'S256',
  };
}

export function buildAuthorizeUrl(options: EldraAuthorizeUrlOptions): string {
  const url = oidcUrl(options.issuer, 'auth');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', options.scope ?? 'openid');
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (options.prompt) url.searchParams.set('prompt', options.prompt);
  return url.toString();
}

export function buildLogoutUrl(options: EldraLogoutUrlOptions): string {
  const url = oidcUrl(options.issuer, 'logout');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
  if (options.idTokenHint) url.searchParams.set('id_token_hint', options.idTokenHint);
  return url.toString();
}

async function tokenRequest(
  options: EldraTokenClientOptions,
  params: Record<string, string>
): Promise<EldraOidcTokens> {
  const form = new URLSearchParams({ ...params, client_id: options.clientId });
  if (options.clientSecret) form.set('client_secret', options.clientSecret);
  const requestedAt = Date.now();
  const response = await (options.fetch ?? globalThis.fetch)(
    oidcUrl(options.issuer, 'token').toString(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    }
  );
  const body = (await response.json().catch(() => undefined)) as
    | Record<string, unknown>
    | undefined;
  if (!response.ok) {
    const error = typeof body?.error === 'string' ? body.error : 'server_error';
    const description =
      typeof body?.error_description === 'string' ? body.error_description : undefined;
    throw new EldraOidcError(response.status, error, description);
  }
  if (typeof body?.access_token !== 'string' || !body.access_token) {
    throw new EldraOidcError(
      response.status,
      'invalid_response',
      'Token response has no access_token'
    );
  }
  const text = (key: string) => (typeof body?.[key] === 'string' ? (body[key] as string) : '');
  const seconds = (key: string) => (typeof body?.[key] === 'number' ? (body[key] as number) : 0);
  return {
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    expiresAt: requestedAt + seconds('expires_in') * 1000,
    refreshExpiresAt:
      typeof body.refresh_expires_in === 'number'
        ? requestedAt + body.refresh_expires_in * 1000
        : undefined,
  };
}

export function exchangeAuthorizationCode(
  options: EldraExchangeCodeOptions
): Promise<EldraOidcTokens> {
  return tokenRequest(options, {
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
  });
}

export function refreshTokens(options: EldraRefreshTokensOptions): Promise<EldraOidcTokens> {
  return tokenRequest(options, {
    grant_type: 'refresh_token',
    refresh_token: options.refreshToken,
  });
}
