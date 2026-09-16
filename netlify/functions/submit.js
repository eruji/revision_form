/**
 * POST /api/submit
 * Stores a completed revision request and returns a private read token.
 *
 * Privacy model:
 *   - The returned token is 24 random bytes (base64url). Only the client who
 *     submitted receives it.
 *   - We store the submission keyed by the SHA-256 hash of the token, so the
 *     raw token is never persisted.
 *   - There is no public endpoint that lists submissions; that requires the
 *     admin password (see admin.js).
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const MAX_BYTES = 200 * 1024; // 200 KB per submission

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function pickAbout(submission, pattern) {
  const about = submission.about || {};
  const labels = (submission._labels && submission._labels.about) || {};
  const id = Object.keys(labels).find((k) => pattern.test(labels[k]));
  return id ? about[id] : '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let submission;
  try {
    const raw = event.body || '';
    if (raw.length > MAX_BYTES) return json(413, { ok: false, error: 'Submission is too large' });
    const parsed = JSON.parse(raw);
    submission = parsed && parsed.submission ? parsed.submission : parsed;
    if (!submission || !Array.isArray(submission.revisions)) throw new Error('bad payload');
  } catch (e) {
    return json(400, { ok: false, error: 'Invalid submission' });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const key = 'sub_' + hashToken(token);

  const record = {
    id: submission.id || key.slice(4, 16),
    submittedAt: submission.submittedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    submission: submission
  };

  try {
    const store = getStore('revision-submissions');
    await store.setJSON(key, record);

    // Maintain a lightweight index so the office dashboard doesn't need to
    // read every blob to render a list.
    let index = [];
    try {
      index = (await store.get('__index__', { type: 'json' })) || [];
    } catch (e) { index = []; }

    index.unshift({
      key: key,
      id: record.id,
      submittedAt: record.submittedAt,
      clientName: pickAbout(submission, /client name/i),
      projectName: pickAbout(submission, /project/i),
      itemCount: submission.revisions.length
    });
    await store.setJSON('__index__', index);

    return json(200, {
      ok: true,
      token: token,
      viewUrl: '/view.html?token=' + encodeURIComponent(token)
    });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not save submission' });
  }
};
