/**
 * /api/draft
 *   POST   { code?, data }  -> { ok, code, resumeUrl }   save / update a draft
 *   GET    ?code=XXXX-XXXX   -> { ok, data, savedAt }     load a draft
 *   DELETE ?code=XXXX-XXXX   -> { ok }                    remove a draft
 *
 * Lets a client stop halfway through a long form and resume on any device
 * with a short, human-friendly code. Drafts are keyed by the hash of the code.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const MAX_BYTES = 200 * 1024;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

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

exports.handler = async (event) => {
  const store = getStore('revision-drafts');
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

    await store.setJSON(draftKey(code), { data: data, savedAt: new Date().toISOString() });
    return json(200, { ok: true, code: code, resumeUrl: '/?resume=' + encodeURIComponent(code) });
  }

  if (event.httpMethod === 'GET') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!code) return json(400, { ok: false, error: 'Missing code' });
    const record = await store.get(draftKey(code), { type: 'json' });
    if (!record) return json(404, { ok: false, error: 'Draft not found' });
    return json(200, { ok: true, code: code, data: record.data, savedAt: record.savedAt });
  }

  if (event.httpMethod === 'DELETE') {
    const code = String(qs.code || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return json(400, { ok: false, error: 'Invalid code' });
    await store.delete(draftKey(code));
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: 'Method not allowed' });
};
