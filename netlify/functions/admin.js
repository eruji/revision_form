/**
 * GET /api/admin
 *   Headers: x-admin-key: <ADMIN_PASSWORD>
 *   ?format=csv  -> spreadsheet-ready CSV (one row per revision item)
 *   (default)    -> { ok, count, records: [...] }
 *
 * This is the ONLY endpoint that can read across clients. It is gated by the
 * ADMIN_PASSWORD environment variable set in Netlify. Without the correct key
 * it returns 401 and no data.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

// ── Authorization ─────────────────────────────────────────────────────────
// Cloudflare Access JWT (Zero Trust) when CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD
// are set, else the ADMIN_PASSWORD fallback via x-admin-key. The JWT check is
// what stops the raw *.netlify.app origin from bypassing Cloudflare.
let accessCache = { at: 0, keys: null };
function reqHeader(event, name) {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || '';
}
function b64url(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
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

// Blobs needs an explicit siteID + token when functions are deployed outside
// Netlify's own build (e.g. via `netlify deploy` from CI). When Netlify injects
// the context automatically, the fallback below is used.
function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // drafts expire 30 days after saving


function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function val(v) { return v == null ? '' : v; }

// Flatten a stored value for a spreadsheet: attachments become their URLs and
// a drawn signature becomes a label instead of an enormous data URL.
function cellText(v) {
  if (Array.isArray(v)) return v.map((f) => (f && f.url) ? f.url : String(f)).filter(Boolean).join(' | ');
  if (typeof v === 'string' && v.indexOf('data:image/') === 0) return 'Signed (drawn signature)';
  return val(v);
}

function csvCell(v) {
  const s = val(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(records) {
  let header = null;
  const rows = [];

  records.forEach((rec) => {
    const sub = rec.submission || {};
    const labels = sub._labels || { about: {}, revision: {}, ack: {} };
    const aboutIds = Object.keys(labels.about || {});
    const revIds = Object.keys(labels.revision || {});
    const ackIds = Object.keys(labels.ack || {});

    if (!header) {
      header = [
        'Submitted At',
        ...aboutIds.map((id) => labels.about[id]),
        ...revIds.map((id) => labels.revision[id]),
        ...ackIds.map((id) => labels.ack[id])
      ];
    }

    const aboutVals = aboutIds.map((id) => cellText((sub.about || {})[id]));
    const ackVals = ackIds.map((id) => cellText((sub.acknowledgment || {})[id]));
    const revs = sub.revisions || [];

    if (!revs.length) {
      rows.push([sub.submittedAt, ...aboutVals, ...revIds.map(() => ''), ...ackVals]);
    }
    revs.forEach((rev) => {
      rows.push([
        sub.submittedAt,
        ...aboutVals,
        ...revIds.map((id) => cellText(rev[id])),
        ...ackVals
      ]);
    });
  });

  const all = header ? [header, ...rows] : [];
  return all.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

exports.handler = async (event) => {
  if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

  const qs = event.queryStringParameters || {};

  // Save office settings (e.g. the Google Sheet work-queue URL) or archive.
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }

    // Archive / unarchive a submitted request (keeps the data, hides it).
    if (body.action === 'archive' || body.action === 'unarchive') {
      const id = String(body.id || '');
      const archive = body.action === 'archive';
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      try {
        const store = openStore('revision-submissions');
        let index = [];
        try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }
        const entry = index.find((e) => e && (e.id === id || e.key === id));
        if (!entry) return json(404, { ok: false, error: 'Not found' });
        const rec = await store.get(entry.key, { type: 'json' });
        if (rec) {
          rec.archived = archive;
          rec.archivedAt = archive ? new Date().toISOString() : null;
          await store.setJSON(entry.key, rec);
        }
        entry.archived = archive;
        await store.setJSON('__index__', index);
        return json(200, { ok: true, archived: archive });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not update the request' });
      }
    }

    if (!body.settings || typeof body.settings !== 'object') return json(400, { ok: false, error: 'Nothing to update' });
    try {
      const settingsStore = openStore('revision-settings');
      const current = (await settingsStore.get('config', { type: 'json' })) || {};
      const next = Object.assign({}, current, { sheetUrl: String(body.settings.sheetUrl || '').trim() });
      await settingsStore.setJSON('config', next);
      return json(200, { ok: true, settings: next });
    } catch (e) {
      return json(500, { ok: false, error: 'Could not save settings' });
    }
  }

  // Delete a saved draft or a submitted request (office cleanup).
  if (event.httpMethod === 'DELETE') {
    if (qs.draft) {
      const code = String(qs.draft).trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json(400, { ok: false, error: 'Invalid code' });
      try {
        const draftStore = openStore('revision-drafts');
        await draftStore.delete('draft_' + require('crypto').createHash('sha256').update(code).digest('hex'));
        let index = [];
        try { index = (await draftStore.get('__draft_index__', { type: 'json' })) || []; } catch (e) { index = []; }
        await draftStore.setJSON('__draft_index__', index.filter((e) => e && e.code !== code));
        return json(200, { ok: true });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not delete draft' });
      }
    }

    if (qs.submission) {
      const id = String(qs.submission);
      try {
        const store = openStore('revision-submissions');
        let index = [];
        try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }
        const entry = index.find((e) => e && (e.id === id || e.key === id));
        if (!entry) return json(404, { ok: false, error: 'Not found' });
        await store.delete(entry.key);
        await store.setJSON('__index__', index.filter((e) => e !== entry));
        return json(200, { ok: true });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not delete the request' });
      }
    }

    return json(400, { ok: false, error: 'Nothing to delete' });
  }

  try {
    const store = openStore('revision-submissions');
    let index = [];
    try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }

    const records = [];
    for (const entry of index) {
      const rec = await store.get(entry.key, { type: 'json' });
      if (rec) records.push(rec);
    }

    // Drafts that clients have saved but not yet submitted. Expired drafts are
    // filtered out (and pruned from the index) on read.
    let drafts = [];
    try {
      const draftStore = openStore('revision-drafts');
      const raw = (await draftStore.get('__draft_index__', { type: 'json' })) || [];
      const now = Date.now();
      const kept = [];
      let changed = false;
      for (const d of raw) {
        if (!d) { changed = true; continue; }
        const exp = d.expiresAt || (d.savedAt ? new Date(Date.parse(d.savedAt) + TTL_MS).toISOString() : null);
        if (exp && now > Date.parse(exp)) { changed = true; continue; }
        if (!d.expiresAt && exp) d.expiresAt = exp;
        kept.push(d);
      }
      drafts = kept;
      if (changed) await draftStore.setJSON('__draft_index__', kept);
    } catch (e) { drafts = []; }

    if (qs.format === 'csv') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="revision-requests.csv"',
          'Cache-Control': 'no-store'
        },
        body: toCsv(records)
      };
    }

    let settings = { sheetUrl: '' };
    try {
      const settingsStore = openStore('revision-settings');
      settings = (await settingsStore.get('config', { type: 'json' })) || settings;
    } catch (e) { settings = { sheetUrl: '' }; }

    return json(200, { ok: true, count: records.length, records: records, drafts: drafts, settings: settings });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load submissions' });
  }
};
