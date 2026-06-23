import { getServiceMode, SERVICE_MODES } from './serviceMode.js';
import {
  listEvents as listLocalEvents,
  getSelectedEvent,
  selectEvent as selectLocalEvent,
  createEvent as createLocalEvent,
  updateEventStatus as updateLocalEventStatus,
  deleteEvent as deleteLocalEvent
} from './localEventStore.js';
import { getCourts as getMockCourts } from './mockEventService.js';
import { getEventPlayers as getMockEventPlayers } from './mockPlayerService.js';
import { getMatchHistory as getMockMatchHistory } from './mockMatchService.js';
import { listLocalEventPlayers, checkInLocalPlayer } from './localPlayerStore.js';
import { mergeLocalPlayerStats, setLocalPlayerStatus, forceAllLocalPlayersReady, applyLocalMatchResult } from './localPlayerStatsStore.js';
import { listLocalEventMatches, createLocalMatchPreview, startLocalMatch, cancelLocalMatch, confirmLocalScore } from './localMatchStore.js';
import { listEvents as listSupabaseEvents, createEvent as createSupabaseEvent, updateEventStatus as updateSupabaseEventStatus } from './supabaseEventService.js';
import { listEventPlayers as listSupabaseEventPlayers, checkInPlayer as checkInSupabasePlayer } from './supabasePlayerService.js';
import { listEventMatches as listSupabaseEventMatches, createMatchPreview as createSupabaseMatchPreview, startMatch as startSupabaseMatch, confirmScore as confirmSupabaseScore } from './supabaseMatchService.js';

const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

function requireSupabase(supabase) {
  if (!supabase) throw new Error('Supabase client is required in supabase mode.');
  return supabase;
}

function requestedEventId() {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const fromUrl = params.get('event') || params.get('eventId') || params.get('id');
  if (fromUrl) {
    localStorage.setItem(SELECTED_EVENT_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(SELECTED_EVENT_KEY) || '';
}

function matchPlayerIds(match) {
  return [...(match.teamA || match.team_a || []), ...(match.teamB || match.team_b || [])]
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.playerId || item?.eventPlayerId))
    .filter(Boolean);
}

export function createV2Services({ supabase = null, organizationId = '00000000-0000-4000-8000-000000000001', mode = getServiceMode() } = {}) {
  const isSupabase = mode === SERVICE_MODES.SUPABASE;

  return {
    mode,

    async listEvents() {
      if (isSupabase) return listSupabaseEvents(requireSupabase(supabase), organizationId);
      return listLocalEvents();
    },

    async getCurrentEvent() {
      const eventId = requestedEventId();
      if (isSupabase) {
        const events = await listSupabaseEvents(requireSupabase(supabase), organizationId);
        const selected = eventId ? events.find((event) => String(event.id) === String(eventId)) : null;
        return selected || events.find((event) => event.status === 'live') || events[0] || null;
      }
      if (eventId) {
        const selected = selectLocalEvent(eventId);
        if (selected) return selected;
      }
      return getSelectedEvent();
    },

    async selectEvent(eventId) {
      if (isSupabase) {
        localStorage.setItem(SELECTED_EVENT_KEY, eventId);
        return eventId;
      }
      return selectLocalEvent(eventId);
    },

    async createEvent(payload) {
      if (isSupabase) return createSupabaseEvent(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return createLocalEvent(payload);
    },

    async updateEventStatus(eventId, status) {
      if (isSupabase) return updateSupabaseEventStatus(requireSupabase(supabase), eventId, status);
      return updateLocalEventStatus(eventId, status);
    },

    async deleteEvent(eventId) {
      if (isSupabase) throw new Error('deleteEvent for Supabase mode is not implemented yet.');
      return deleteLocalEvent(eventId);
    },

    async getCourts() {
      if (isSupabase) {
        const event = await this.getCurrentEvent();
        const count = Number(event?.court_count || event?.courtCount || 1);
        return Array.from({ length: count }, (_, index) => ({ id: `court-${index + 1}`, name: `Court ${index + 1}` }));
      }
      return getMockCourts();
    },

    async listEventPlayers(eventId) {
      if (isSupabase) return listSupabaseEventPlayers(requireSupabase(supabase), eventId);
      const checkedInPlayers = listLocalEventPlayers(eventId);
      const seedPlayers = await getMockEventPlayers();
      const existingNames = new Set(seedPlayers.map((player) => String(player.displayName || player.name).toLowerCase()));
      const uniqueCheckedIn = checkedInPlayers.filter((player) => !existingNames.has(String(player.displayName || player.name).toLowerCase()));
      return mergeLocalPlayerStats(eventId, [...seedPlayers, ...uniqueCheckedIn]).filter((player) => player.status !== 'removed');
    },

    async checkInPlayer(payload) {
      if (isSupabase) return checkInSupabasePlayer(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return checkInLocalPlayer(payload);
    },

    async setPlayerStatus(eventId, playerId, status) {
      if (isSupabase) throw new Error('setPlayerStatus for Supabase mode is not implemented yet.');
      setLocalPlayerStatus(eventId, [playerId], status);
      return this.listEventPlayers(eventId);
    },

    async removePlayer(eventId, playerId) {
      if (isSupabase) throw new Error('removePlayer for Supabase mode is not implemented yet.');
      setLocalPlayerStatus(eventId, [playerId], 'removed');
      return this.listEventPlayers(eventId);
    },

    async forceAllPlayersReady(eventId) {
      if (isSupabase) throw new Error('forceAllPlayersReady for Supabase mode is not implemented yet.');
      const players = await this.listEventPlayers(eventId);
      forceAllLocalPlayersReady(eventId, players);
      return this.listEventPlayers(eventId);
    },

    async listEventMatches(eventId) {
      if (isSupabase) return listSupabaseEventMatches(requireSupabase(supabase), eventId);
      const localMatches = listLocalEventMatches(eventId);
      const seedHistory = await getMockMatchHistory();
      return [...localMatches, ...seedHistory];
    },

    async createMatchPreview(payload) {
      if (isSupabase) return createSupabaseMatchPreview(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return createLocalMatchPreview(payload);
    },

    async startMatch(matchId, payload = {}) {
      if (isSupabase) return startSupabaseMatch(requireSupabase(supabase), matchId);
      const match = startLocalMatch(payload.eventId, matchId);
      setLocalPlayerStatus(payload.eventId, matchPlayerIds(match), 'playing');
      return match;
    },

    async cancelMatch(matchId, payload = {}) {
      if (isSupabase) throw new Error('cancelMatch for Supabase mode is not implemented yet.');
      const match = cancelLocalMatch(payload.eventId, matchId, {
        reason: payload.reason || 'cancelled_by_organizer',
        teamAScore: payload.teamAScore,
        teamBScore: payload.teamBScore,
        keepScoreDraft: true
      });
      setLocalPlayerStatus(payload.eventId, matchPlayerIds(match), 'ready');
      return match;
    },

    async confirmScore(matchId, payload) {
      if (isSupabase) return confirmSupabaseScore(requireSupabase(supabase), matchId, payload);
      const match = confirmLocalScore(payload.eventId, matchId, payload);
      applyLocalMatchResult(payload.eventId, match);
      return match;
    }
  };
}
