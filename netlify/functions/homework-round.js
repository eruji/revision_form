/**
 * GET /homework/api/round?id=<roundId>
 *
 * Public, read-only Design Homework context for an office-issued link.
 */
const { createPublicRoundHandler } = require('./lib/public-round');

exports.handler = createPublicRoundHandler({
  storeName: 'homework-rounds',
  loadError: 'Could not load the homework link',
  present(round) {
    const submissions = round.submissions || [];
    const last = submissions.length ? submissions[submissions.length - 1] : null;
    return {
      id: round.id,
      clientName: round.clientName,
      clientEmail: round.clientEmail || '',
      projectName: round.projectName,
      note: round.note || '',
      driveUrl: round.driveUrl || '',
      status: round.status,
      reopenedAt: round.reopenedAt || null,
      expiresAt: round.expiresAt || null,
      previousSubmittedAt: last ? last.submittedAt : null
    };
  }
});
