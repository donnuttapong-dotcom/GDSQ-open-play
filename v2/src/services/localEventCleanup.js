import { listLocalEventMatches, clearLocalEventMatches } from './localMatchStore.js';
import { clearLocalEventPlayers } from './localPlayerStore.js';
import { clearLocalPlayerStats } from './localPlayerStatsStore.js';
import { clearScoreDraft } from './localDraftService.js';

export function clearLocalEventData(eventId) {
  if (!eventId) return;
  listLocalEventMatches(eventId).forEach((match) => clearScoreDraft(match.id));
  clearLocalEventPlayers(eventId);
  clearLocalEventMatches(eventId);
  clearLocalPlayerStats(eventId);
  localStorage.removeItem(`gdsq_v2_my_player:${eventId}`);
  localStorage.removeItem(`gdsq_v2_my_player_meta:${eventId}`);
}
