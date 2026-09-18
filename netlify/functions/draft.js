/**
 * /api/draft
 *   POST   { code?, data }  -> { ok, code, resumeUrl }   save / update a draft
 *   GET    ?code=XXXX-XXXX   -> { ok, data, savedAt }     load a draft
 *   DELETE ?code=XXXX-XXXX   -> { ok }                    remove a draft
 *
 * Lets a client stop halfway through a long form and resume on any device
 * with a short, human-friendly code. Drafts are keyed by the hash of the code.
 * The raw code + a small summary are kept in an index so the office dashboard
 * can list drafts and hand the link back to the client.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Blobs needs an explicit siteID + token when functions are deployed outside
// Netlify's own build (e.g. via `netlify deploy` from CI). When Netlify injects
// the context automatically, the fallback below is used.
function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const MAX_BYTES = 512 * 1024; // room for a drawn signature + attachment references
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // drafts expire 30 days after saving
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const INDEX_KEY = '__draft_index__';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
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
  const about = data.about || {};
  return {
    code: code,
    savedAt: savedAt,
    expiresAt: expiresAt,
    clientName: about.clientName || '',
    projectName: about.projectName || '',
    itemCount: Array.isArray(data.items) ? data.items.length : 0
  };
}

function expiryFor(record) {
  if (record.expiresAt) return record.expiresAt;
  if (record.savedAt) return new Date(Date.parse(record.savedAt) + TTL_MS).toISOString();
  return null;
}

async function updateIndex(store, entry, remove) {
  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
  index = index.filter((e) => e && e.code !== entry.code);
  if (!remove) index.unshift(entry);
  await store.setJSON(INDEX_KEY, index);
}

exports.handler = async (event) => {
  const store = openStore('revision-drafts');
  const qs = event.queryStringParameters || {};

  if (event.httpMethod === 'POST') {
    if ((event.body || '').length > MAX_BYTES) return json(413, { ok: false, error: 'Draft is too large' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }

    const data = body.data;
    if (!data || typeof data !== 'object') return json(400, { ok: false, error: 'Missing draft data' });

    let code = String(body.code || '').trim().toUpperCase();
    if (code && !CODE_RE.test(code)) return json(400, { ok: false, error: 'Invalid code' });
    if (!code) code = newCode();

    const savedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
    await store.setJSON(draftKey(code), { code: code, data: data, savedAt: savedAt, expiresAt: expiresAt });
    await updateIndex(store, summaryFrom(code, data, savedAt, expiresAt), false);

    return json(200, { ok: true, code: code, resumeUrl: '/?resume=' + encodeURIComponent(code), expiresAt: expiresAt });
  }

  if (event.httpMethod === 'GET') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!code) return json(400, { ok: false, error: 'Missing code' });
    const record = await store.get(draftKey(code), { type: 'json' });
    if (!record) return json(404, { ok: false, error: 'Draft not found' });

    const expiresAt = expiryFor(record);
    if (expiresAt && Date.now() > Date.parse(expiresAt)) {
      await store.delete(draftKey(code));
      await updateIndex(store, { code: code }, true);
      return json(404, { ok: false, error: 'Draft expired' });
    }

    return json(200, { ok: true, code: code, data: record.data, savedAt: record.savedAt, expiresAt: expiresAt });
  }

  if (event.httpMethod === 'DELETE') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return json(400, { ok: false, error: 'Invalid code' });
    await store.delete(draftKey(code));
    await updateIndex(store, { code: code }, true);
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: 'Method not allowed' });
};
