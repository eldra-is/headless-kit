import { describe, expect, it } from 'vitest';
import {
  EldraOidcError,
  bearer,
  buildAuthorizeUrl,
  buildLogoutUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  pkceChallenge,
  refreshTokens,
  shopIssuer,
} from '../index';

const issuer = 'https://auth.example.test/realms/shop-org-1';

function fetchStub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const tokenBody = {
  access_token: 'at',
  refresh_token: 'rt',
  id_token: 'it',
  expires_in: 300,
  refresh_expires_in: 1800,
};

describe('shopIssuer', () => {
  it('derives the realm issuer and trims a trailing slash', () => {
    expect(shopIssuer({ keycloakBaseUrl: 'https://auth.example.test/', orgId: 'org 1' })).toBe(
      'https://auth.example.test/realms/shop-org%201'
    );
    expect(shopIssuer({ keycloakBaseUrl: 'https://auth.example.test', orgId: 'org-1' })).toBe(
      issuer
    );
  });
});

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('creates a base64url verifier of valid length with its S256 challenge', async () => {
    const pair = await createPkcePair();
    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pair.codeChallenge).toBe(await pkceChallenge(pair.codeVerifier));
    expect(pair.codeChallengeMethod).toBe('S256');
    expect((await createPkcePair()).codeVerifier).not.toBe(pair.codeVerifier);
  });
});

describe('buildAuthorizeUrl', () => {
  it('sets exactly the authorization code + PKCE parameters', () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer,
        clientId: 'storefront',
        redirectUri: 'https://shop.test/auth/callback',
        state: 's1',
        codeChallenge: 'ch',
      })
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'storefront',
      redirect_uri: 'https://shop.test/auth/callback',
      response_type: 'code',
      scope: 'openid',
      state: 's1',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('accepts a scope and a prompt', () => {
    const url = new URL(
      buildAuthorizeUrl({
        issuer,
        clientId: 'storefront',
        redirectUri: 'https://shop.test/cb',
        state: 's',
        codeChallenge: 'c',
        scope: 'openid email',
        prompt: 'login',
      })
    );
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('prompt')).toBe('login');
  });
});

describe('exchangeAuthorizationCode', () => {
  it('posts a form with client_secret_post and maps the tokens', async () => {
    const { fetch, calls } = fetchStub(200, tokenBody);
    const now = Date.now();
    const tokens = await exchangeAuthorizationCode({
      issuer,
      clientId: 'storefront',
      clientSecret: 'sek',
      code: 'abc',
      redirectUri: 'https://shop.test/cb',
      codeVerifier: 'ver',
      fetch,
    });
    expect(calls[0].url).toBe(`${issuer}/protocol/openid-connect/token`);
    expect(calls[0].init.method).toBe('POST');
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(new Headers(calls[0].init.headers).has('Authorization')).toBe(false);
    expect(Object.fromEntries(new URLSearchParams(calls[0].init.body as string))).toEqual({
      grant_type: 'authorization_code',
      client_id: 'storefront',
      client_secret: 'sek',
      code: 'abc',
      redirect_uri: 'https://shop.test/cb',
      code_verifier: 'ver',
    });
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.idToken).toBe('it');
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(now + 300_000);
    expect(tokens.expiresAt).toBeLessThan(now + 300_000 + 5_000);
    expect(tokens.refreshExpiresAt).toBeGreaterThanOrEqual(now + 1_800_000);
  });

  it('omits client_secret for a public client', async () => {
    const { fetch, calls } = fetchStub(200, tokenBody);
    await exchangeAuthorizationCode({
      issuer,
      clientId: 'storefront',
      code: 'abc',
      redirectUri: 'r',
      codeVerifier: 'v',
      fetch,
    });
    expect(new URLSearchParams(calls[0].init.body as string).has('client_secret')).toBe(false);
  });

  it('maps an OAuth error body to EldraOidcError', async () => {
    const { fetch } = fetchStub(400, {
      error: 'invalid_grant',
      error_description: 'Code not valid',
    });
    const error = await exchangeAuthorizationCode({
      issuer,
      clientId: 'storefront',
      code: 'x',
      redirectUri: 'r',
      codeVerifier: 'v',
      fetch,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EldraOidcError);
    expect(error).toMatchObject({
      status: 400,
      error: 'invalid_grant',
      errorDescription: 'Code not valid',
    });
  });

  it('maps a non-JSON failure', async () => {
    const fetch = (async () =>
      new Response('bad gateway', { status: 502 })) as typeof globalThis.fetch;
    const error = await refreshTokens({ issuer, clientId: 'c', refreshToken: 'r', fetch }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(EldraOidcError);
    expect(error).toMatchObject({ status: 502, error: 'server_error' });
  });
});

describe('refreshTokens', () => {
  it('posts a refresh_token grant', async () => {
    const { fetch, calls } = fetchStub(200, tokenBody);
    const tokens = await refreshTokens({
      issuer,
      clientId: 'storefront',
      clientSecret: 'sek',
      refreshToken: 'rt0',
      fetch,
    });
    expect(Object.fromEntries(new URLSearchParams(calls[0].init.body as string))).toEqual({
      grant_type: 'refresh_token',
      client_id: 'storefront',
      client_secret: 'sek',
      refresh_token: 'rt0',
    });
    expect(tokens.accessToken).toBe('at');
  });
});

describe('buildLogoutUrl', () => {
  it('sets the post logout redirect and optional id token hint', () => {
    const url = new URL(
      buildLogoutUrl({
        issuer,
        clientId: 'storefront',
        postLogoutRedirectUri: 'https://shop.test/',
        idTokenHint: 'it',
      })
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/protocol/openid-connect/logout`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'storefront',
      post_logout_redirect_uri: 'https://shop.test/',
      id_token_hint: 'it',
    });
    const bare = new URL(
      buildLogoutUrl({
        issuer,
        clientId: 'storefront',
        postLogoutRedirectUri: 'https://shop.test/',
      })
    );
    expect(bare.searchParams.has('id_token_hint')).toBe(false);
  });
});

describe('bearer', () => {
  it('returns an Authorization header', () => {
    expect(bearer('tok')).toEqual({ Authorization: 'Bearer tok' });
  });
});
