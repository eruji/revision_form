/**
 * /homework/api/draft
 *   POST   { code?, data } -> { ok, code, resumeUrl, expiresAt }  save/update
 *   GET    ?code=XXXX-XXXX  -> { ok, data, savedAt, expiresAt }    load
 *   DELETE ?code=XXXX-XXXX  -> { ok }                              remove
 *
 * Lets a client stop halfway through the homework and resume on any device
 * with a short, human-friendly code. Drafts expire after 30 days.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');
const { sendEmail, resumeDraftEmail } = require('./lib/notify');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const MAX_BYTES = 512 * 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const INDEX_KEY = '__draft_index__';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
function absUrl(event, path) {
  try {
    const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
    const proto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'])) || 'https';
    return host ? proto + '://' + host + path : path;
  } catch (e) { return path; }
}
function newCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
function draftKey(code) {
  return 'draft_' + crypto.createHash('sha256').update(code).digest('hex');
}
function summaryFrom(code, data, savedAt, expiresAt) {
  const c = data.client || {};
  let count = 0;
  const sel = data.selections || {};
  Object.keys(sel).forEach((k) => { const v = sel[k]; count += Array.isArray(v) ? v.length : (v ? 1 : 0); });
  return {
    code, savedAt, expiresAt,
    clientName: c.name || '', projectName: c.project || '', email: c.email || '',
    selectionCount: count, step: data.step || ''
  };
}
async function updateIndex(store, entry, remove) {
  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
  index = index.filter((e) => e && e.code !== entry.code);
  if (!remove) index.unshift(entry);
  await store.setJSON(INDEX_KEY, index);
}

exports.handler = async (event) => {
  const store = openStore('homework-drafts');
  const qs = event.queryStringParameters || {};

  if (event.httpMethod === 'POST') {
    if ((event.body || '').length > MAX_BYTES) return json(413, { ok: false, error: 'Draft is too large' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
    const data = body.data;
    if (!data || typeof data !== 'object') return json(400, { ok: false, error: 'Missing draft data' });

    let code = String(body.code || '').trim().toUpperCase();
    if (code && !CODE_RE.test(code)) return json(400, { ok: false, error: 'Invalid code' });
    const isNew = !code;
    if (!code) code = newCode();

    const savedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    await store.setJSON(draftKey(code), { code, data, savedAt, expiresAt });
    await updateIndex(store, summaryFrom(code, data, savedAt, expiresAt), false);

    // Email the client their resume link on the first save (the resume link
    // differs from the office-issued ?r= link, so don't leave them stranded).
    if (isNew) {
      try {
        const c = data.client || {};
        const email = String(c.email || '').trim();
        if (email) {
          const resumeUrl = absUrl(event, '/homework/index.html?resume=' + encodeURIComponent(code));
          const msg = resumeDraftEmail({ name: c.name || '', project: c.project || '', resumeUrl: resumeUrl, app: 'Design Homework' });
          await sendEmail({ to: email, subject: msg.subject, text: msg.text, html: msg.html });
        }
      } catch (e) { /* never break the save */ }
    }

    return json(200, { ok: true, code, resumeUrl: '/homework/index.html?resume=' + encodeURIComponent(code), expiresAt });
  }

  if (event.httpMethod === 'GET') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!code) return json(400, { ok: false, error: 'Missing code' });
    const record = await store.get(draftKey(code), { type: 'json' });
    if (!record) return json(404, { ok: false, error: 'Draft not found' });
    if (record.expiresAt && Date.now() > Date.parse(record.expiresAt)) {
      await store.delete(draftKey(code));
      await updateIndex(store, { code }, true);
      return json(404, { ok: false, error: 'Draft expired' });
    }
    return json(200, { ok: true, code, data: record.data, savedAt: record.savedAt, expiresAt: record.expiresAt });
  }

  if (event.httpMethod === 'DELETE') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return json(400, { ok: false, error: 'Invalid code' });
    await store.delete(draftKey(code));
    await updateIndex(store, { code }, true);
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: 'Method not allowed' });
};
