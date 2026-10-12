/**
 * /api/config              (office-only — behind Cloudflare Access)
 *   GET  ?app=revision|homework  -> { ok, config } (stored override or null)
 *   POST { app, config }          -> save the config override
 *
 * /clients/api/config      (public) GET -> revision form config override
 * /homework/api/config     (public) GET -> Design Homework config override
 *
 * Stored config overrides are kept in Netlify Blobs ("site-config") so the
 * office's Setup edits apply to every client, not just one browser. Clients
 * fetch the override and deep-merge it over the shipped defaults in config.js.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

let accessCache = { at: 0, keys: null };
function reqHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}
function b64url(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
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

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const STORE = 'site-config';
const KEY_REVISION = 'revision-form';
const KEY_HOMEWORK = 'homework';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const path = event.path || '';
  const isOffice = /\/api\/config$/.test(path);
  const isRevisionPublic = /\/clients\/api\/config$/.test(path);
  const isHomeworkPublic = /\/homework\/api\/config$/.test(path);

  // Public read-only endpoints for the client forms.
  if (isRevisionPublic || isHomeworkPublic) {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });
    try {
      const store = openStore(STORE);
      const key = isHomeworkPublic ? KEY_HOMEWORK : KEY_REVISION;
      const config = (await store.get(key, { type: 'json' })) || null;
      return json(200, { ok: true, config: config });
    } catch (e) {
      return json(200, { ok: true, config: null }); // fall back to shipped defaults
    }
  }

  // Office endpoint (behind Cloudflare Access).
  if (isOffice) {
    if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

    const qs = event.queryStringParameters || {};
    const app = (qs.app === 'homework') ? KEY_HOMEWORK : KEY_REVISION;

    if (event.httpMethod === 'GET') {
      try {
        const store = openStore(STORE);
        const config = (await store.get(app, { type: 'json' })) || null;
        return json(200, { ok: true, app: qs.app || 'revision', config: config });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not load config' });
      }
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
      if (!body.config || typeof body.config !== 'object') return json(400, { ok: false, error: 'Missing config' });
      try {
        const store = openStore(STORE);
        await store.setJSON(app, body.config);
        return json(200, { ok: true, app: body.app || (app === KEY_HOMEWORK ? 'homework' : 'revision'), config: body.config });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not save config' });
      }
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  }

  return json(404, { ok: false, error: 'Not found' });
};
