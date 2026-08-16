const EVENTS_KEY = 'gdsq_v2_events';
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

const seedEvents = [
  {
    id: 'demo-event-001',
    organizationId: 'gdsq-demo',
    venueId: 'club46',
    name: 'GDSQ Open Play — Saturday',
    venueName: 'Club46',
    courtCount: 4,
    status: 'live',
    eventDate: '2026-06-22',
    startTime: '16:00',
    endTime: '18:00',
    createdAt: '2026-06-22T09:00:00+07:00'
  },
  {
    id: 'demo-event-002',
    organizationId: 'gdsq-demo',
    venueId: 'garden-square',
    name: 'GDSQ Social Play',
    venueName: 'Garden Square',
    courtCount: 2,
    status: 'completed',
    eventDate: '2026-06-21',
    startTime: '17:00',
    endTime: '19:00',
    createdAt: '2026-06-21T09:00:00+07:00'
  },
  {
    id: 'demo-event-003',
    organizationId: 'gdsq-demo',
    venueId: 'sukspace',
    name: 'Beginner Open Court',
    venueName: 'Sukspace',
    courtCount: 3,
    status: 'draft',
    eventDate: '2026-06-25',
    startTime: '18:00',
    endTime: '20:00',
    createdAt: '2026-06-20T09:00:00+07:00'
  }
];

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeEvent(input) {
  return {
    id: input.id || `event-${Date.now()}`,
    organizationId: input.organizationId || 'gdsq-demo',
    venueId: input.venueId || String(input.venueName || input.venue || 'venue').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: input.name || 'Untitled Open Play',
    venueName: input.venueName || input.venue || 'Venue',
    courtCount: Number(input.courtCount || input.courts || 1),
    matchingMode: input.matchingMode || input.matching_mode || 'standard',
    status: input.status || 'draft',
    eventDate: input.eventDate || input.date || new Date().toISOString().slice(0, 10),
    startTime: input.startTime || '16:00',
    endTime: input.endTime || '18:00',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: input.completedAt || null,
    hallOfFameProcessedAt: input.hallOfFameProcessedAt || null
  };
}

export function ensureSeedEvents() {
  const current = safeJsonParse(localStorage.getItem(EVENTS_KEY), null);
  if (!Array.isArray(current) || !current.length) {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(seedEvents));
    localStorage.setItem(SELECTED_EVENT_KEY, seedEvents[0].id);
    return seedEvents;
  }
  return current;
}

export function listEvents() {
  return ensureSeedEvents()
    .filter((event) => !['deleted', 'archived'].includes(String(event.status || '').toLowerCase()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function listAllEvents() {
  return ensureSeedEvents().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getSelectedEvent() {
  const events = listEvents();
  const selectedId = localStorage.getItem(SELECTED_EVENT_KEY);
  return events.find((event) => event.id === selectedId) || events[0] || seedEvents[0];
}

export function selectEvent(eventId) {
  const events = listEvents();
  const event = events.find((item) => item.id === eventId);
  if (!event) return null;
  localStorage.setItem(SELECTED_EVENT_KEY, event.id);
  return event;
}

export function createEvent(input) {
  const events = listAllEvents();
  const event = normalizeEvent(input);
  const next = [event, ...events];
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  localStorage.setItem(SELECTED_EVENT_KEY, event.id);
  return event;
}

export function updateEventStatus(eventId, status) {
  const events = listAllEvents();
  const completed = ['completed', 'ended', 'closed', 'finished'].includes(String(status || '').toLowerCase());
  const next = events.map((event) => {
    if (event.id !== eventId) return event;
    const now = new Date().toISOString();
    return {
      ...event,
      status,
      completedAt: completed ? (event.completedAt || now) : event.completedAt || null,
      // This local-mode marker mirrors the production trigger and is
      // intentionally retained when an ended event is reopened.
      hallOfFameProcessedAt: completed ? (event.hallOfFameProcessedAt || event.completedAt || now) : event.hallOfFameProcessedAt || null,
      updatedAt: now
    };
  });
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  return next.find((event) => event.id === eventId) || null;
}

export function deleteEvent(eventId) {
  const events = listAllEvents();
  const next = events.map((event) => event.id === eventId
    ? { ...event, status: 'deleted', archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    : event);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  if (localStorage.getItem(SELECTED_EVENT_KEY) === eventId) {
    const fallback = next.find((event) => !['deleted', 'archived'].includes(String(event.status || '').toLowerCase()));
    if (fallback) localStorage.setItem(SELECTED_EVENT_KEY, fallback.id);
    else localStorage.removeItem(SELECTED_EVENT_KEY);
  }
  return { archivedId: eventId, events: next };
}

export function restoreEvent(eventId) {
  const events = listAllEvents();
  const next = events.map((event) => event.id === eventId
    ? { ...event, status: event.completedAt ? 'completed' : 'draft', archivedAt: null, updatedAt: new Date().toISOString() }
    : event);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  return next.find((event) => event.id === eventId) || null;
}

export function permanentlyDeleteEvent(eventId) {
  const next = listAllEvents().filter((event) => event.id !== eventId);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  if (localStorage.getItem(SELECTED_EVENT_KEY) === eventId) {
    if (next[0]) localStorage.setItem(SELECTED_EVENT_KEY, next[0].id);
    else localStorage.removeItem(SELECTED_EVENT_KEY);
  }
  return { deletedId: eventId, events: next };
}

export function resetEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(seedEvents));
  localStorage.setItem(SELECTED_EVENT_KEY, seedEvents[0].id);
  return seedEvents;
}
