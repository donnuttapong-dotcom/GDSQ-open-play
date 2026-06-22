export const mockHistory = [
  m('m01', ['p05', 'p06'], ['p07', 'p08'], 11, 8, 6),
  m('m02', ['p11', 'p12'], ['p03', 'p04'], 9, 11, 12),
  m('m03', ['p07', 'p08'], ['p01', 'p02'], 11, 7, 18),
  m('m04', ['p11', 'p12'], ['p05', 'p06'], 11, 6, 25)
];

export const mockLiveMatches = [
  {
    id: 'live-01',
    courtId: 'court-1',
    courtName: 'Court 1',
    status: 'playing',
    teamA: ['p01', 'p03'],
    teamB: ['p02', 'p04'],
    startedAt: new Date(Date.now() - 8 * 60000).toISOString()
  }
];

function m(id, teamA, teamB, teamAScore, teamBScore, minutesAgo) {
  return {
    id,
    status: 'confirmed',
    teamA,
    teamB,
    teamAScore,
    teamBScore,
    completedAt: new Date(Date.now() - minutesAgo * 60000).toISOString()
  };
}

export async function getMatchHistory() {
  await delay(120);
  return [...mockHistory];
}

export async function getLiveMatches() {
  await delay(90);
  return [...mockLiveMatches];
}

export async function confirmScore(matchId, scorePayload) {
  await delay(550);
  if (!matchId) throw new Error('Missing match id');
  return {
    ok: true,
    matchId,
    scorePayload,
    confirmedAt: new Date().toISOString()
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
