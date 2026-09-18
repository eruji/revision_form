/**
 * GET /clients/api/file?id=<file-id>
 * Streams one previously uploaded attachment back as an image/PDF.
 *
 * The id is 18 random bytes and is returned only to the client who uploaded the
 * file (and embedded in the submission / read-only view), so files stay private
 * without a login. Unknown ids return a plain 404.
 */
const { getStore } = require('@netlify/blobs');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  // Strong consistency so a file is readable the instant it finishes uploading.
  const opts = { name: name, consistency: 'strong' };
  if (siteID && token) { opts.siteID = siteID; opts.token = token; }
  return getStore(opts);
}

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const id = String(qs.id || '');
  if (!ID_RE.test(id)) return json(400, { ok: false, error: 'Invalid file id' });

  try {
    const store = openStore('revision-files');
    const meta = await store.get('meta_' + id, { type: 'json' });
    if (!meta) return json(404, { ok: false, error: 'Not found' });
    const bytes = await store.get('file_' + id, { type: 'arrayBuffer' });
    if (!bytes) return json(404, { ok: false, error: 'Not found' });

    const safeName = String(meta.name || 'attachment').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': meta.type || 'application/octet-stream',
        'Content-Disposition': 'inline; filename="' + safeName + '"',
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      },
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64')
    };
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load that file' });
  }
};
