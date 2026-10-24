import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const issuer = 'https://auth.febro.id';
const jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/jwks`));
export const randomToken = () => randomBytes(32).toString('base64url');
export function safeEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0
    && Buffer.byteLength(a) === Buffer.byteLength(b)
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function configured() {
  return Boolean(process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && process.env.APP_URL);
}
export function callbackUrl() {
  const url = new URL(process.env.APP_URL);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('HTTPS required');
  return `${url.origin}/auth/febro/callback`;
}
export function startFlow(google = false) {
  const flow = { state: randomToken(), nonce: randomToken(), verifier: randomToken(), expires: Date.now() + 600000 };
  const url = new URL(`${issuer}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: process.env.OIDC_CLIENT_ID, redirect_uri: callbackUrl(), response_type: 'code',
    scope: 'openid email profile', state: flow.state, nonce: flow.nonce,
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256',
  }).toString();
  const googleUrl = new URL(`${issuer}/auth/google/start`);
  googleUrl.searchParams.set('next', url.href);
  return { flow, url: google ? googleUrl.href : url.href };
}
export function validFlow(flow, state) {
  return Boolean(flow && flow.expires > Date.now() && safeEqual(flow.state, state));
}
export async function verifyIdentity(token, nonce, key = jwks) {
  const { payload } = await jwtVerify(token, key, {
    issuer, audience: process.env.OIDC_CLIENT_ID, algorithms: ['RS256'], maxTokenAge: '10m',
    requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'exp', 'iat'],
  });
  if (!safeEqual(payload.nonce, nonce) || payload.email_verified !== true
    || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
    || typeof payload.email !== 'string' || payload.email.length > 255 || !/^\S+@\S+\.\S+$/.test(payload.email)
    || (payload.azp && payload.azp !== process.env.OIDC_CLIENT_ID)
    || payload.token_use !== 'id') throw new Error('Identity rejected');
  return { sub: payload.sub, email: payload.email.trim().toLowerCase(), name: String(payload.name || payload.email).slice(0, 120) };
}
export async function exchangeCode(code, flow) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code,
      client_id: process.env.OIDC_CLIENT_ID, client_secret: process.env.OIDC_CLIENT_SECRET,
      redirect_uri: callbackUrl(), code_verifier: flow.verifier }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Code exchange rejected');
  const tokens = await response.json();
  return verifyIdentity(tokens.id_token, flow.nonce);
}
