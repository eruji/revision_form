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


function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function val(v) { return v == null ? '' : v; }

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

    const aboutVals = aboutIds.map((id) => (sub.about || {})[id]);
    const ackVals = ackIds.map((id) => (sub.acknowledgment || {})[id]);
    const revs = sub.revisions || [];

    if (!revs.length) {
      rows.push([sub.submittedAt, ...aboutVals, ...revIds.map(() => ''), ...ackVals]);
    }
    revs.forEach((rev) => {
      rows.push([
        sub.submittedAt,
        ...aboutVals,
        ...revIds.map((id) => rev[id]),
        ...ackVals
      ]);
    });
  });

  const all = header ? [header, ...rows] : [];
  return all.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

exports.handler = async (event) => {
  const provided = event.headers['x-admin-key'] || event.headers['X-Admin-Key'] || '';
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) return json(500, { ok: false, error: 'ADMIN_PASSWORD is not configured' });
  if (provided !== expected) return json(401, { ok: false, error: 'Unauthorized' });

  try {
    const store = openStore('revision-submissions');
    let index = [];
    try { index = (await store.get('__index__', { type: 'json' })) || []; } catch (e) { index = []; }

    const records = [];
    for (const entry of index) {
      const rec = await store.get(entry.key, { type: 'json' });
      if (rec) records.push(rec);
    }

    const format = (event.queryStringParameters || {}).format;
    if (format === 'csv') {
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

    return json(200, { ok: true, count: records.length, records: records });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load submissions' });
  }
};
