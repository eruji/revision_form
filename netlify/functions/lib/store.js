/**
 * Netlify Blobs store helper.
 *
 * Blobs needs an explicit siteID + token when functions are deployed outside
 * Netlify's own build (e.g. via `netlify deploy` from CI). When Netlify injects
 * the context automatically, the fallback below is used.
 */
const { getStore } = require('@netlify/blobs');

function openStore(name) {
  const siteID = process.env.BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: name, siteID: siteID, token: token });
  return getStore(name);
}

module.exports = { openStore };
