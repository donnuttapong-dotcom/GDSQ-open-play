// Publishes one local event to the existing v2 shared tables for a short public stats link.
// This is opt-in from the stats screen; it never changes the local event or match flow.

import { listEvents as listLocalEvents } from './localEventStore.js';
import { listLocalEventPlayers } from './localPlayerStore.js';
import { listLocalEventMatches } from './localMatchStore.js';
import { getSupabaseClient } from './supabaseClient.js';
import { createEvent } from './supabaseEventService.js';
import { checkInPlayer } from './supabasePlayerService.js';
import { createMatchPreview, confirmScore } from './supabaseMatchService.js';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PUBLIC_EVENT_MAP_KEY = 'gdsq_v2_public_stats_event_map';

function readMap() {
  try { return JSON.parse(localStorage.getItem(PUBLIC_EVENT_MAP_KEY) || '{}'); } catch { return {}; }
}

function playerId(value) {
  return typeof value === 'string' ? value : value?.id || value?.playerId || value?.eventPlayerId;
}

function courtNumber(match) {
  const source = match?.courtNumber || match?.court_number || match?.courtId || match?.courtName || 1;
  const number = Number(String(source).match(/\d+/)?.[0] || source);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

export async function publishLocalEventForPublicStats(localEventId) {
  const existingId = readMap()[localEventId];
  if (existingId) return existingId;

  const source = listLocalEvents().find((event) => String(event.id) === String(localEventId));
  const supabase = getSupabaseClient();
  if (!source) throw new Error('Local event was not found.');
  if (!supabase) throw new Error('Shared Mode is not configured.');

  const publishedEvent = await createEvent(supabase, {
    organizationId: ORGANIZATION_ID,
    name: source.name,
    venueName: source.venueName || source.venue,
    eventDate: source.eventDate,
    startTime: source.startTime,
    endTime: source.endTime,
    status: source.status || 'live',
    courtCount: source.courtCount || source.courts || 1,
    checkinOpen: false
  });
  const playerMap = new Map();
  for (const player of listLocalEventPlayers(localEventId).filter((item) => item.status !== 'removed')) {
    const shared = await checkInPlayer(supabase, {
      organizationId: ORGANIZATION_ID,
      eventId: publishedEvent.id,
      displayName: player.displayName || player.name,
      estimatedLevel: player.estimatedLevel || player.estimated_level || player.level,
      email: player.email,
      avatarUrl: player.avatarUrl || player.avatar_url || '',
      status: 'ready'
    });
    playerMap.set(String(player.id), shared.id);
  }
  for (const match of listLocalEventMatches(localEventId).filter((item) => ['confirmed', 'completed'].includes(String(item.status || '').toLowerCase()))) {
    const teamA = (match.teamA || []).map(playerId).map((id) => playerMap.get(String(id))).filter(Boolean);
    const teamB = (match.teamB || []).map(playerId).map((id) => playerMap.get(String(id))).filter(Boolean);
    if (teamA.length !== 2 || teamB.length !== 2) continue;
    const sharedMatch = await createMatchPreview(supabase, { organizationId: ORGANIZATION_ID, eventId: publishedEvent.id, courtNumber: courtNumber(match), teamA, teamB });
    const scoreA = Number(match.teamAScore), scoreB = Number(match.teamBScore);
    if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA !== scoreB) await confirmScore(supabase, sharedMatch.id, { teamAScore: scoreA, teamBScore: scoreB });
  }
  const map = readMap();
  map[localEventId] = publishedEvent.id;
  localStorage.setItem(PUBLIC_EVENT_MAP_KEY, JSON.stringify(map));
  return publishedEvent.id;
}
