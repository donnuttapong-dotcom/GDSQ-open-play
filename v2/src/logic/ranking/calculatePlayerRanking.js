export function calculatePlayerScore(player) {
  const matchesPlayed = Number(player?.matchesPlayed ?? player?.matches_played ?? 0) || 0;
  const wins = Number(player?.wins ?? 0) || 0;
  const losses = Number(player?.losses ?? 0) || 0;
  const pointsFor = Number(player?.pointsFor ?? player?.points_for ?? 0) || 0;
  const pointsAgainst = Number(player?.pointsAgainst ?? player?.points_against ?? 0) || 0;
  const diff = pointsFor - pointsAgainst;
  const winRate = matchesPlayed ? wins / matchesPlayed : 0;

  return {
    matchesPlayed,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    diff,
    winRate,
    score: wins * 10 + matchesPlayed * 2 + diff
  };
}

export function calculatePlayerRanking(players = []) {
  return players
    .map((player) => {
      const stats = calculatePlayerScore(player);
      return {
        ...player,
        ...stats
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''));
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1
    }));
}

export function summarizeEvent({ players = [], matches = [] } = {}) {
  const ranking = calculatePlayerRanking(players);
  const topPlayer = ranking[0] || null;
  const confirmedMatches = matches.filter((match) => ['confirmed', 'completed', 'done'].includes(String(match.status || '').toLowerCase()));
  const liveMatches = matches.filter((match) => ['playing', 'pending_score', 'assigned'].includes(String(match.status || '').toLowerCase()));

  return {
    playersCount: players.length,
    confirmedMatchesCount: confirmedMatches.length,
    liveMatchesCount: liveMatches.length,
    topPlayer,
    ranking
  };
}
