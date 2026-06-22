import { getSelectedEvent } from './localEventStore.js';

export async function getCurrentEvent() {
  await delay(120);
  return getSelectedEvent();
}

export async function getCourts() {
  await delay(80);
  const event = getSelectedEvent();
  const count = Number(event?.courtCount || 1);
  return Array.from({ length: count }, (_, index) => ({
    id: `court-${index + 1}`,
    name: `Court ${index + 1}`
  }));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
