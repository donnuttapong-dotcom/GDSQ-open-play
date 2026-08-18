import './bilingualUi.js?v=v2-bilingual-02';
import './shareLinksUi.js';
import { getServiceMode, SERVICE_MODES } from './serviceMode.js';
import { getSupabaseClient } from './supabaseClient.js';
import { isTestEnvironment, getTestAdminSession, knownTestEventIds, createTestEvent, authorizeTestAdmin, exitTestAdmin, invokeTestAdmin } from './testAdminService.js';
import { matchPlayerIds as normalizedMatchPlayerIds, normalizeMatch as normalizeSharedMatch } from './matchModel.js';
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
import { listEvents as listSupabaseEvents, listStatsEvents as listSupabaseStatsEvents, getEventById as getSupabaseEventById, listArchivedEventsForDate as listArchivedSupabaseEventsForDate, createEvent as createSupabaseEvent, updateEventStatus as updateSupabaseEventStatus, deleteEvent as deleteSupabaseEvent } from './supabaseEventService.js?v=event-history-01';
import { listEventPlayers as listSupabaseEventPlayers, checkInPlayer as checkInSupabasePlayer, updateEventPlayerStatus as updateSupabaseEventPlayerStatus, updateEventPlayerLevel as updateSupabaseEventPlayerLevel, findPlayerProfileByEmail as findSupabasePlayerProfileByEmail, getAuthenticatedPlayer as getSupabaseAuthenticatedPlayer, sendPlayerSignInLink as sendSupabasePlayerSignInLink, signOutPlayer as signOutSupabasePlayer, joinVerifiedPlayerEvent as joinSupabaseVerifiedPlayerEvent, joinInstantPlayerEvent as joinSupabaseInstantPlayerEvent, updateMyPlayerProfile as updateSupabaseMyPlayerProfile, requestPlayerProfileClaim as requestSupabasePlayerProfileClaim, listMyPlayerProfileClaims as listSupabaseMyPlayerProfileClaims } from './supabasePlayerService.js?v=instant-registration-01';
import { getOwnPlayerProfile as getSupabaseOwnPlayerProfile, updateOwnPlayerProfile as updateSupabaseOwnPlayerProfile, rememberedPlayerIdentity } from './playerIdentityService.js';
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
  return normalizedMatchPlayerIds(match);
}

async function setSupabasePlayersStatusSafely(supabase, players, status) {
  const updates = await Promise.allSettled(
    matchPlayerIds({ teamA: players, teamB: [] }).map((id) => updateSupabaseEventPlayerStatus(supabase, id, status))
  );
  return updates.some((result) => result.status === 'rejected');
}

export function createV2Services({ supabase = getSupabaseClient(), organizationId = '00000000-0000-4000-8000-000000000001', mode = getServiceMode() } = {}) {
  const isSupabase = mode === SERVICE_MODES.SUPABASE;
  const environments = new Map();
  let cachedTestEvents = [], testEventsCacheUntil = 0;
  const rememberEvents = (rows = []) => rows.map((row) => {
    environments.set(String(row.id), row.environment || 'live');
    return row;
  });
  const isTestEventId = (eventId) => environments.get(String(eventId)) === 'test';
  const test = (action, payload = {}) => invokeTestAdmin(requireSupabase(supabase), action, { ...payload, organizationId: payload.organizationId || organizationId });
  let organizerPasscode = '';
  async function organizerAdminCall(action, payload = {}) {
    if (!isSupabase) throw new Error('Organizer protected mutations require Supabase mode.');
    if (!organizerPasscode && typeof sessionStorage !== 'undefined') organizerPasscode = sessionStorage.getItem('gdsq_v2_organizer_passcode') || '';
    if (!organizerPasscode && typeof window !== 'undefined' && typeof window.prompt === 'function') organizerPasscode = window.prompt('Admin passcode / รหัส Admin')?.trim() || '';
    if (!organizerPasscode) throw new Error('ORGANIZER_PASSCODE_REQUIRED');
    const { data, error } = await requireSupabase(supabase).functions.invoke('v2-admin-results', { body: { action, passcode: organizerPasscode, organizationId, ...payload } });
    if (error) throw error;
    if (!data?.ok) {
      if (/invalid admin passcode|authorized admin/i.test(String(data?.error || ''))) {
        organizerPasscode = '';
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('gdsq_v2_organizer_passcode');
      }
      throw new Error(data?.error || 'Organizer mutation failed');
    }
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('gdsq_v2_organizer_passcode', organizerPasscode);
    return data;
  }
  const testEvents = async ({ force = false } = {}) => {
    if (!force && Date.now() < testEventsCacheUntil) return cachedTestEvents;
    const rows = (await Promise.all(knownTestEventIds().map(async (eventId) => {
      try { return (await test('getEvent', { eventId })).event; } catch { return null; }
    }))).filter(Boolean);
    cachedTestEvents = rows;
    testEventsCacheUntil = Date.now() + 30_000;
    return rows;
  };
  const invalidateTestEvents = () => { cachedTestEvents = []; testEventsCacheUntil = 0; };

  return {
    mode,

    async listEvents() {
      if (isSupabase) return rememberEvents([...(await listSupabaseEvents(requireSupabase(supabase), organizationId)), ...(await testEvents())]);
      return listLocalEvents();
    },

    async listStatsEvents() {
      if (isSupabase) return rememberEvents([...(await listSupabaseStatsEvents(requireSupabase(supabase), organizationId)), ...(await testEvents())]);
      return listAllLocalEvents().sort((a, b) => String(b.eventDate || b.createdAt || '').localeCompare(String(a.eventDate || a.createdAt || '')));
    },

    async listArchivedEventsForDate(eventDate) {
      if (!isSupabase) return [];
      return listArchivedSupabaseEventsForDate(requireSupabase(supabase), organizationId, eventDate);
    },

    async getCurrentEvent() {
      const eventId = requestedEventId();
      if (isSupabase) {
        const events = rememberEvents([...(await listSupabaseEvents(requireSupabase(supabase), organizationId)), ...(await testEvents())]);
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
      if (isSupabase && (isTestEventId(eventId) || Boolean(getTestAdminSession(eventId)))) {
        try { return rememberEvents([(await test('getEvent', { eventId })).event])[0]; } catch { return null; }
      }
      if (isSupabase) {
        const result = await getSupabaseEventById(requireSupabase(supabase), organizationId, eventId);
        return rememberEvents(result ? [result] : [])[0] || null;
      }
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
      if (isSupabase && payload.environment === 'test') {
        const result = await createTestEvent(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId, passcode: payload.testPasscode });
        invalidateTestEvents();
        return rememberEvents([result.event])[0];
      }
      if (isSupabase) return rememberEvents([await createSupabaseEvent(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId })])[0];
      return createLocalEvent(payload);
    },

    async updateEventStatus(eventId, status) {
      if (isSupabase && isTestEventId(eventId)) {
        const result = await test('endTest', { eventId, status });
        invalidateTestEvents();
        return rememberEvents([result.event])[0];
      }
      if (isSupabase) return updateSupabaseEventStatus(requireSupabase(supabase), eventId, status);
      return updateLocalEventStatus(eventId, status);
    },

    async deleteEvent(eventId) {
      if (isSupabase && isTestEventId(eventId)) { const result = await test('deleteEvent', { eventId }); invalidateTestEvents(); return result; }
      if (isSupabase) { await organizerAdminCall('archiveEvent', { eventId }); return { archivedId: eventId }; }
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
      if (isSupabase && isTestEventId(eventId)) return (await test('listPlayers', { eventId })).players || [];
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
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('checkInPlayer', payload);
        return result.player;
      }
      if (isSupabase) return checkInSupabasePlayer(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return checkInLocalPlayer(payload);
    },

    async addTestPlayers(payload) {
      if (!isSupabase || !isTestEventId(payload.eventId)) throw new Error('Batch Test players are available only inside a Test event.');
      const result = await test('addTestPlayers', payload);
      return result.players || [];
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

    async joinVerifiedPlayerEvent(payload) {
      if (!isSupabase) throw new Error('Verified QR registration requires Supabase mode.');
      return joinSupabaseVerifiedPlayerEvent(requireSupabase(supabase), payload);
    },

    async joinInstantPlayerEvent(payload) {
      if (!isSupabase) throw new Error('Instant QR registration requires Supabase mode.');
      return joinSupabaseInstantPlayerEvent(requireSupabase(supabase), payload);
    },

    async updateMyPlayerProfile(payload) {
      if (!isSupabase) throw new Error('Profile editing requires Supabase mode.');
      return updateSupabaseMyPlayerProfile(requireSupabase(supabase), payload);
    },

    async getMyIdentityProfile(payload = {}) {
      if (!isSupabase) return null;
      return getSupabaseOwnPlayerProfile(requireSupabase(supabase), payload);
    },

    async updateMyIdentityProfile(payload) {
      if (!isSupabase) throw new Error('Profile editing requires Supabase mode.');
      return updateSupabaseOwnPlayerProfile(requireSupabase(supabase), payload);
    },

    rememberedPlayerIdentity() {
      return rememberedPlayerIdentity();
    },

    async requestPlayerProfileClaim(eventPlayerId) {
      if (!isSupabase) throw new Error('Profile claiming requires Supabase mode.');
      return requestSupabasePlayerProfileClaim(requireSupabase(supabase), eventPlayerId);
    },

    async listMyPlayerProfileClaims() {
      if (!isSupabase) return [];
      return listSupabaseMyPlayerProfileClaims(requireSupabase(supabase));
    },

    async setPlayerStatus(eventId, playerId, status) {
      if (isSupabase && isTestEventId(eventId)) return test('setPlayerStatus', { eventId, playerId, status });
      if (isSupabase) {
        await organizerAdminCall('updateEventPlayerStatus', { eventId, eventPlayerId: playerId, status });
        return this.listEventPlayers(eventId);
      }
      setLocalPlayerStatus(eventId, [playerId], status);
      return this.listEventPlayers(eventId);
    },

    async updatePlayerLevel(eventId, playerId, level) {
      if (isSupabase && isTestEventId(eventId)) return test('updatePlayerLevel', { eventId, playerId, level });
      if (isSupabase) {
        await organizerAdminCall('updateEventPlayerLevel', { eventId, eventPlayerId: playerId, level });
        return this.listEventPlayers(eventId);
      }
      updateLocalEventPlayerLevel(eventId, playerId, level);
      setLocalPlayerLevel(eventId, playerId, level);
      return this.listEventPlayers(eventId);
    },

    async removePlayer(eventId, playerId) {
      if (isSupabase && isTestEventId(eventId)) return test('removePlayer', { eventId, playerId });
      if (isSupabase) {
        await organizerAdminCall('removeEventPlayer', { eventId, eventPlayerId: playerId });
        return this.listEventPlayers(eventId);
      }
      setLocalPlayerStatus(eventId, [playerId], 'removed');
      return this.listEventPlayers(eventId);
    },

    async forceAllPlayersReady(eventId) {
      if (isSupabase && isTestEventId(eventId)) return test('resetQueue', { eventId });
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
      if (isSupabase && isTestEventId(eventId)) return ((await test('listMatches', { eventId })).matches || []).map(normalizeSharedMatch);
      if (isSupabase) return listSupabaseEventMatches(requireSupabase(supabase), eventId);
      const localMatches = listLocalEventMatches(eventId);
      if (!isDemoEvent(eventId)) return localMatches;
      const seedHistory = await getMockMatchHistory();
      return [...localMatches, ...seedHistory];
    },

    async getTestOrganizerState(eventId) {
      if (!isSupabase || !isTestEventId(eventId)) throw new Error('Test Organizer state is available only inside a Test event.');
      const result = await test('getOrganizerState', { eventId });
      rememberEvents([result.event]);
      return { ...result, matches: (result.matches || []).map(normalizeSharedMatch) };
    },

    async createMatchPreview(payload) {
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('createMatchPreview', payload);
        return normalizeSharedMatch(result.match);
      }
      if (isSupabase) return createSupabaseMatchPreview(requireSupabase(supabase), { ...payload, organizationId: payload.organizationId || organizationId });
      return createLocalMatchPreview(payload);
    },

    async updateMatchPreview(matchId, payload) {
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('updateMatchPreview', { ...payload, matchId });
        return normalizeSharedMatch(result.match);
      }
      if (isSupabase) return updateSupabaseMatchPreview(requireSupabase(supabase), matchId, { ...payload, organizationId: payload.organizationId || organizationId });
      return updateLocalMatchPreview(payload.eventId, matchId, payload);
    },

    async startMatch(matchId, payload = {}) {
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('startMatch', { ...payload, matchId });
        return normalizeSharedMatch(result.match);
      }
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
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('cancelMatch', { ...payload, matchId });
        return normalizeSharedMatch(result.match);
      }
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
      if (isSupabase && isTestEventId(payload.eventId)) {
        const result = await test('confirmScore', { ...payload, matchId });
        return normalizeSharedMatch(result.match);
      }
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

    isTestEvent(event) { return isTestEnvironment(event); },
    hasTestAdminSession(eventId) { return Boolean(getTestAdminSession(eventId)); },
    async authorizeTestAdmin(eventId, passcode) {
      const result = await authorizeTestAdmin(requireSupabase(supabase), eventId, passcode);
      rememberEvents([result.event]);
      invalidateTestEvents();
      return result.event;
    },
    async exitTestAdmin(eventId) { return exitTestAdmin(requireSupabase(supabase), eventId); },
    async saveTestSmartPreference(payload) { return test('savePreference', payload); },
    async listTestSmartPreferences(eventId) { return (await test('listPreferences', { eventId })).preferences || []; },
    async resetTestMatches(eventId) { return test('resetMatches', { eventId }); },
    async resetTestQueue(eventId) { return test('resetQueue', { eventId }); },
    async resetTestEvent(eventId) { return test('resetEvent', { eventId }); },

    async canEditConfirmedResults() {
      // Supabase historical edits are intentionally isolated to v2-admin-results.
      // The normal player session must never be advertised as an editor capability.
      return !isSupabase;
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
