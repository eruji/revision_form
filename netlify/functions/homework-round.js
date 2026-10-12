/**
 * GET /homework/api/round?id=<roundId>
 *
 * Public. Returns ONLY the context a client needs when they open an
 * office-issued homework link (client / project / note, status, expiry). There
 * is no way to list rounds from here — the office-side list/create/reopen/delete
 * live at /api/homework-rounds behind Access.
 */
const { getStore } = require('@netlify/blobs');

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!id) return json(400, { ok: false, error: 'Missing id' });

  try {
    const store = openStore('homework-rounds');
    const round = await store.get('round_' + id, { type: 'json' });
    if (!round) return json(404, { ok: false, error: 'Not found' });
    return json(200, {
      ok: true,
      round: {
        id: round.id,
        clientName: round.clientName,
        clientEmail: round.clientEmail || '',
        projectName: round.projectName,
        note: round.note || '',
        driveUrl: round.driveUrl || '',
        status: round.status,
        reopenedAt: round.reopenedAt || null,
        expiresAt: round.expiresAt || null,
        previousSubmittedAt: round.submissions && round.submissions.length ? round.submissions[round.submissions.length - 1].submittedAt : null
      }
    });
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load the homework link' });
  }
};
