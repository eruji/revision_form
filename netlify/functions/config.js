/**
 * /api/config              (office-only — behind Cloudflare Access)
 *   GET  ?app=revision|homework  -> { ok, config } (stored override or null)
 *   POST { app, config }          -> save the config override
 *
 * /clients/api/config      (public) GET -> revision form config override
 * /homework/api/config     (public) GET -> Design Homework config override
 *
 * Stored config overrides are kept in Netlify Blobs ("site-config") so the
 * office's Setup edits apply to every client, not just one browser. Clients
 * fetch the override and deep-merge it over the shipped defaults in config.js.
 */
const { isAuthorized } = require('./lib/auth');
const { openStore } = require('./lib/store');

const STORE = 'site-config';
const KEY_REVISION = 'revision-form';
const KEY_HOMEWORK = 'homework';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

// Guard against cross-app pollution (e.g. a homework config stored under the
// revision key, or vice versa). Revision configs have revisionFields and no
// welcome; homework configs have welcome and no revisionFields.
function validFor(app, config) {
  if (!config || typeof config !== 'object') return false;
  if (app === KEY_HOMEWORK) return !!config.welcome;
  if (app === KEY_REVISION) return Array.isArray(config.revisionFields) && !config.welcome;
  return false;
}

exports.handler = async (event) => {
  const path = event.path || '';
  const isOffice = /\/api\/config$/.test(path);
  const isRevisionPublic = /\/clients\/api\/config$/.test(path);
  const isHomeworkPublic = /\/homework\/api\/config$/.test(path);

  // Public read-only endpoints for the client forms.
  if (isRevisionPublic || isHomeworkPublic) {
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });
    try {
      const store = openStore(STORE);
      const key = isHomeworkPublic ? KEY_HOMEWORK : KEY_REVISION;
      const raw = (await store.get(key, { type: 'json' })) || null;
      return json(200, { ok: true, config: validFor(key, raw) ? raw : null });
    } catch (e) {
      return json(200, { ok: true, config: null }); // fall back to shipped defaults
    }
  }

  // Office endpoint (behind Cloudflare Access).
  if (isOffice) {
    if (!(await isAuthorized(event))) return json(401, { ok: false, error: 'Unauthorized' });

    const qs = event.queryStringParameters || {};
    const app = (qs.app === 'homework') ? KEY_HOMEWORK : KEY_REVISION;

    if (event.httpMethod === 'GET') {
      try {
        const store = openStore(STORE);
        const raw = (await store.get(app, { type: 'json' })) || null;
        return json(200, { ok: true, app: qs.app || 'revision', config: validFor(app, raw) ? raw : null });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not load config' });
      }
    }

    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'Invalid body' }); }
      if (!body.config || typeof body.config !== 'object') return json(400, { ok: false, error: 'Missing config' });
      const appKey = body.app === 'homework' ? KEY_HOMEWORK : KEY_REVISION;
      if (!validFor(appKey, body.config)) {
        return json(400, { ok: false, error: appKey === KEY_HOMEWORK ? 'Config shape does not match Design Homework' : 'Config shape does not match revision form' });
      }
      try {
        const store = openStore(STORE);
        await store.setJSON(appKey, body.config);
        return json(200, { ok: true, app: body.app || 'revision', config: body.config });
      } catch (e) {
        return json(500, { ok: false, error: 'Could not save config' });
      }
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  }

  return json(404, { ok: false, error: 'Not found' });
};
