import { calculatePlayerRanking } from '../ranking/calculatePlayerRanking.js';

const CONFIRMED_STATUSES = new Set(['confirmed', 'completed', 'done', 'finished']);

function valueId(value) {
  return String(typeof value === 'string' ? value : value?.id || value?.eventPlayerId || value?.event_player_id || '');
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isConfirmedHistoryMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  const teamAScore = score(match?.teamAScore ?? match?.team_a_score);
  const teamBScore = score(match?.teamBScore ?? match?.team_b_score);
  return CONFIRMED_STATUSES.has(status) && teamAScore !== null && teamBScore !== null && teamAScore !== teamBScore;
}

export function confirmedHistoryMatches(matches = []) {
  return matches.filter(isConfirmedHistoryMatch);
}

export function buildEventHistoryStats(players = [], matches = []) {
  const stats = new Map(players.map((player) => [String(player.id), {
    ...player,
    displayName: player.displayName || player.display_name || player.name || player.nickname || 'Player',
    matchesPlayed: 0,
    matches_played: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    points_for: 0,
    pointsAgainst: 0,
    points_against: 0
  }]));

  for (const match of confirmedHistoryMatches(matches)) {
    const teamAScore = score(match.teamAScore ?? match.team_a_score);
    const teamBScore = score(match.teamBScore ?? match.team_b_score);
    const teams = [
      ['A', match.teamA || match.team_a || []],
      ['B', match.teamB || match.team_b || []]
    ];
    for (const [side, team] of teams) {
      for (const item of team) {
        const id = valueId(item);
        if (!id) continue;
        const current = stats.get(id) || {
          id,
          displayName: item?.displayName || item?.display_name || id,
          matchesPlayed: 0,
          matches_played: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          points_for: 0,
          pointsAgainst: 0,
          points_against: 0
        };
        const pointsFor = side === 'A' ? teamAScore : teamBScore;
        const pointsAgainst = side === 'A' ? teamBScore : teamAScore;
        const won = pointsFor > pointsAgainst;
        const next = {
          ...current,
          matchesPlayed: current.matchesPlayed + 1,
          matches_played: current.matchesPlayed + 1,
          wins: current.wins + (won ? 1 : 0),
          losses: current.losses + (won ? 0 : 1),
          pointsFor: current.pointsFor + pointsFor,
          points_for: current.pointsFor + pointsFor,
          pointsAgainst: current.pointsAgainst + pointsAgainst,
          points_against: current.pointsAgainst + pointsAgainst
        };
        stats.set(id, next);
      }
    }
  }
  return [...stats.values()].map((player) => ({
    ...player,
    diff: player.pointsFor - player.pointsAgainst
  }));
}

export function calculateEventHistoryRanking(players = [], matches = []) {
  return calculatePlayerRanking(buildEventHistoryStats(players, matches));
}

export function summarizeConfirmedHistory(players = [], matches = []) {
  const confirmed = confirmedHistoryMatches(matches);
  const ranking = calculateEventHistoryRanking(players, confirmed);
  return {
    playersCount: players.length,
    confirmedMatchesCount: confirmed.length,
    ranking,
    topPlayer: ranking.find((player) => player.matchesPlayed > 0) || null
  };
}
