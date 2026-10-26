/**
 * /api/rounds  (office-only — sits behind Cloudflare Access)
 *
 * Office-issued revision request links. The shared lifecycle lives in
 * ./lib/rounds.js; this file only supplies revision-specific settings.
 */
const { createRoundsHandler } = require('./lib/rounds');
const { onRoundLink } = require('./lib/notify');

exports.handler = createRoundsHandler({
  storeName: 'revision-rounds',
  linkPath: '/clients/form.html?r=',
  notifyLink: onRoundLink,
  noEmailError: 'This request has no client email',
  submittedError: 'This request has already been submitted and can no longer be edited',
  sendError: 'Could not send the email'
});
