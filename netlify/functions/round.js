/**
 * GET /clients/api/round?id=<roundId>
 *
 * Public, read-only revision-request context for an office-issued link.
 */
const { createPublicRoundHandler } = require('./lib/public-round');

exports.handler = createPublicRoundHandler({
  storeName: 'revision-rounds',
  loadError: 'Could not load the request',
  present(round) {
    return {
      id: round.id,
      clientName: round.clientName,
      clientEmail: round.clientEmail || '',
      projectName: round.projectName,
      designPhase: round.designPhase || '',
      note: round.note || '',
      driveUrl: round.driveUrl || '',
      rooms: round.rooms || [],
      status: round.status,
      reopenedAt: round.reopenedAt || null,
      expiresAt: round.expiresAt || null,
      previousItems: round.previousItems || []
    };
  }
});
