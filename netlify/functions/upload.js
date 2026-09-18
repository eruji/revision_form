/**
 * POST /clients/api/upload   { name, type, dataUrl }  -> { ok, file }
 *
 * Stores one client attachment (photo or PDF) in Netlify Blobs and returns a
 * stable, unguessable URL the form can reference. The file id is 18 random
 * bytes, so a file is only reachable by whoever received its URL — nothing
 * lists files and there is no folder browsing.
 *
 * Why a separate endpoint: the whole submission has a small size budget, while
 * photos do not. Uploading each file on its own keeps the final submit payload
 * tiny (it only carries { id, name, type, size, url } references).
 *
 * Storage layout (store: revision-files):
 *   file_<id>   raw bytes (ArrayBuffer)
 *   meta_<id>   { id, name, type, size, uploadedAt }
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// Blobs needs an explicit siteID + token when functions are deployed outside
// Netlify's own build (e.g. via `netlify deploy` from CI). When Netlify injects
// the context automatically, the fallback below is used.
function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  // Strong consistency: the just-uploaded file must be fetchable immediately
  // (the form renders its thumbnail right away).
  const opts = { name: name, consistency: 'strong' };
  if (siteID && token) { opts.siteID = siteID; opts.token = token; }
  return getStore(opts);
}

// Netlify Functions cap a request body at ~6 MB; base64 inflates by ~33%, so a
// 4 MB file is the safe ceiling. The client also downscales large images.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
  'image/gif': true,
  'application/pdf': true
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  return { type: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  if ((event.body || '').length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'File is too large (max 4 MB)' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }

  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) return json(400, { ok: false, error: 'Missing file data' });

  const type = String(body.type || parsed.type || '').toLowerCase();
  if (!ALLOWED_TYPES[type]) return json(415, { ok: false, error: 'Unsupported file type' });
  if (!parsed.buffer.length) return json(400, { ok: false, error: 'That file is empty' });
  if (parsed.buffer.length > MAX_FILE_BYTES) return json(413, { ok: false, error: 'File is too large (max 4 MB)' });

  const id = crypto.randomBytes(18).toString('base64url');
  const name = String(body.name || 'attachment').slice(0, 160);
  const meta = { id: id, name: name, type: type, size: parsed.buffer.length, uploadedAt: new Date().toISOString() };

  try {
    const store = openStore('revision-files');
    // @netlify/blobs accepts ArrayBuffer | Blob | string — convert the Buffer.
    const bytes = parsed.buffer.buffer.slice(parsed.buffer.byteOffset, parsed.buffer.byteOffset + parsed.buffer.byteLength);
    await store.set('file_' + id, bytes);
    await store.setJSON('meta_' + id, meta);
  } catch (e) {
    return json(500, { ok: false, error: 'Could not store that file' });
  }

  const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
  const proto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'])) || 'https';
  const url = host
    ? proto + '://' + host + '/clients/api/file?id=' + encodeURIComponent(id)
    : '/clients/api/file?id=' + encodeURIComponent(id);

  return json(200, {
    ok: true,
    file: { id: id, name: name, type: type, size: meta.size, url: url }
  });
};
