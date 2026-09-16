/**
 * GET /api/get?token=...
 * Returns ONE submission, only if the caller holds its private token.
 * No token => no data. Unknown token => 404 (never leaks whether other
 * submissions exist).
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  const token = (event.queryStringParameters && event.queryStringParameters.token) || '';
  if (!token) return json(400, { ok: false, error: 'Missing token' });

  const key = 'sub_' + crypto.createHash('sha256').update(token).digest('hex');

  try {
    const store = getStore('revision-submissions');
    const record = await store.get(key, { type: 'json' });
    if (!record) return json(404, { ok: false, error: 'Not found' });
    return json(200, {
      ok: true,
      submittedAt: record.submittedAt,
      submission: record.submission
    });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load submission' });
  }
};
