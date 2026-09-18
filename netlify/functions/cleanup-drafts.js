/**
 * Scheduled maintenance — runs daily (see netlify.toml).
 *
 * Deletes drafts older than 30 days and any orphaned draft blobs, so saved
 * client progress does not live forever. Drafts also expire lazily when read,
 * this just guarantees the purge happens even if nobody opens the draft.
 */
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INDEX_KEY = '__draft_index__';

function keyFor(code) {
  return 'draft_' + crypto.createHash('sha256').update(code).digest('hex');
}

exports.handler = async () => {
  const store = openStore('revision-drafts');

  let index = [];
  try { index = (await store.get(INDEX_KEY, { type: 'json' })) || []; } catch (e) { index = []; }

  const now = Date.now();
  const kept = [];
  const keptKeys = new Set();
  let removed = 0;

  for (const d of index) {
    if (!d || !d.code) continue;
    const exp = d.expiresAt || (d.savedAt ? new Date(Date.parse(d.savedAt) + TTL_MS).toISOString() : null);
    if (exp && now > Date.parse(exp)) {
      await store.delete(keyFor(d.code));
      removed++;
    } else {
      kept.push(d);
      keptKeys.add(keyFor(d.code));
    }
  }

  // NOTE: We deliberately do NOT delete draft blobs that are missing from the
  // index. A draft blob is only reachable with its code, and an index write can
  // fail independently of the blob write — deleting "orphans" could destroy a
  // client's in-progress work. Expiry is driven strictly by expiresAt above.

  await store.setJSON(INDEX_KEY, kept);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, removed: removed, remaining: kept.length })
  };
};
