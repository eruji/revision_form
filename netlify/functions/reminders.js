/**
 * Scheduled reminders — runs daily (see netlify.toml).
 *
 * For every office-issued round that is still open and not submitted:
 *   - 7 days after it was sent (or reopened) and no submission → send the
 *     client + office a "you haven't submitted" reminder with the expiry date.
 *   - 48 hours before the round's expiration date (if still open) → send a
 *     final "expiring soon" reminder.
 *
 * Each reminder fires once per round per cycle; the sent flags are stored on
 * the round and cleared when the round is reopened.
 */
const { getStore } = require('@netlify/blobs');
const { onReminder, emailConfigured } = require('./lib/notify');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const INDEX_KEY = '__rounds_index__';
const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_AFTER_DAYS = 7;
const EXPIRING_WITHIN_MS = 48 * 60 * 60 * 1000;

function siteBase() {
  return String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/+$/, '');
}

function summary(round) {
  const last = round.submissions && round.submissions.length ? round.submissions[round.submissions.length - 1] : null;
  return {
    id: round.id,
    clientName: round.clientName,
    clientEmail: round.clientEmail || '',
    projectName: round.projectName,
    designPhase: round.designPhase,
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
}

exports.handler = async () => {
  const store = openStore('revision-rounds');
  const base = siteBase();
  const now = Date.now();

  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }

  let sent = 0;
  let errors = 0;

  for (const entry of index) {
    if (!entry || !entry.id) continue;
    if (entry.status !== 'open') continue;

    let round;
    try { round = await store.get('round_' + entry.id, { type: 'json' }); }
    catch (e) { errors++; continue; }
    if (!round || round.status !== 'open') continue;

    const sentAt = Date.parse(round.reopenedAt || round.createdAt);
    const expiresAt = Date.parse(round.expiresAt);
    const reminders = round.reminders || {};
    let changed = false;

    // Client link is used inside the reminder copy.
    round.clientLink = base ? base + '/clients/form.html?r=' + round.id : '';

    // 7-day "you have not submitted" reminder (skip if already expired).
    if (!reminders.day7 && sentAt && (now - sentAt) >= REMIND_AFTER_DAYS * DAY_MS) {
      if (!expiresAt || now < expiresAt) {
        try {
          const result = await onReminder(round, 'day7');
          // Only mark sent if email actually went out, or no email is configured
          // (the chat channels already fired once) so we don't silently skip.
          if (result.emailSent || !emailConfigured()) { reminders.day7 = new Date().toISOString(); sent++; changed = true; }
        }
        catch (e) { console.error('day7 reminder failed:', e && e.message); errors++; }
      }
    }

    // Final "expiring soon" reminder within 48h of the expiry date.
    if (!reminders.expiring && expiresAt && now >= expiresAt - EXPIRING_WITHIN_MS && now < expiresAt) {
      try {
        const result = await onReminder(round, 'expiring');
        if (result.emailSent || !emailConfigured()) { reminders.expiring = new Date().toISOString(); sent++; changed = true; }
      }
      catch (e) { console.error('expiring reminder failed:', e && e.message); errors++; }
    }

    if (changed) {
      round.reminders = reminders;
      try { await store.setJSON('round_' + round.id, round); await upsertIndex(store, round); }
      catch (e) { console.error('could not persist reminder flags:', e && e.message); }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, remindersSent: sent, errors: errors })
  };
};
