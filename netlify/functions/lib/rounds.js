/**
 * Generic office-issued round handler.
 *
 * A "round" is one link the office creates for a client (revision request,
 * Design Homework, or any future form). Each form type gets its own Blobs
 * store but shares this CRUD/link lifecycle:
 *
 *   GET                           (admin)   -> list all rounds
 *   POST  {clientName, projectName, …}      -> create
 *   POST  {action:'send', id}               -> email the client their link
 *   POST  {action:'update', id, …}          -> edit an open round
 *   POST  {action:'reopen', id}             -> reopen a submitted round
 *   DELETE ?id=<roundId>                    -> remove a round
 *
 * To add a new form type, create a thin function with a config like:
 *
 *   exports.handler = createRoundsHandler({
 *     storeName: 'my-form-rounds',
 *     linkPath: '/my-form/?r=',
 *     notifyLink: onMyFormRoundLink
 *   });
 */
const crypto = require('crypto');
const { openStore } = require('./store');
const { isAuthorized } = require('./auth');

const INDEX_KEY = '__rounds_index__';
const DEFAULT_EXPIRY_DAYS = 14; // a round auto-expires if not submitted in time

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function newId() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 url-safe chars
}

function siteBase() {
  return String(process.env.PUBLIC_BASE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/+$/, '');
}

function normalizeEmail(v) {
  const s = String(v || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function expiryFor(value, fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  if (isNaN(base)) return expiryFor(value);
  const parsed = value ? new Date(String(value)) : null;
  if (parsed && !isNaN(parsed)) {
    // Preserve the entered date at end-of-day in UTC.
    parsed.setUTCHours(23, 59, 59, 999);
    return parsed.toISOString();
  }
  const d = new Date(base.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

// Keep a pasted link safe: require http(s), and tolerate a missing scheme.
function cleanUrl(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (e) { return ''; }
}

function summary(round) {
  const last = round.submissions && round.submissions.length ? round.submissions[round.submissions.length - 1] : null;
  return {
    id: round.id,
    clientName: round.clientName,
    clientEmail: round.clientEmail || '',
    projectName: round.projectName,
    designPhase: round.designPhase || '',
    note: round.note || '',
    driveUrl: round.driveUrl || '',
    rooms: round.rooms || [],
    status: round.status,
    createdAt: round.createdAt,
    reopenedAt: round.reopenedAt || null,
    expiresAt: round.expiresAt || null,
    submittedAt: last ? last.submittedAt : null,
    itemCount: last ? (last.itemCount || 0) : 0,
    selectionCount: last ? (last.selectionCount || 0) : 0,
    reopenCount: round.reopenCount || 0
  };
}

async function upsertIndex(store, round) {
  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
  index = index.filter((r) => r && r.id !== round.id);
  index.unshift(summary(round));
  await store.setJSON(INDEX_KEY, index);
  return index;
}

async function getRound(store, id) {
  if (!id) return null;
  return store.get('round_' + id, { type: 'json' });
}

function createRoundsHandler(config) {
  if (!config || !config.storeName) throw new Error('createRoundsHandler requires a storeName');
  if (typeof config.notifyLink !== 'function') throw new Error('createRoundsHandler requires notifyLink');

  const storeName = config.storeName;
  const linkPath = config.linkPath || '/';
  const notifyLink = config.notifyLink;
  const noEmailError = config.noEmailError || 'This link has no client email';
  const submittedError = config.submittedError || 'This form has already been submitted and can no longer be edited';
  const sendError = config.sendError || 'Could not send the email';

  return async function handler(event) {
    const store = openStore(storeName);
    const qs = event.queryStringParameters || {};

    // Everything below is office-only.
    if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

    if (event.httpMethod === 'GET') {
      let index = [];
      try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
      return json(200, { ok: true, rounds: index, emailFrom: process.env.EMAIL_FROM || '' });
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
      const action = body.action || qs.action;

      if (action === 'send') {
        const round = await getRound(store, body.id || qs.id);
        if (!round) return json(404, { ok: false, error: 'Not found' });
        if (!round.clientEmail) return json(400, { ok: false, error: noEmailError });
        round.clientLink = siteBase() + linkPath + round.id;
        try {
          const result = await notifyLink(round, { subject: body.subject, message: body.message });
          return json(200, { ok: true, sent: result.sent, to: result.to, emailFrom: process.env.EMAIL_FROM || '' });
        } catch (e) {
          return json(500, { ok: false, error: e && e.message ? e.message : sendError });
        }
      }

      if (action === 'update') {
        const round = await getRound(store, body.id || qs.id);
        if (!round) return json(404, { ok: false, error: 'Not found' });
        if (round.status !== 'open') return json(400, { ok: false, error: submittedError });

        ['clientName', 'projectName', 'designPhase', 'note'].forEach((f) => {
          if (body[f] !== undefined) round[f] = String(body[f] || '').trim();
        });
        if (body.clientEmail !== undefined) round.clientEmail = normalizeEmail(body.clientEmail);
        if (body.driveUrl !== undefined) round.driveUrl = cleanUrl(body.driveUrl);

        if (body.createdAt) {
          const d = new Date(String(body.createdAt));
          if (!isNaN(d)) {
            const prev = new Date(round.createdAt);
            d.setHours(prev.getHours(), prev.getMinutes(), prev.getSeconds(), prev.getMilliseconds());
            round.createdAt = d.toISOString();
          }
        }
        if (body.expiresAt) round.expiresAt = expiryFor(body.expiresAt);

        if (!round.projectName) return json(400, { ok: false, error: 'Project name is required' });

        await store.setJSON('round_' + round.id, round);
        await upsertIndex(store, round);
        return json(200, { ok: true, round: summary(round) });
      }

      if (action === 'reopen') {
        const round = await getRound(store, body.id || qs.id);
        if (!round) return json(404, { ok: false, error: 'Not found' });
        round.status = 'open';
        round.reopenedAt = new Date().toISOString();
        round.reopenCount = (round.reopenCount || 0) + 1;
        round.expiresAt = expiryFor(body.expiresAt, round.reopenedAt);
        if (body.clientEmail !== undefined) {
          round.clientEmail = normalizeEmail(body.clientEmail) || round.clientEmail;
        }
        round.reminders = {}; // fresh reminder cycle for the reopened round
        await store.setJSON('round_' + round.id, round);
        await upsertIndex(store, round);
        return json(200, { ok: true, round: summary(round), link: linkPath + round.id });
      }

      const projectName = String(body.projectName || '').trim();
      if (!projectName) return json(400, { ok: false, error: 'Project name is required' });

      // Areas/rooms in scope. Each gets a stable id so the client can group
      // revisions under it and the draft survives a reload. Form types without
      // rooms simply send no rooms array.
      const rooms = (Array.isArray(body.rooms) ? body.rooms : [])
        .map((r) => String((r && r.name) || r || '').trim())
        .filter(Boolean)
        .slice(0, 60)
        .map((name) => ({ id: crypto.randomBytes(4).toString('hex'), name: name }));

      const round = {
        id: newId(),
        clientName: String(body.clientName || '').trim(),
        clientEmail: normalizeEmail(body.clientEmail),
        projectName: projectName,
        designPhase: String(body.designPhase || '').trim(),
        note: String(body.note || '').trim(),
        driveUrl: cleanUrl(body.driveUrl),
        rooms: rooms,
        status: 'open',
        createdAt: new Date().toISOString(),
        expiresAt: expiryFor(body.expiresAt),
        submissions: [],
        reminders: {},
        reopenCount: 0
      };
      await store.setJSON('round_' + round.id, round);
      await upsertIndex(store, round);
      return json(200, {
        ok: true,
        round: summary(round),
        link: linkPath + round.id,
        emailFrom: process.env.EMAIL_FROM || ''
      });
    }

    if (event.httpMethod === 'DELETE') {
      let id = qs.id;
      if (!id) { try { id = JSON.parse(event.body || '{}').id; } catch (e) { id = null; } }
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      await store.delete('round_' + id);
      let index = [];
      try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
      await store.setJSON(INDEX_KEY, index.filter((r) => r && r.id !== id));
      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  };
}

module.exports = { createRoundsHandler };
