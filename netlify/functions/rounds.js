/**
 * /api/rounds  (office-only — sits behind Cloudflare Access)
 *   Office-issued revision request links.
 *
 *   GET                           (admin)   -> list all rounds
 *   POST  {clientName, projectName, designPhase, note}  (admin) -> create
 *   POST  {action:'reopen', id}   (admin)   -> reopen a submitted round
 *   DELETE ?id=<roundId>          (admin)   -> remove a round
 *
 * The public, read-only half of this lives at GET /clients/api/round?id=…
 * A round bakes in the client / project / design phase so the client form can
 * skip section 01 entirely. The id is a random, unguessable token.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');
const { onRoundLink } = require('./lib/notify');
// ── Authorization ─────────────────────────────────────────────────────────
// Cloudflare Access JWT (Zero Trust) when CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD
// are set, else the ADMIN_PASSWORD fallback via x-admin-key. The JWT check is
// what stops the raw *.netlify.app origin from bypassing Cloudflare.
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

const INDEX_KEY = '__rounds_index__';
const DEFAULT_EXPIRY_DAYS = 14; // a round auto-expires if not submitted in time

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function newId() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 url-safe chars
}

function siteBase() {
  return String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/+$/, '');
}

function normalizeEmail(v) {
  const s = String(v || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function expiryFor(value, fromDate) {
  const base = fromDate || new Date();
  const parsed = value ? new Date(String(value)) : null;
  if (parsed && !isNaN(parsed)) {
    // Preserve the entered date at end-of-day in UTC.
    parsed.setUTCHours(23, 59, 59, 999);
    return parsed.toISOString();
  }
  const d = new Date(base.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

// Keep a pasted link safe: require http(s), and tolerate a missing scheme.
function cleanUrl(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (e) { return ''; }
}

function summary(round) {
  const last = round.submissions && round.submissions.length ? round.submissions[round.submissions.length - 1] : null;
  return {
    id: round.id,
    clientName: round.clientName,
    clientEmail: round.clientEmail || '',
    projectName: round.projectName,
    designPhase: round.designPhase,
    note: round.note || '',
    driveUrl: round.driveUrl || '',
    rooms: round.rooms || [],
    status: round.status,
    createdAt: round.createdAt,
    reopenedAt: round.reopenedAt || null,
    expiresAt: round.expiresAt || null,
    submittedAt: last ? last.submittedAt : null,
    itemCount: last ? last.itemCount : 0,
    reopenCount: round.reopenCount || 0
  };
}

async function upsertIndex(store, round) {
  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
  index = index.filter((r) => r && r.id !== round.id);
  index.unshift(summary(round));
  await store.setJSON(INDEX_KEY, index);
  return index;
}

async function getRound(store, id) {
  if (!id) return null;
  return store.get('round_' + id, { type: 'json' });
}

exports.handler = async (event) => {
  const store = openStore('revision-rounds');
  const qs = event.queryStringParameters || {};

  // Everything below is office-only.
  if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

  if (event.httpMethod === 'GET') {
    let index = [];
    try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
    return json(200, { ok: true, rounds: index, emailFrom: process.env.EMAIL_FROM || '' });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
    const action = body.action || qs.action;

    if (action === 'send') {
      const round = await getRound(store, body.id || qs.id);
      if (!round) return json(404, { ok: false, error: 'Not found' });
      if (!round.clientEmail) return json(400, { ok: false, error: 'This request has no client email' });
      round.clientLink = siteBase() + '/clients/form.html?r=' + round.id;
      try {
        const result = await onRoundLink(round, { subject: body.subject, message: body.message });
        return json(200, { ok: true, sent: result.sent, to: result.to, emailFrom: process.env.EMAIL_FROM || '' });
      } catch (e) {
        return json(500, { ok: false, error: e && e.message ? e.message : 'Could not send the email' });
      }
    }

    if (action === 'update') {
      const round = await getRound(store, body.id || qs.id);
      if (!round) return json(404, { ok: false, error: 'Not found' });
      if (round.status !== 'open') return json(400, { ok: false, error: 'This request has already been submitted and can no longer be edited' });

      ['clientName', 'projectName', 'designPhase', 'note'].forEach((f) => {
        if (body[f] !== undefined) round[f] = String(body[f] || '').trim();
      });
      if (body.clientEmail !== undefined) round.clientEmail = normalizeEmail(body.clientEmail);
      if (body.driveUrl !== undefined) round.driveUrl = cleanUrl(body.driveUrl);

      if (body.createdAt) {
        const d = new Date(String(body.createdAt));
        if (!isNaN(d)) {
          const prev = new Date(round.createdAt);
          d.setHours(prev.getHours(), prev.getMinutes(), prev.getSeconds(), prev.getMilliseconds());
          round.createdAt = d.toISOString();
        }
      }
      if (body.expiresAt) round.expiresAt = expiryFor(body.expiresAt);

      if (!round.projectName) return json(400, { ok: false, error: 'Project name is required' });

      await store.setJSON('round_' + round.id, round);
      await upsertIndex(store, round);
      return json(200, { ok: true, round: summary(round) });
    }

    if (action === 'reopen') {
      const round = await getRound(store, body.id || qs.id);
      if (!round) return json(404, { ok: false, error: 'Not found' });
      round.status = 'open';
      round.reopenedAt = new Date().toISOString();
      round.reopenCount = (round.reopenCount || 0) + 1;
      round.expiresAt = expiryFor(body.expiresAt, round.reopenedAt);
      if (body.clientEmail !== undefined) {
        round.clientEmail = normalizeEmail(body.clientEmail) || round.clientEmail;
      }
      round.reminders = {}; // fresh reminder cycle for the reopened round
      await store.setJSON('round_' + round.id, round);
      await upsertIndex(store, round);
      return json(200, { ok: true, round: summary(round), link: '/clients/form.html?r=' + round.id });
    }

    const projectName = String(body.projectName || '').trim();
    if (!projectName) return json(400, { ok: false, error: 'Project name is required' });

    // Areas/rooms in scope. Each gets a stable id so the client can group
    // revisions under it and the draft survives a reload.
    const rooms = (Array.isArray(body.rooms) ? body.rooms : [])
      .map((r) => String((r && r.name) || r || '').trim())
      .filter(Boolean)
      .slice(0, 60)
      .map((name) => ({ id: crypto.randomBytes(4).toString('hex'), name: name }));

    const round = {
      id: newId(),
      clientName: String(body.clientName || '').trim(),
      clientEmail: normalizeEmail(body.clientEmail),
      projectName: projectName,
      designPhase: String(body.designPhase || '').trim(),
      note: String(body.note || '').trim(),
      driveUrl: cleanUrl(body.driveUrl),
      rooms: rooms,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: expiryFor(body.expiresAt),
      submissions: [],
      reminders: {},
      reopenCount: 0
    };
    await store.setJSON('round_' + round.id, round);
    await upsertIndex(store, round);
    return json(200, { ok: true, round: summary(round), link: '/clients/form.html?r=' + round.id, emailFrom: process.env.EMAIL_FROM || '' });
  }

  if (event.httpMethod === 'DELETE') {
    let id = qs.id;
    if (!id) { try { id = JSON.parse(event.body || '{}').id; } catch (e) { id = null; } }
    if (!id) return json(400, { ok: false, error: 'Missing id' });
    await store.delete('round_' + id);
    let index = [];
    try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
    await store.setJSON(INDEX_KEY, index.filter((r) => r && r.id !== id));
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: 'Method not allowed' });
};
