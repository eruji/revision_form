/**
 * /api/homework-rounds  (office-only — sits behind Cloudflare Access)
 *
 * Office-issued Design Homework links. The shared lifecycle lives in
 * ./lib/rounds.js; this file only supplies homework-specific settings.
 */
const { createRoundsHandler } = require('./lib/rounds');
const { onHomeworkRoundLink } = require('./lib/notify');

exports.handler = createRoundsHandler({
  storeName: 'homework-rounds',
  linkPath: '/homework/?r=',
  notifyLink: onHomeworkRoundLink,
  noEmailError: 'This homework link has no client email',
  submittedError: 'This homework has already been submitted and can no longer be edited',
  sendError: 'Could not send the email'
});
