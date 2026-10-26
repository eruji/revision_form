/**
 * POST /homework/api/submit
 * Stores a completed Client Design Homework and returns a private read token.
 *
 * Privacy: the token is 24 random bytes; only the client who submitted gets it.
 * We store the record keyed by SHA-256(token), so the raw token is never
 * persisted. There is no public endpoint that lists submissions.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');
const { onHomeworkSubmission, emailConfigured } = require('./lib/notify');

// Blobs needs explicit siteID + token when deployed outside Netlify's build.
function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const MAX_BYTES = 512 * 1024;

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

/** One row per selection / note, for the Google Sheet work queue. */
function flatRows(sub) {
  const rows = [];
  (sub.sections || []).forEach((s) => {
    if (s.skipped) {
      rows.push({ section: s.number + ' · ' + s.title, category: '', selection: '(skipped — not applicable)', note: '' });
      return;
    }
    (s.items || []).forEach((it) => {
      const sel = (it.options && it.options.length) ? it.options.join(', ') : '';
      if (!sel && !it.note) return;
      rows.push({ section: s.number + ' · ' + s.title, category: it.category, selection: sel, note: it.note || '' });
    });
  });
  return rows;
}

function budgetRows(sub) {
  return (sub.budget || []).filter((b) => b.tier || b.note).map((b) => ({
    label: b.label, tier: b.tier || '', note: b.note || ''
  }));
}

/** Fire-and-forget POST to the Google Apps Script webhook. */
async function notifyWebhook(payload) {
  const url = process.env.NOTIFY_WEBHOOK;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.error('notify webhook returned', res.status);
  } catch (e) { console.error('notify webhook failed:', e && e.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let sub;
  try {
    const raw = event.body || '';
    if (raw.length > MAX_BYTES) return json(413, { ok: false, error: 'Submission is too large' });
    const parsed = JSON.parse(raw);
    sub = parsed && parsed.submission ? parsed.submission : parsed;
    if (!sub || !Array.isArray(sub.sections)) throw new Error('bad payload');
  } catch (e) {
    return json(400, { ok: false, error: 'Invalid submission' });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const key = 'hw_' + hashToken(token);
  const viewUrl = '/homework/view.html?token=' + encodeURIComponent(token);

  // If this came from an office-issued homework link, pull the round context
  // and stamp it onto the submission (authoritative, not client-supplied).
  let round = null;
  const roundId = sub._roundId;
  try {
    if (roundId) {
      const roundStore = openStore('homework-rounds');
      round = await roundStore.get('round_' + roundId, { type: 'json' });
      if (round) {
        sub.client = sub.client || {};
        if (round.clientName) sub.client.name = sub.client.name || round.clientName;
        sub.client.project = round.projectName || sub.client.project || '';
        if (round.clientEmail) sub.client.email = sub.client.email || round.clientEmail;
      }
    }
  } catch (e) { /* non-fatal */ }

  const client = sub.client || {};
  const record = {
    id: key.slice(3, 15),
    submittedAt: sub.submittedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    submission: sub
  };

  try {
    const store = openStore('homework-submissions');
    await store.setJSON(key, record);

    // Lightweight index for the office dashboard.
    let index = [];
    try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }
    index.unshift({
      key: key,
      id: record.id,
      submittedAt: record.submittedAt,
      clientName: client.name || '',
      projectName: client.project || '',
      email: client.email || '',
      roundId: sub._roundId || '',
      selectionCount: flatRows(sub).filter((r) => r.selection && r.selection.indexOf('skipped') === -1).length
    });
    await store.setJSON('__index__', index);

    // Update the office-issued round, if this came from one.
    if (round) {
      try {
        const roundStore = openStore('homework-rounds');
        round.status = 'submitted';
        round.submittedAt = record.submittedAt;
        round.submissions = round.submissions || [];
        const selCount = flatRows(sub).filter((r) => r.selection && r.selection.indexOf('skipped') === -1).length;
        round.submissions.push({ id: record.id, submittedAt: record.submittedAt, selectionCount: selCount });
        round.draftCode = null;
        await roundStore.setJSON('round_' + round.id, round);

        let rIdx = [];
        try { rIdx = (await roundStore.get('__rounds_index__', { type: 'json' })) || []; } catch (e) { rIdx = []; }
        rIdx = rIdx.filter((r) => r && r.id !== round.id);
        const last = round.submissions[round.submissions.length - 1];
        rIdx.unshift({
          id: round.id, clientName: round.clientName, clientEmail: round.clientEmail || '',
          projectName: round.projectName, note: round.note || '', driveUrl: round.driveUrl || '',
          status: round.status, createdAt: round.createdAt, reopenedAt: round.reopenedAt || null,
          expiresAt: round.expiresAt || null, submittedAt: last.submittedAt,
          selectionCount: last.selectionCount, reopenCount: round.reopenCount || 0
        });
        await roundStore.setJSON('__rounds_index__', rIdx);
      } catch (e) { /* non-fatal */ }
    }

    // Notifications: robust email first, then the Sheet webhook (which skips its
    // own email when we already sent one).
    try {
      let absView = viewUrl;
      try {
        const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
        const proto = (event.headers && (event.headers['x-forwarded-proto'] || event.headers['X-Forwarded-Proto'])) || 'https';
        const base = String(process.env.PUBLIC_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/+$/, '');
        if (base) absView = base + viewUrl;
        else if (host) absView = proto + '://' + host + viewUrl;
      } catch (e) { /* keep relative */ }

      await onHomeworkSubmission(sub, { viewUrl: absView });
      await notifyWebhook({
        event: 'homework.submitted',
        submittedAt: record.submittedAt,
        business: sub.business || 'Pepper & Olive Interiors',
        client: client,
        rows: flatRows(sub),
        budget: budgetRows(sub),
        viewUrl: absView,
        skipEmail: emailConfigured()
      });
    } catch (e) { /* never break the submission */ }

    return json(200, { ok: true, token: token, viewUrl: viewUrl });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not save submission' });
  }
};
