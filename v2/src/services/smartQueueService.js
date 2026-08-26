import { normalizeSmartQueueModes } from '../logic/smartQueue/smartQueueEngine.js';

const SETTINGS_TABLE = 'v2_smart_queue_settings';
const PREFERENCES_TABLE = 'v2_smart_queue_preferences';
const MATCHES_TABLE = 'v2_smart_queue_matches';
const LOCAL_KEY = 'gdsq_v2_smart_queue';
const INSTANT_CAPABILITY_PREFIX = 'gdsq_v2_smart_queue_capability:';

function nowIso() {
  return new Date().toISOString();
}

function localStorageAvailable() {
  return typeof localStorage !== 'undefined';
}

function readLocal() {
  if (!localStorageAvailable()) return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(value) {
  if (localStorageAvailable()) localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
}

function normalizePreference(row = {}) {
  return {
    ...row,
    eventPlayerId: row.eventPlayerId || row.event_player_id,
    eventId: row.eventId || row.event_id,
    organizationId: row.organizationId || row.organization_id,
    modes: normalizeSmartQueueModes(row.modes),
    preferredMode: row.preferredMode || row.preferred_mode || null,
    status: row.status || row.queueStatus || row.queue_status || 'rest',
    readySince: row.readySince || row.ready_since || null,
    updatedBy: row.updatedBy || row.updated_by || 'player',
    updatedAt: row.updatedAt || row.updated_at || null
  };
}

function normalizeMatchMeta(row = {}) {
  return {
    ...row,
    matchId: row.matchId || row.match_id,
    eventId: row.eventId || row.event_id,
    organizationId: row.organizationId || row.organization_id,
    courtNumber: Number(row.courtNumber || row.court_number),
    playMode: row.playMode || row.play_mode,
    state: row.state || row.queueState || row.queue_state,
    updatedAt: row.updatedAt || row.updated_at
  };
}

function missingSchema(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01' || /smart_queue|schema cache|does not exist/i.test(String(error?.message || ''));
}

function localEventState(eventId) {
  const all = readLocal();
  return all[String(eventId)] || { enabled: false, preferences: {}, matches: {} };
}

function saveLocalEventState(eventId, state) {
  const all = readLocal();
  all[String(eventId)] = state;
  writeLocal(all);
  return state;
}

export function createSmartQueueStore({ supabase = null, mode = 'mock', getAdminPasscode = null } = {}) {
  const shared = mode === 'supabase' && Boolean(supabase);

  async function adminCall(action, payload) {
    const passcode = action === 'smartQueueSetEnabled' ? await getAdminPasscode?.() : '';
    if (action === 'smartQueueSetEnabled' && !passcode) throw new Error('Admin access is required to change Match Making settings.');
    const { data, error } = await supabase.functions.invoke('v2-admin-results', { body: { action, ...(passcode ? { passcode } : {}), ...payload } });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Match Making admin request failed');
    return data;
  }

  function instantCapability(eventId, eventPlayerId) {
    if (!localStorageAvailable()) return '';
    return localStorage.getItem(`${INSTANT_CAPABILITY_PREFIX}${eventId}:${eventPlayerId}`) || '';
  }

  async function playerCapabilityCall(payload) {
    const capability = instantCapability(payload.eventId, payload.eventPlayerId);
    if (!capability) return null;
    const { data, error } = await supabase.functions.invoke('v2-smart-queue-player', {
      body: { action: 'saveOwnPreference', capability, ...payload }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Could not save Match Making preference');
    return normalizePreference(data.preference);
  }

  return {
    async load(eventId) {
      if (!eventId) return { enabled: false, schemaAvailable: shared ? null : true, preferences: [], matches: [] };
      if (!shared) {
        const state = localEventState(eventId);
        return {
          enabled: Boolean(state.enabled),
          schemaAvailable: true,
          preferences: Object.values(state.preferences || {}).map(normalizePreference),
          matches: Object.values(state.matches || {}).map(normalizeMatchMeta)
        };
      }
      const [settingsResult, preferencesResult, matchesResult] = await Promise.all([
        supabase.from(SETTINGS_TABLE).select('*').eq('event_id', eventId).maybeSingle(),
        supabase.from(PREFERENCES_TABLE).select('*').eq('event_id', eventId).order('ready_since', { ascending: true }),
        supabase.from(MATCHES_TABLE).select('*').eq('event_id', eventId).order('created_at', { ascending: false })
      ]);
      const error = settingsResult.error || preferencesResult.error || matchesResult.error;
      if (error) {
        if (missingSchema(error)) return { enabled: false, schemaAvailable: false, preferences: [], matches: [] };
        throw error;
      }
      return {
        enabled: Boolean(settingsResult.data?.enabled),
        schemaAvailable: true,
        preferences: (preferencesResult.data || []).map(normalizePreference),
        matches: (matchesResult.data || []).map(normalizeMatchMeta)
      };
    },

    async setEnabled({ eventId, organizationId, enabled, updatedBy = 'admin' }) {
      if (!shared) {
        const state = localEventState(eventId);
        saveLocalEventState(eventId, { ...state, enabled: Boolean(enabled), updatedAt: nowIso() });
        return Boolean(enabled);
      }
      const data = await adminCall('smartQueueSetEnabled', { eventId, organizationId, enabled: Boolean(enabled), updatedBy });
      return Boolean(data.setting?.enabled);
    },

    async savePreference({ eventId, organizationId, eventPlayerId, modes, preferredMode, status = 'ready', readySince, updatedBy = 'player' }) {
      const normalizedModes = normalizeSmartQueueModes(modes);
      const safePreferred = normalizedModes.includes(preferredMode) ? preferredMode : normalizedModes[0] || null;
      const timestamp = nowIso();
      const nextReadySince = status === 'ready' ? readySince || timestamp : null;
      const row = {
        event_player_id: eventPlayerId,
        event_id: eventId,
        organization_id: organizationId,
        modes: normalizedModes,
        preferred_mode: safePreferred,
        queue_status: status,
        ready_since: nextReadySince,
        updated_by: updatedBy,
        updated_at: timestamp
      };
      if (!shared) {
        const state = localEventState(eventId);
        const previous = state.preferences?.[String(eventPlayerId)] || {};
        state.preferences = { ...(state.preferences || {}), [String(eventPlayerId)]: { ...previous, ...row } };
        saveLocalEventState(eventId, state);
        return normalizePreference(state.preferences[String(eventPlayerId)]);
      }
      if (updatedBy !== 'player') {
        const data = await adminCall('smartQueueSavePreference', { eventId, organizationId, eventPlayerId, modes: normalizedModes, preferredMode: safePreferred, status, readySince: nextReadySince });
        return normalizePreference(data.preference);
      }
      const { data, error } = await supabase.from(PREFERENCES_TABLE).upsert(row, { onConflict: 'event_player_id' }).select('*').single();
      if (!error) return normalizePreference(data);
      const capabilitySaved = await playerCapabilityCall({ eventId, eventPlayerId, modes: normalizedModes, preferredMode: safePreferred, status });
      if (capabilitySaved) return capabilitySaved;
      throw error;
    },

    async recordMatch({ matchId, eventId, organizationId, courtNumber, playMode, state = 'match_ready' }) {
      const row = {
        match_id: matchId,
        event_id: eventId,
        organization_id: organizationId,
        court_number: Number(courtNumber),
        play_mode: playMode,
        queue_state: state,
        updated_at: nowIso()
      };
      if (!shared) {
        const eventState = localEventState(eventId);
        eventState.matches = { ...(eventState.matches || {}), [String(matchId)]: { ...(eventState.matches?.[String(matchId)] || {}), ...row } };
        saveLocalEventState(eventId, eventState);
        return normalizeMatchMeta(eventState.matches[String(matchId)]);
      }
      const data = await adminCall('smartQueueRecordMatch', { matchId, eventId, organizationId, courtNumber: Number(courtNumber), playMode, state });
      return normalizeMatchMeta(data.match);
    },

    async setMatchState(matchMeta, state) {
      return this.recordMatch({ ...matchMeta, state });
    }
  };
}
