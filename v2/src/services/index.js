import { getServiceMode, SERVICE_MODES } from './serviceMode.js';
import {
  listEvents as listLocalEvents,
  getSelectedEvent,
  selectEvent as selectLocalEvent,
  createEvent as createLocalEvent,
  updateEventStatus as updateLocalEventStatus
} from './localEventStore.js';
import { getCourts as getMockCourts } from './mockEventService.js';
import { getEventPlayers as getMockEventPlayers } from './mockPlayerService.js';
import { getMatchHistory as getMockMatchHistory, confirmScore as confirmMockScore } from './mockMatchService.js';
import { listEvents as listSupabaseEvents, createEvent as createSupabaseEvent, updateEventStatus as updateSupabaseEventStatus } from './supabaseEventService.js';
import { listEventPlayers as listSupabaseEventPlayers, checkInPlayer as checkInSupabasePlayer } from './supabasePlayerService.js';
import { listEventMatches as listSupabaseEventMatches, confirmScore as confirmSupabaseScore } from './supabaseMatchService.js';

function requireSupabase(supabase) {
  if (!supabase) {
    throw new Error('Supabase client is required in supabase mode.');
  }
  return supabase;
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
      if (isSupabase) {
        const events = await listSupabaseEvents(requireSupabase(supabase), organizationId);
        return events.find((event) => event.status === 'live') || events[0] || null;
      }
      return getSelectedEvent();
    },

    async selectEvent(eventId) {
      if (isSupabase) {
        // In supabase mode, selection is a client concern. Persist selected ID locally for now.
        localStorage.setItem('gdsq_v2_selected_event_id', eventId);
        return eventId;
      }
      return selectLocalEvent(eventId);
    },

    async createEvent(payload) {
      if (isSupabase) {
        return createSupabaseEvent(requireSupabase(supabase), {
          ...payload,
          organizationId: payload.organizationId || organizationId
        });
      }
      return createLocalEvent(payload);
    },

    async updateEventStatus(eventId, status) {
      if (isSupabase) return updateSupabaseEventStatus(requireSupabase(supabase), eventId, status);
      return updateLocalEventStatus(eventId, status);
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
      return getMockEventPlayers();
    },

    async checkInPlayer(payload) {
      if (isSupabase) {
        return checkInSupabasePlayer(requireSupabase(supabase), {
          ...payload,
          organizationId: payload.organizationId || organizationId
        });
      }
      throw new Error('checkInPlayer is not implemented in mock adapter yet. Use mockPlayerService for static check-in prototype.');
    },

    async listEventMatches(eventId) {
      if (isSupabase) return listSupabaseEventMatches(requireSupabase(supabase), eventId);
      return getMockMatchHistory();
    },

    async confirmScore(matchId, payload) {
      if (isSupabase) return confirmSupabaseScore(requireSupabase(supabase), matchId, payload);
      return confirmMockScore(matchId, payload);
    }
  };
}
