import './bilingualUi.js?v=v2-bilingual-02';
import './shareLinksUi.js';
import { getServiceMode, SERVICE_MODES } from './serviceMode.js';
import { getSupabaseClient } from './supabaseClient.js';
import {
  listEvents as listLocalEvents,
  getSelectedEvent,
  selectEvent as selectLocalEvent,
  createEvent as createLocalEvent,
  updateEventStatus as updateLocalEventStatus,
  deleteEvent as deleteLocalEvent,
  listAllEvents as listAllLocalEvents,
  restoreEvent as restoreLocalEvent,
  permanentlyDeleteEvent as permanentlyDeleteLocalEvent
} from './localEventStore.js';
import { getCourts as getMockCourts } from './mockEventService.js';
import { getEventPlayers as getMockEventPlayers } from './mockPlayerService.js';
import { getMatchHistory as getMockMatchHistory } from './mockMatchService.js';
import { listLocalEventPlayers, checkInLocalPlayer, updateLocalEventPlayerLevel, findLocalPlayerProfileByEmail } from './localPlayerStore.js?v=email-profile-02';
import { mergeLocalPlayerStats, setLocalPlayerStatus, setLocalPlayerLevel, forceAllLocalPlayersReady, applyLocalMatchResult, rebuildLocalMatchStats, releaseInactivePlayingPlayers } from './localPlayerStatsStore.js';
import { listLocalEventMatches, createLocalMatchPreview, updateLocalMatchPreview, startLocalMatch, cancelLocalMatch, confirmLocalScore, updateLocalConfirmedScore } from './localMatchStore.js';
import { clearLocalEventData } from './localEventCleanup.js';
import { listEvents as listSupabaseEvents, getEventById as getSupabaseEventById, listArchivedEventsForDate as listArchivedSupabaseEventsForDate, createEvent as createSupabaseEvent, updateEventStatus as updateSupabaseEventStatus, deleteEvent as deleteSupabaseEvent } from './supabaseEventService.js';
import { listEventPlayers as listSupabaseEventPlayers, checkInPlayer as checkInSupabasePlayer, updateEventPlayerStatus as updateSupabaseEventPlayerStatus, updateEventPlayerLevel as updateSupabaseEventPlayerLevel, findPlayerProfileByEmail as findSupabasePlayerProfileByEmail, getAuthenticatedPlayer as getSupabaseAuthenticatedPlayer, sendPlayerSignInLink as sendSupabasePlayerSignInLink, signOutPlayer as signOutSupabasePlayer } from './supabasePlayerService.js?v=secure-profile-01';
import { listEventMatches as listSupabaseEventMatches, createMatchPreview as createSupabaseMatchPreview, updateMatchPreview as updateSupabaseMatchPreview, startMatch as startSupabaseMatch, cancelMatch as cancelSupabaseMatch, confirmScore as confirmSupabaseScore, updateConfirmedScore as updateSupabaseConfirmedScore, isAdminPasscodeConfigured as isSupabaseAdminPasscodeConfigured, setAdminPasscode as setSupabaseAdminPasscode, updateConfirmedScoreWithPasscode as updateSupabaseConfirmedScoreWithPasscode } from './supabaseMatchService.js';

const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

function requireSupabase(supabase) {
  if (!supabase) throw new Error('Supabase client is required in supabase mode.');
  return supabase;
}

function isDemoEvent(eventId) {
  return String(eventId || '').startsWith('demo-event-');
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

async function setSupabasePlayersStatusSafely(supabase, players, status) {
  const updates = await Promise.allSettled(
    matchPlayerIds({ teamA: players, teamB: [] }).map((id) => updateSupabaseEventPlayerStatus(supabase, id, status))
  );
  return updates.some((result) => result.status === 'rejected');
}

export function createV2Services({ supabase = getSupabaseClient(), organizationId = '00000000-0000-4000-8000-000000000001', mode = getServiceMode() } = {}) {
  const isSupabase = mode === SERVICE_MODES.SUPABASE;

  return {
    mode,

    async listEvents() {
      if (isSupabase) return listSupabaseEvents(requireSupabase(supabase), organizationId);
      return listLocalEvents();
    },

    async listArchivedEventsForDate(eventDate) {
      if (!isSupabase) return [];
      return listArchivedSupabaseEventsForDate(requireSupabase(supabase), organizationId, eventDate);
    },

    async getCurrentEvent() {
      const eventId = requestedEventId();
      if (isSupabase) {
        const events = await listSupabaseEvents(requireSupabase(supabase), organizationId);
        localStorage.setItem('gdsq_v2_events', JSON.stringify(events));
        const selected = eventId ? events.find((event) => String(event.id) === String(eventId)) : null;
        const current = selected || events.find((event) => event.status === 'live') || events[0] || null;
        if (current && String(current.id) !== String(eventId)) localStorage.setItem(SELECTED_EVENT_KEY, current.id);
        return current;
      }
      if (eventId) {
        const selected = selectLocalEvent(eventId);
        if (selected) return selected;
      }
      return getSelectedEvent();
    },

    async getEventById(eventId) {
      if (isSupabase) return getSupabaseEventById(requireSupabase(supabase), organizationId, eventId);
      return listAllLocalEvents().find((event) => String(event.id) === String(eventId)) || null;
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
      if (isSupabase) return deleteSupabaseEvent(requireSupabase(supabase), eventId);
      return deleteLocalEvent(eventId);
    },

    async listAllEvents() {
      if (isSupabase) throw new Error('Archived Supabase events are available through the Admin service only.');
      return listAllLocalEvents();
    },

    async restoreEvent(eventId) {
      if (isSupabase) throw new Error('Restore Supabase events through the Admin service.');
      return restoreLocalEvent(eventId);
    },

    async permanentlyDeleteEvent(eventId) {
      if (isSupabase) throw new Error('Permanent Supabase deletion is restricted to the Admin service.');
      const result = permanentlyDeleteLocalEvent(eventId);
      clearLocalEventData(eventId);
      return result;
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
      const localMatches = listLocalEventMatches(eventId);
      if (!isDemoEvent(eventId)) {
        releaseInactivePlayingPlayers(eventId, checkedInPlayers, localMatches);
        return mergeLocalPlayerStats(eventId, checkedInPlayers).filter((player) => player.status !== 'removed');
      }
      const seedPlayers = await getMockEventPlayers();
      const existingNames = new Set(seedPlayers.map((player) => String(player.displayName || player.name).toLowerCase()));
      const uniqueCheckedIn = checkedInPlayers.filter((player) => !existingNames.has(String(player.displayName || player.name).toLowerCase()));
      const allPlayers = [...seedPlayers, ...uniqueCheckedIn];
      releaseInactivePlayingPlayers(eventId, allPlayers, localMatches);
      return mergeLocalPlayerStats(eventId, allPlayers).filter((player) => player.status !== 'removed');
    },

    async checkInPlayer(payload) {
      if (isSupabase) return checkInSupabasePlayer(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return checkInLocalPlayer(payload);
    },

    async findPlayerProfileByEmail(email) {
      if (isSupabase) return findSupabasePlayerProfileByEmail(requireSupabase(supabase), organizationId, email);
      return findLocalPlayerProfileByEmail(email);
    },

    async getAuthenticatedPlayer() {
      if (isSupabase) return getSupabaseAuthenticatedPlayer(requireSupabase(supabase));
      return null;
    },

    async sendPlayerSignInLink(email, redirectTo) {
      if (!isSupabase) return false;
      return sendSupabasePlayerSignInLink(requireSupabase(supabase), email, redirectTo);
    },

    async signOutPlayer() {
      if (!isSupabase) return true;
      return signOutSupabasePlayer(requireSupabase(supabase));
    },

    async setPlayerStatus(eventId, playerId, status) {
      if (isSupabase) {
        await updateSupabaseEventPlayerStatus(requireSupabase(supabase), playerId, status);
        return this.listEventPlayers(eventId);
      }
      setLocalPlayerStatus(eventId, [playerId], status);
      return this.listEventPlayers(eventId);
    },

    async updatePlayerLevel(eventId, playerId, level) {
      if (isSupabase) {
        await updateSupabaseEventPlayerLevel(requireSupabase(supabase), playerId, level);
        return this.listEventPlayers(eventId);
      }
      updateLocalEventPlayerLevel(eventId, playerId, level);
      setLocalPlayerLevel(eventId, playerId, level);
      return this.listEventPlayers(eventId);
    },

    async removePlayer(eventId, playerId) {
      if (isSupabase) {
        await updateSupabaseEventPlayerStatus(requireSupabase(supabase), playerId, 'removed');
        return this.listEventPlayers(eventId);
      }
      setLocalPlayerStatus(eventId, [playerId], 'removed');
      return this.listEventPlayers(eventId);
    },

    async forceAllPlayersReady(eventId) {
      if (isSupabase) {
        const players = await this.listEventPlayers(eventId);
        await Promise.all(players.map((player) => updateSupabaseEventPlayerStatus(requireSupabase(supabase), player.id, 'ready')));
        return this.listEventPlayers(eventId);
      }
      const players = await this.listEventPlayers(eventId);
      forceAllLocalPlayersReady(eventId, players);
      return this.listEventPlayers(eventId);
    },

    async listEventMatches(eventId) {
      if (isSupabase) return listSupabaseEventMatches(requireSupabase(supabase), eventId);
      const localMatches = listLocalEventMatches(eventId);
      if (!isDemoEvent(eventId)) return localMatches;
      const seedHistory = await getMockMatchHistory();
      return [...localMatches, ...seedHistory];
    },

    async createMatchPreview(payload) {
      if (isSupabase) return createSupabaseMatchPreview(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return createLocalMatchPreview(payload);
    },

    async updateMatchPreview(matchId, payload) {
      if (isSupabase) return updateSupabaseMatchPreview(requireSupabase(supabase), matchId, { ...payload, organizationId: payload.organizationId || organizationId });
      return updateLocalMatchPreview(payload.eventId, matchId, payload);
    },

    async startMatch(matchId, payload = {}) {
      if (isSupabase) {
        const match = await startSupabaseMatch(requireSupabase(supabase), matchId);
        const playerStatusWarning = await setSupabasePlayersStatusSafely(requireSupabase(supabase), matchPlayerIds(match), 'playing');
        return { ...match, playerStatusWarning };
      }
      const match = startLocalMatch(payload.eventId, matchId);
      setLocalPlayerStatus(payload.eventId, matchPlayerIds(match), 'playing');
      return match;
    },

    async cancelMatch(matchId, payload = {}) {
      if (isSupabase) {
        const match = await cancelSupabaseMatch(requireSupabase(supabase), matchId, payload);
        const playerStatusWarning = await setSupabasePlayersStatusSafely(requireSupabase(supabase), matchPlayerIds(match), 'ready');
        return { ...match, playerStatusWarning };
      }
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
      if (isSupabase) {
        const match = await confirmSupabaseScore(requireSupabase(supabase), matchId, payload);
        const playerUpdates = await Promise.allSettled(
          matchPlayerIds(match).map((id) => updateSupabaseEventPlayerStatus(requireSupabase(supabase), id, 'ready'))
        );
        const playerStatusWarning = playerUpdates.some((result) => result.status === 'rejected');
        return { ...match, playerStatusWarning };
      }
      const match = confirmLocalScore(payload.eventId, matchId, payload);
      applyLocalMatchResult(payload.eventId, match);
      return match;
    },

    async canEditConfirmedResults() {
      if (!isSupabase) return true;
      return Boolean(await getSupabaseAuthenticatedPlayer(requireSupabase(supabase)));
    },

    async updateConfirmedScore(matchId, payload) {
      if (isSupabase) return updateSupabaseConfirmedScore(requireSupabase(supabase), matchId, payload);
      const match = updateLocalConfirmedScore(payload.eventId, matchId, payload);
      rebuildLocalMatchStats(payload.eventId, listLocalEventMatches(payload.eventId));
      return match;
    },

    async isAdminPasscodeConfigured() { return isSupabase ? isSupabaseAdminPasscodeConfigured(requireSupabase(supabase)) : Boolean(localStorage.getItem('gdsq_v2_admin_passcode')); },
    async setAdminPasscode(passcode) { if (isSupabase) return setSupabaseAdminPasscode(requireSupabase(supabase), passcode); localStorage.setItem('gdsq_v2_admin_passcode', passcode); return true; },
    async updateConfirmedScoreWithPasscode(matchId, payload) {
      if (isSupabase) return updateSupabaseConfirmedScoreWithPasscode(requireSupabase(supabase), matchId, payload);
      if (payload.passcode !== localStorage.getItem('gdsq_v2_admin_passcode')) throw new Error('Invalid admin passcode');
      return this.updateConfirmedScore(matchId, payload);
    }

  };
}
