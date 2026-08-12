import assert from 'node:assert/strict';
import { listArchivedEventsForDate, listStatsEvents } from '../src/services/supabaseEventService.js';

const filters = [];
const supabase = {
  from(table) {
    assert.equal(table, 'v2_events');
    const chain = {
      select() { return chain; },
      eq(field, value) { filters.push([field, value]); return chain; },
      order() { return Promise.resolve({ data: [{ id: 'archive-1', organization_id: 'org-1', event_date: '2026-08-06', status: 'deleted', court_count: 4 }], error: null }); }
    };
    return chain;
  }
};

const events = await listArchivedEventsForDate(supabase, 'org-1', '2026-08-06');
assert.deepEqual(filters, [['organization_id', 'org-1'], ['event_date', '2026-08-06'], ['status', 'deleted']]);
assert.equal(events[0].id, 'archive-1');
assert.equal(events[0].courtCount, 4);

// Public event history includes active, completed, and archived records. The
// normal organizer list remains separate, so archived history cannot become an
// active event by accident.
const historyFilters = [];
const historySupabase = {
  from(table) {
    assert.equal(table, 'v2_events');
    const chain = {
      select() { return chain; },
      eq(field, value) { historyFilters.push([field, value]); return chain; },
      order() { return chain; },
      then(resolve) { return Promise.resolve({ data: [
        { id: 'event-new', organization_id: 'org-1', event_date: '2026-08-12', status: 'completed', court_count: 4 },
        { id: 'event-old', organization_id: 'org-1', event_date: '2026-08-06', status: 'deleted', court_count: 4 }
      ], error: null }).then(resolve); }
    };
    return chain;
  }
};
const history = await listStatsEvents(historySupabase, 'org-1');
assert.deepEqual(historyFilters, [['organization_id', 'org-1']]);
assert.deepEqual(history.map((event) => event.id), ['event-new', 'event-old']);

console.log('v2 archived event history service tests passed');
