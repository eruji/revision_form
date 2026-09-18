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

// Blobs needs an explicit siteID + token when functions are deployed outside
// Netlify's own build (e.g. via `netlify deploy` from CI). When Netlify injects
// the context automatically, the fallback below is used.
function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}


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

/**
 * Fire-and-forget POST to the configured notification webhook (e.g. a Google
 * Apps Script that appends rows to a Sheet and emails the office). Never lets
 * a notification failure break the client submission.
 */
async function notify(payload) {
  const url = process.env.NOTIFY_WEBHOOK;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.error('notify webhook returned', res.status);
  } catch (e) {
    console.error('notify webhook failed:', e && e.message);
  }
}

/** Build a flattened, label-keyed payload for the Sheets/email integration. */
function notificationPayload(submission, viewUrl, round) {
  const L = submission._labels || {};
  const aboutLabels = (L.about) || {};
  const revisionLabels = (L.revision) || {};
  const ackLabels = (L.ack) || {};
  const items = (submission.revisions || []).map((rev) => {
    const row = {};
    Object.keys(revisionLabels).forEach((id) => { row[revisionLabels[id]] = rev[id] == null ? '' : rev[id]; });
    return row;
  });
  const about = {};
  Object.keys(aboutLabels).forEach((id) => { about[aboutLabels[id]] = submission.about[id] == null ? '' : submission.about[id]; });
  const acknowledgment = {};
  Object.keys(ackLabels).forEach((id) => { acknowledgment[ackLabels[id]] = submission.acknowledgment[id] == null ? '' : submission.acknowledgment[id]; });
  return {
    event: 'revision.submitted',
    submittedAt: submission.submittedAt || new Date().toISOString(),
    business: submission.business || '',
    round: round ? { id: round.id, note: round.note || '' } : null,
    about: about,
    items: items,
    acknowledgment: acknowledgment,
    viewUrl: viewUrl
  };
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
  const viewUrl = '/view.html?token=' + encodeURIComponent(token);

  // If this submission came from an office-issued link, pull the round context
  // and stamp it onto the submission (authoritative, not client-supplied).
  let round = null;
  const roundId = submission._roundId;
  try {
    if (roundId) {
      const roundStore = openStore('revision-rounds');
      round = await roundStore.get('round_' + roundId, { type: 'json' });
      if (round) {
        submission.about = submission.about || {};
        const labels = (submission._labels && submission._labels.about) || {};
        const setByLabel = (pattern, value) => {
          const id = Object.keys(labels).find((k) => pattern.test(labels[k]));
          if (id) submission.about[id] = value;
        };
        if (round.clientName) setByLabel(/client name/i, round.clientName);
        setByLabel(/project/i, round.projectName || '');
        setByLabel(/phase/i, round.designPhase || '');
      }
    }
  } catch (e) { /* non-fatal */ }

  // If no client name on the round, use the typed signature as the client name.
  try {
    const aboutLabels = (submission._labels && submission._labels.about) || {};
    const clientId = Object.keys(aboutLabels).find((k) => /client name/i.test(aboutLabels[k]));
    if (clientId && !submission.about[clientId]) {
      const ackLabels = (submission._labels && submission._labels.ack) || {};
      const sigId = Object.keys(ackLabels).find((k) => /client name|signature|electronic/i.test(ackLabels[k]));
      const sig = sigId ? submission.acknowledgment[sigId] : '';
      if (sig) submission.about[clientId] = sig;
    }
  } catch (e) { /* non-fatal */ }

  const record = {
    id: submission.id || key.slice(4, 16),
    submittedAt: submission.submittedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    submission: submission
  };

  try {
    const store = openStore('revision-submissions');
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

    // Update the office-issued round, if this came from one.
    if (round) {
      try {
        const roundStore = openStore('revision-rounds');
        round.status = 'submitted';
        round.submittedAt = record.submittedAt;
        round.submissions = round.submissions || [];
        round.submissions.push({ id: record.id, submittedAt: record.submittedAt, itemCount: submission.revisions.length });
        round.previousItems = submission.revisions;
        round.draftCode = null;
        await roundStore.setJSON('round_' + round.id, round);
        let rIdx = [];
        try { rIdx = (await roundStore.get('__rounds_index__', { type: 'json' })) || []; } catch (e) { rIdx = []; }
        rIdx = rIdx.filter((r) => r && r.id !== round.id);
        const last = round.submissions[round.submissions.length - 1];
        rIdx.unshift({
          id: round.id, clientName: round.clientName, projectName: round.projectName,
          designPhase: round.designPhase, status: round.status, createdAt: round.createdAt,
          submittedAt: last.submittedAt, itemCount: last.itemCount, reopenCount: round.reopenCount || 0
        });
        await roundStore.setJSON('__rounds_index__', rIdx);
      } catch (e) { /* non-fatal */ }
    }

    // Notify the office (email + Google Sheet work queue).
    try {
      let absView = viewUrl;
      try {
        const host = event.headers && (event.headers.host || event.headers.Host);
        const proto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'])) || 'https';
        if (host) absView = proto + '://' + host + viewUrl;
      } catch (e) {}
      await notify(notificationPayload(submission, absView, round));
    } catch (e) { /* never break the submission */ }

    return json(200, {
      ok: true,
      token: token,
      viewUrl: viewUrl
    });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not save submission' });
  }
};
