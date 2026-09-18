/**
 * GET /clients/api/round?id=<roundId>
 *
 * Public. Returns ONLY the context a client needs when they open an
 * office-issued request link (client / project / phase / note, status, and any
 * previously submitted items). There is no way to list rounds from here — the
 * office-side list/create/reopen/delete live at /api/rounds behind Access.
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
  if (!id) return json(400, { ok: false, error: 'Missing id' });

  try {
    const store = openStore('revision-rounds');
    const round = await store.get('round_' + id, { type: 'json' });
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
  } catch (e) {
    return json(500, { ok: false, error: 'Could not load the request' });
  }
};
