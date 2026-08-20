export function chooseCurrentOrganizerEvent(events = [], { explicitEventId = '', selectedEventId = '' } = {}) {
  const byId = (id) => id ? events.find((event) => String(event.id) === String(id)) : null;
  const explicit = byId(explicitEventId);
  const live = events.find((event) => ['live', 'open', 'active'].includes(String(event.status || '').toLowerCase()));
  return explicit || live || byId(selectedEventId) || events[0] || null;
}
