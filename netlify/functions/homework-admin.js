/**
 * GET /api/admin
 *   Headers: x-admin-key: <ADMIN_PASSWORD>  (or a Cloudflare Access JWT)
 *   ?format=csv&key=<key>  -> spreadsheet CSV for one submission
 *   ?format=csv            -> CSV for all submissions
 *   (default)              -> { ok, submissions: [...], drafts: [...] }
 *
 * The ONLY endpoint that can read across clients. Gated by Cloudflare Access
 * (CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD) or the ADMIN_PASSWORD fallback.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

let accessCache = { at: 0, keys: null };
function reqHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}
function b64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
async function accessJwks(domain) {
  if (accessCache.keys && Date.now() - accessCache.at < 3600000) return accessCache.keys;
  const res = await fetch('https://' + domain + '/cdn-cgi/access/certs', { cache: 'no-store' });
  if (!res.ok) throw new Error('could not fetch Access certs');
  const data = await res.json();
  accessCache = { at: Date.now(), keys: (data && data.keys) || [] };
  return accessCache.keys;
}
async function verifyAccess(token, domain, aud) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return false;
  let head, payload;
  try {
    head = JSON.parse(b64url(p[0]).toString('utf8'));
    payload = JSON.parse(b64url(p[1]).toString('utf8'));
  } catch (e) { return false; }
  if (head.alg !== 'RS256' || !head.kid) return false;
  const jwk = (await accessJwks(domain)).find((k) => k && k.kid === head.kid);
  if (!jwk) return false;
  let key;
  try { key = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch (e) { return false; }
  if (!crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), key, b64url(p[2]))) return false;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) return false;
  if (payload.nbf && now < payload.nbf - 60) return false;
  if (payload.iss && payload.iss !== 'https://' + domain) return false;
  if (aud) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audiences.indexOf(aud) === -1) return false;
  }
  return true;
}
async function isAuthorized(event) {
  const domain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  if (domain && aud) {
    const token = reqHeader(event, 'cf-access-jwt-assertion');
    if (token) {
      try { if (await verifyAccess(token, domain, aud)) return true; } catch (e) { /* fall through */ }
    }
  }
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && reqHeader(event, 'x-admin-key') === expected;
}

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function submissionCsv(rec) {
  const sub = rec.submission || {};
  const c = sub.client || {};
  const header = ['Submitted At', 'Client', 'Project', 'Email', 'Section', 'Category', 'Selection', 'Notes', 'Skipped'];
  const rows = [header];
  const esc = (v) => csvCell(v);
  (sub.sections || []).forEach((s) => {
    if (s.skipped) {
      rows.push([sub.submittedAt, c.name, c.project, c.email, s.number + ' · ' + s.title, '', '', '', 'yes']);
      return;
    }
    (s.items || []).forEach((it) => {
      const sel = (it.options || []).join(', ');
      if (!sel && !it.note) return;
      rows.push([sub.submittedAt, c.name, c.project, c.email, s.number + ' · ' + s.title, it.category, sel, it.note || '', 'no']);
    });
  });
  (sub.budget || []).forEach((b) => {
    if (!b.tier && !b.note) return;
    rows.push([sub.submittedAt, c.name, c.project, c.email, 'Budget Definition', b.label, b.tier || '', b.note || '', 'no']);
  });
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

exports.handler = async (event) => {
  if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

  const store = openStore('homework-submissions');
  const draftStore = openStore('homework-drafts');
  const qs = event.queryStringParameters || {};

  // ── Archive / unarchive a homework submission (keeps the data, hides it) ──
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
    if (body.action === 'archive' || body.action === 'unarchive') {
      const id = String(body.id || '');
      const archive = body.action === 'archive';
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      try {
        let list = [];
        try { list = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { list = []; }
        const entry = list.find((e) => e && (e.id === id || e.key === id));
        if (!entry) return json(404, { ok: false, error: 'Not found' });
        const rec = await store.get(entry.key, { type: 'json' });
        if (rec) {
          rec.archived = archive;
          rec.archivedAt = archive ? new Date().toISOString() : null;
          await store.setJSON(entry.key, rec);
        }
        entry.archived = archive;
        entry.archivedAt = archive ? new Date().toISOString() : null;
        await store.setJSON('__index__', list);
        return json(200, { ok: true, archived: archive });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not update the homework submission' });
      }
    }
    return json(400, { ok: false, error: 'Nothing to update' });
  }

  // ── Delete a submitted homework or a saved draft (office cleanup) ──
  if (event.httpMethod === 'DELETE') {
    if (qs.submission) {
      const id = String(qs.submission);
      try {
        let list = [];
        try { list = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { list = []; }
        const entry = list.find((e) => e && (e.id === id || e.key === id));
        if (!entry) return json(404, { ok: false, error: 'Not found' });
        await store.delete(entry.key);
        await store.setJSON('__index__', list.filter((e) => e !== entry));
        return json(200, { ok: true });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not delete the homework submission' });
      }
    }
    if (qs.draft) {
      const code = String(qs.draft).trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json(400, { ok: false, error: 'Invalid code' });
      try {
        await draftStore.delete('draft_' + crypto.createHash('sha256').update(code).digest('hex'));
        let list = [];
        try { list = (await draftStore.get('__draft_index__', { type: 'json' })) || []; } catch (e) { list = []; }
        await draftStore.setJSON('__draft_index__', list.filter((e) => e && e.code !== code));
        return json(200, { ok: true });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not delete draft' });
      }
    }
    return json(400, { ok: false, error: 'Nothing to delete' });
  }

  let index = [];
  try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }

  if (qs.format === 'csv') {
    const parts = [];
    if (qs.key) {
      const rec = await store.get(qs.key, { type: 'json' });
      if (rec) parts.push(submissionCsv(rec));
    } else {
      for (const entry of index) {
        const rec = await store.get(entry.key, { type: 'json' });
        if (rec) parts.push(submissionCsv(rec));
      }
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="design-homework.csv"',
        'Cache-Control': 'no-store'
      },
      body: parts.join('\n\n') || 'No submissions yet'
    };
  }

  if (qs.key) {
    const rec = await store.get(qs.key, { type: 'json' });
    if (!rec) return json(404, { ok: false, error: 'Not found' });
    return json(200, { ok: true, record: rec });
  }

  let drafts = [];
  try { drafts = (await draftStore.get('__draft_index__', { type: 'json' })) || []; } catch (e) { drafts = []; }

  return json(200, { ok: true, count: index.length, submissions: index, drafts });
};
