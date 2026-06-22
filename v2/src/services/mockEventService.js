export const mockEvent = {
  id: 'demo-event-001',
  organizationId: 'gdsq-demo',
  venueId: 'club46',
  name: 'GDSQ Open Play — Saturday',
  venueName: 'Club46',
  courtCount: 4,
  status: 'live',
  startsAt: '2026-06-22T16:00:00+07:00',
  endsAt: '2026-06-22T18:00:00+07:00'
};

export const mockCourts = [
  { id: 'court-1', name: 'Court 1' },
  { id: 'court-2', name: 'Court 2' },
  { id: 'court-3', name: 'Court 3' },
  { id: 'court-4', name: 'Court 4' }
];

export async function getCurrentEvent() {
  await delay(120);
  return mockEvent;
}

export async function getCourts() {
  await delay(80);
  return mockCourts;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
