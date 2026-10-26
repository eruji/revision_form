/**
 * Public, read-only round lookup.
 *
 * Returns ONLY the context a client needs when opening an office-issued link.
 * There is no way to list rounds here — office-side CRUD lives behind Access.
 *
 * Add a new form type by pointing a thin public function at this factory with
 * the store name and the fields that type is allowed to expose.
 */
const { openStore } = require('./store');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function createPublicRoundHandler(config) {
  if (!config || !config.storeName) throw new Error('createPublicRoundHandler requires a storeName');
  if (typeof config.present !== 'function') throw new Error('createPublicRoundHandler requires present(round)');
  const loadError = config.loadError || 'Could not load the link';

  return async function handler(event) {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!id) return json(400, { ok: false, error: 'Missing id' });

    try {
      const store = openStore(config.storeName);
      const round = await store.get('round_' + id, { type: 'json' });
      if (!round) return json(404, { ok: false, error: 'Not found' });
      return json(200, { ok: true, round: config.present(round) });
    } catch (e) {
      return json(500, { ok: false, error: loadError });
    }
  };
}

module.exports = { createPublicRoundHandler };
