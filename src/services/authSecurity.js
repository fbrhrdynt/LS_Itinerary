import { createHash } from 'node:crypto';
import { safeEqual } from './oidc.js';
export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const validEmail = email => email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validPassword = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value) <= 72;
const admins = new Set(['febroherdyanto98@gmail.com', 'febroherdyanto@outlook.com']);
export const isAdmin = user => user?.role === 'Administrator' && admins.has(normalizeEmail(user.email)) && Boolean(user.email_verified_at) && normalizeEmail(user.verified_email) === normalizeEmail(user.email);
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function sameOrigin(req) {
  try {
    const expected = new URL(process.env.APP_URL).origin;
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const fetchSite = req.headers['sec-fetch-site'];

    if (origin && origin !== 'null') {
      return new URL(origin).origin === expected;
    }

    if (referer) {
      return new URL(referer).origin === expected &&
        fetchSite !== 'cross-site';
    }

    // Origin:null alone is never trusted.
    // Fetch Metadata must explicitly prove same-origin context.
    return fetchSite === 'same-origin';
  } catch {
    return false;
  }
}

export function validCSRF(req) { return sameOrigin(req) && safeEqual(req.body.csrf, req.session.loginCSRF); }
export function csrfGuard(req, res, next) {
  if (validCSRF(req)) return next();
  // No identifiers, cookies, body, URL query, or tokens in diagnostics.
  console.warn('auth_form_rejected', JSON.stringify({path:req.path, hasSessionToken:Boolean(req.session.loginCSRF), hasCookie:Boolean(req.headers.cookie), originPresent:req.headers.origin !== undefined, originValue:req.headers.origin || 'NONE', expectedOrigin:new URL(process.env.APP_URL).origin, sameOrigin:sameOrigin(req)}));
  res.status(403).set('Cache-Control','no-store').render('auth/session-expired', {title:'Formulir kedaluwarsa'});
}
