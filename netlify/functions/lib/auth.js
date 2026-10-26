/**
 * Shared office authorization for every admin/office function.
 *
 * Cloudflare Access JWT (Zero Trust) when CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD
 * are set, otherwise the ADMIN_PASSWORD fallback via x-admin-key. The JWT check
 * is what stops the raw *.netlify.app origin from bypassing Cloudflare.
 */
const crypto = require('crypto');

let accessCache = { at: 0, keys: null };

function reqHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}

function b64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function accessJwks(domain) {
  if (accessCache.keys && Date.now() - accessCache.at < 3600000) return accessCache.keys;
  const res = await fetch('https://' + domain + '/cdn-cgi/access/certs', { cache: 'no-store' });
  if (!res.ok) throw new Error('could not fetch Access certs');
  const data = await res.json();
  accessCache = { at: Date.now(), keys: (data && data.keys) || [] };
  return accessCache.keys;
}

async function verifyAccess(token, domain, aud) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return false;
  let head, payload;
  try {
    head = JSON.parse(b64url(p[0]).toString('utf8'));
    payload = JSON.parse(b64url(p[1]).toString('utf8'));
  } catch (e) { return false; }
  if (head.alg !== 'RS256' || !head.kid) return false;
  const jwk = (await accessJwks(domain)).find((k) => k && k.kid === head.kid);
  if (!jwk) return false;
  let key;
  try { key = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch (e) { return false; }
  if (!crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), key, b64url(p[2]))) return false;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) return false;
  if (payload.nbf && now < payload.nbf - 60) return false;
  if (payload.iss && payload.iss !== 'https://' + domain) return false;
  if (aud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audiences.indexOf(aud) === -1) return false;
  }
  return true;
}

async function isAuthorized(event) {
  const domain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  if (domain && aud) {
    const token = reqHeader(event, 'cf-access-jwt-assertion');
    if (token) {
      try { if (await verifyAccess(token, domain, aud)) return true; } catch (e) { /* fall through */ }
    }
  }
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && reqHeader(event, 'x-admin-key') === expected;
}

module.exports = { isAuthorized };
