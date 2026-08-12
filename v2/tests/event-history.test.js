import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.location = { search: '' };

const { listEvents, listAllEvents, getSelectedEvent, deleteEvent, restoreEvent, permanentlyDeleteEvent } = await import('../src/services/localEventStore.js');
const { listLocalEventMatches } = await import('../src/services/localMatchStore.js');
const { clearLocalEventData } = await import('../src/services/localEventCleanup.js');
const events = [
  { id: 'event-new', name: 'New Event', status: 'live', createdAt: '2026-08-12T10:00:00Z' },
  { id: 'event-old', name: 'Old Event', status: 'completed', completedAt: '2026-08-06T14:00:00Z', createdAt: '2026-08-06T10:00:00Z' }
];
localStorage.setItem('gdsq_v2_events', JSON.stringify(events));
localStorage.setItem('gdsq_v2_selected_event_id', 'event-new');
localStorage.setItem('gdsq_v2_matches:event-new', JSON.stringify([{ id: 'new-match', eventId: 'event-new', status: 'confirmed' }]));
localStorage.setItem('gdsq_v2_matches:event-old', JSON.stringify([{ id: 'old-match', eventId: 'event-old', status: 'confirmed' }]));
localStorage.setItem('gdsq_v2_event_players:event-new', JSON.stringify([{ id: 'new-player', eventId: 'event-new' }]));

deleteEvent('event-new');
assert.deepEqual(listEvents().map((event) => event.id), ['event-old']);
assert.equal(getSelectedEvent().id, 'event-old');
assert.equal(JSON.parse(localStorage.getItem('gdsq_v2_matches:event-new')).length, 1, 'archive must preserve match history');
assert.equal(JSON.parse(localStorage.getItem('gdsq_v2_event_players:event-new')).length, 1, 'archive must preserve event players');
assert.equal(listLocalEventMatches('event-old')[0].id, 'old-match', 'events must keep independent match stores');

restoreEvent('event-new');
assert.deepEqual(new Set(listEvents().map((event) => event.id)), new Set(['event-new', 'event-old']));

permanentlyDeleteEvent('event-new');
clearLocalEventData('event-new');
assert.equal(listAllEvents().some((event) => event.id === 'event-new'), false);
assert.equal(localStorage.getItem('gdsq_v2_matches:event-new'), null, 'explicit permanent delete removes event history');
assert.equal(localStorage.getItem('gdsq_v2_event_players:event-new'), null, 'explicit permanent delete removes event players');
assert.equal(listLocalEventMatches('event-old')[0].id, 'old-match', 'permanent delete must not affect another event');

console.log('v2 event history tests passed');
