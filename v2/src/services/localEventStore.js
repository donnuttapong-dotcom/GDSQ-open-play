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
    status: input.status || 'draft',
    eventDate: input.eventDate || input.date || new Date().toISOString().slice(0, 10),
    startTime: input.startTime || '16:00',
    endTime: input.endTime || '18:00',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
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
  const events = listEvents();
  const event = normalizeEvent(input);
  const next = [event, ...events];
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  localStorage.setItem(SELECTED_EVENT_KEY, event.id);
  return event;
}

export function updateEventStatus(eventId, status) {
  const events = listEvents();
  const next = events.map((event) => event.id === eventId ? { ...event, status, updatedAt: new Date().toISOString() } : event);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
  return next.find((event) => event.id === eventId) || null;
}

export function resetEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(seedEvents));
  localStorage.setItem(SELECTED_EVENT_KEY, seedEvents[0].id);
  return seedEvents;
}
