const ACTIVE_MATCH_STATUSES = new Set(['preview', 'assigned', 'playing', 'pending_score']);
const CONFIRMED_MATCH_STATUSES = new Set(['confirmed', 'completed', 'done', 'finished']);

function status(value) {
  return String(value || '').trim().toLowerCase();
}

function playerId(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value?.eventPlayerId || value?.event_player_id || value?.id || '');
}

function roster(match = {}) {
  return [...(match.teamA || []), ...(match.teamB || [])].map(playerId).filter(Boolean);
}

function integerScore(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export function matchCompletionProblem(match = {}) {
  const ids = roster(match);
  if (ids.length !== 4 || new Set(ids).size !== 4) return 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS';

  const teamA = integerScore(match.teamAScore ?? match.team_a_score);
  const teamB = integerScore(match.teamBScore ?? match.team_b_score);
  if (teamA == null || teamB == null || teamA < 0 || teamB < 0 || teamA > 99 || teamB > 99 || teamA === teamB) {
    return 'INVALID_SCORE';
  }

  const expectedWinner = teamA > teamB ? 'A' : 'B';
  const winner = String(match.winner || '').toUpperCase();
  if (winner !== expectedWinner) return 'WINNER_SCORE_MISMATCH';
  return '';
}

export function buildEventCompletionSummary({ event = null, players = [], matches = [] } = {}) {
  const activeMatches = matches.filter((match) => ACTIVE_MATCH_STATUSES.has(status(match.status)));
  const confirmedMatches = matches.filter((match) => CONFIRMED_MATCH_STATUSES.has(status(match.status)));
  const invalidConfirmedMatches = confirmedMatches
    .map((match) => ({ match, problem: matchCompletionProblem(match) }))
    .filter((item) => item.problem);
  const activePlayers = players.filter((player) => status(player.status) !== 'removed');

  return {
    eventId: event?.id || '',
    players: activePlayers.length,
    confirmedMatches: confirmedMatches.length,
    activeMatches: activeMatches.length,
    invalidConfirmedMatches,
    canComplete: Boolean(event) && activeMatches.length === 0 && invalidConfirmedMatches.length === 0
  };
}

export function isFinalizedEvent(event = null) {
  return Boolean(event?.hallOfFameProcessedAt || event?.hall_of_fame_processed_at);
}

export function eventDeleteConfirmation(event = null) {
  return isFinalizedEvent(event) ? 'DELETE_FINALIZED_EVENT' : 'DELETE_EVENT';
}

export const eventLifecycleStatuses = Object.freeze({
  active: [...ACTIVE_MATCH_STATUSES],
  confirmed: [...CONFIRMED_MATCH_STATUSES]
});
