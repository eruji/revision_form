/**
 * /api/rounds
 *   Office-issued revision request links.
 *
 *   GET  ?id=<roundId>            (public)  -> the request's context only
 *   GET                           (admin)   -> list all rounds
 *   POST  {clientName, projectName, designPhase, note}  (admin) -> create
 *   POST  {action:'reopen', id}   (admin)   -> reopen a submitted round
 *   DELETE ?id=<roundId>          (admin)   -> remove a round
 *
 * A round bakes in the client / project / design phase so the client form can
 * skip section 01 entirely. The id is a random, unguessable token.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const INDEX_KEY = '__rounds_index__';

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

function isAdmin(event) {
  const provided = event.headers['x-admin-key'] || event.headers['X-Admin-Key'] || '';
  return !!process.env.ADMIN_PASSWORD && provided === process.env.ADMIN_PASSWORD;
}

function summary(round) {
  const last = round.submissions && round.submissions.length ? round.submissions[round.submissions.length - 1] : null;
  return {
    id: round.id,
    clientName: round.clientName,
    projectName: round.projectName,
    designPhase: round.designPhase,
    status: round.status,
    createdAt: round.createdAt,
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
  return index;
}

async function getRound(store, id) {
  if (!id) return null;
  return store.get('round_' + id, { type: 'json' });
}

exports.handler = async (event) => {
  const store = openStore('revision-rounds');
  const qs = event.queryStringParameters || {};

  // ── Public: a client opens their request link ──
  if (event.httpMethod === 'GET' && qs.id) {
    const round = await getRound(store, qs.id);
    if (!round) return json(404, { ok: false, error: 'Not found' });
    return json(200, {
      ok: true,
      round: {
        id: round.id,
        clientName: round.clientName,
        projectName: round.projectName,
        designPhase: round.designPhase,
        note: round.note,
        status: round.status,
        reopenedAt: round.reopenedAt || null,
        previousItems: round.previousItems || []
      }
    });
  }

  // ── Everything below is office-only ──
  if (!isAdmin(event)) return json(401, { ok: false, error: 'Unauthorized' });

  if (event.httpMethod === 'GET') {
    let index = [];
    try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }
    return json(200, { ok: true, rounds: index });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
    const action = body.action || qs.action;

    if (action === 'reopen') {
      const round = await getRound(store, body.id || qs.id);
      if (!round) return json(404, { ok: false, error: 'Not found' });
      round.status = 'open';
      round.reopenedAt = new Date().toISOString();
      round.reopenCount = (round.reopenCount || 0) + 1;
      await store.setJSON('round_' + round.id, round);
      await upsertIndex(store, round);
      return json(200, { ok: true, round: summary(round), link: '/form.html?r=' + round.id });
    }

    const projectName = String(body.projectName || '').trim();
    if (!projectName) return json(400, { ok: false, error: 'Project name is required' });

    const round = {
      id: newId(),
      clientName: String(body.clientName || '').trim(),
      projectName: projectName,
      designPhase: String(body.designPhase || '').trim(),
      note: String(body.note || '').trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
      submissions: [],
      reopenCount: 0
    };
    await store.setJSON('round_' + round.id, round);
    await upsertIndex(store, round);
    return json(200, { ok: true, round: summary(round), link: '/form.html?r=' + round.id });
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
