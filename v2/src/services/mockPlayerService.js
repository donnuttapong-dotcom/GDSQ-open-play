const baseTime = new Date('2026-06-22T16:00:00+07:00').getTime();

export const mockPlayers = [
  p('p01', 'Ann', 0, 3.0, 36),
  p('p02', 'Pat', 0, 2.5, 34),
  p('p03', 'Tom', 1, 3.25, 29),
  p('p04', 'Bank', 1, 2.75, 28),
  p('p05', 'May', 2, 3.0, 24),
  p('p06', 'Gun', 2, 2.5, 22),
  p('p07', 'Beam', 3, 2.75, 18),
  p('p08', 'Art', 3, 3.5, 16),
  p('p09', 'Nattapong', 1, 2.75, 14),
  p('p10', 'Ploy', 0, 2.25, 12),
  p('p11', 'Ken', 4, 3.0, 9),
  p('p12', 'Mook', 4, 3.25, 7)
];

function p(id, name, games, level, waitedMinutes) {
  return {
    id,
    name,
    displayName: name,
    status: 'ready',
    matchesPlayed: games,
    wins: Math.max(0, Math.floor(games / 2)),
    losses: Math.max(0, games - Math.floor(games / 2)),
    pointsFor: games * 8,
    pointsAgainst: games * 7,
    level,
    queueJoinedAt: new Date(baseTime - waitedMinutes * 60000).toISOString()
  };
}

export async function getEventPlayers() {
  await delay(100);
  return [...mockPlayers];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
