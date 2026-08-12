import { calculatePlayerRanking } from '../logic/ranking/calculatePlayerRanking.js';

const CONFIRMED = ['confirmed', 'completed', 'done', 'finished'];

async function fetchAll(buildQuery, pageSize = 500) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function eventTime(event) {
  return new Date(event?.event_date || event?.completed_at || event?.created_at || 0).getTime() || 0;
}

function emptyCareer(identity, player, event) {
  return {
    id: identity,
    playerId: player.player_id || null,
    linked: Boolean(player.player_id),
    displayName: player.display_name || 'Unlinked Player',
    avatarUrl: player.avatar_url || '',
    currentLevel: Number(player.estimated_level || 0),
    latestAt: eventTime(event),
    eventIds: new Set(),
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    eventHistory: new Map(),
    recentMatches: []
  };
}

function identityFor(player) {
  return player.player_id ? String(player.player_id) : `unlinked:${player.id}`;
}

function addResult(career, event, match, side, teamAScore, teamBScore, names) {
  const pointsFor = side === 'A' ? teamAScore : teamBScore;
  const pointsAgainst = side === 'A' ? teamBScore : teamAScore;
  const won = pointsFor > pointsAgainst;
  career.eventIds.add(event.id);
  career.matchesPlayed += 1;
  career.wins += won ? 1 : 0;
  career.losses += won ? 0 : 1;
  career.pointsFor += pointsFor;
  career.pointsAgainst += pointsAgainst;
  const eventRow = career.eventHistory.get(event.id) || { id: event.id, name: event.name, date: event.event_date, matches: 0, wins: 0, losses: 0, diff: 0 };
  eventRow.matches += 1;
  eventRow.wins += won ? 1 : 0;
  eventRow.losses += won ? 0 : 1;
  eventRow.diff += pointsFor - pointsAgainst;
  career.eventHistory.set(event.id, eventRow);
  career.recentMatches.push({
    id: match.id,
    eventId: event.id,
    eventName: event.name,
    eventDate: event.event_date,
    completedAt: match.completed_at || match.created_at,
    courtNumber: match.court_number,
    teamA: names.A,
    teamB: names.B,
    teamAScore,
    teamBScore,
    won
  });
}

export function buildHallOfFame({ events = [], eventPlayers = [], matches = [], matchPlayers = [] } = {}) {
  const eventById = new Map(events.map((event) => [String(event.id), event]));
  const eventPlayerById = new Map(eventPlayers.map((player) => [String(player.id), player]));
  const rowsByMatch = new Map();
  for (const row of matchPlayers) {
    const list = rowsByMatch.get(String(row.match_id)) || [];
    list.push(row);
    rowsByMatch.set(String(row.match_id), list);
  }
  const careers = new Map();
  const confirmedMatches = matches.filter((match) => CONFIRMED.includes(String(match.status || '').toLowerCase()));

  // A participation belongs to the career even when the player has not yet
  // completed a match. Confirmed Match History remains the only score source.
  for (const participant of eventPlayers) {
    const event = eventById.get(String(participant.event_id));
    if (!event) continue;
    const identity = identityFor(participant);
    let career = careers.get(identity) || emptyCareer(identity, participant, event);
    career.eventIds.add(event.id);
    if (eventTime(event) >= career.latestAt) {
      career.displayName = participant.display_name || career.displayName;
      career.avatarUrl = participant.avatar_url || career.avatarUrl;
      career.currentLevel = Number(participant.estimated_level || career.currentLevel || 0);
      career.latestAt = eventTime(event);
    }
    careers.set(identity, career);
  }

  for (const match of confirmedMatches) {
    const event = eventById.get(String(match.event_id));
    const teamAScore = Number(match.team_a_score);
    const teamBScore = Number(match.team_b_score);
    if (!event || !Number.isFinite(teamAScore) || !Number.isFinite(teamBScore) || teamAScore === teamBScore) continue;
    const rows = (rowsByMatch.get(String(match.id)) || []).sort((a, b) => Number(a.slot) - Number(b.slot));
    const names = { A: [], B: [] };
    for (const row of rows) {
      const participant = eventPlayerById.get(String(row.event_player_id));
      if (participant && names[row.team]) names[row.team].push(participant.display_name || 'Player');
    }
    for (const row of rows) {
      const participant = eventPlayerById.get(String(row.event_player_id));
      if (!participant) continue;
      const identity = identityFor(participant);
      let career = careers.get(identity);
      if (!career) career = emptyCareer(identity, participant, event);
      if (eventTime(event) >= career.latestAt) {
        career.displayName = participant.display_name || career.displayName;
        career.avatarUrl = participant.avatar_url || career.avatarUrl;
        career.currentLevel = Number(participant.estimated_level || career.currentLevel || 0);
        career.latestAt = eventTime(event);
      }
      addResult(career, event, match, row.team, teamAScore, teamBScore, names);
      careers.set(identity, career);
    }
  }

  const players = calculatePlayerRanking([...careers.values()].map((career) => ({
    ...career,
    eventsJoined: career.eventIds.size,
    diff: career.pointsFor - career.pointsAgainst,
    eventHistory: [...career.eventHistory.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    recentMatches: career.recentMatches.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)).slice(0, 20)
  }))).filter((player) => player.matchesPlayed > 0);

  return {
    players,
    totalRegisteredPlayers: new Set(eventPlayers.filter((player) => player.player_id).map((player) => String(player.player_id))).size,
    totalUnlinkedPlayers: eventPlayers.filter((player) => !player.player_id && player.status !== 'removed').length,
    totalEvents: new Set(confirmedMatches.map((match) => String(match.event_id))).size,
    totalMatches: confirmedMatches.length
  };
}

export async function loadHallOfFame(supabase, organizationId) {
  const [events, eventPlayers, matches, matchPlayers, registeredCountResult] = await Promise.all([
    fetchAll(() => supabase.from('v2_events').select('id,name,event_date,start_time,end_time,status,venue_name,created_at,completed_at').eq('organization_id', organizationId).order('id')),
    fetchAll(() => supabase.from('v2_event_players').select('id,event_id,player_id,display_name,estimated_level,avatar_url,status,created_at').eq('organization_id', organizationId).neq('status', 'removed').order('id')),
    fetchAll(() => supabase.from('v2_matches').select('id,event_id,court_number,status,team_a_score,team_b_score,completed_at,created_at').eq('organization_id', organizationId).in('status', CONFIRMED).order('id')),
    fetchAll(() => supabase.from('v2_match_players').select('match_id,event_player_id,player_id,team,slot').eq('organization_id', organizationId).order('match_id')),
    supabase.rpc('v2_public_registered_player_count', { p_organization_id: organizationId })
  ]);
  if (registeredCountResult.error) throw registeredCountResult.error;
  return {
    ...buildHallOfFame({ events, eventPlayers, matches, matchPlayers }),
    totalRegisteredPlayers: Number(registeredCountResult.data || 0)
  };
}
