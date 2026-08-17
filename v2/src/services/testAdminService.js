const SESSION_PREFIX = 'gdsq_v2_test_admin_session:';

function key(eventId) { return `${SESSION_PREFIX}${String(eventId || '')}`; }

export function isTestEnvironment(event) {
  return String(event?.environment || event?.eventEnvironment || 'live') === 'test';
}

export function getTestAdminSession(eventId) {
  return localStorage.getItem(key(eventId)) || '';
}

export function clearTestAdminSession(eventId) {
  localStorage.removeItem(key(eventId));
}

export function knownTestEventIds() {
  return Object.keys(localStorage)
    .filter((item) => item.startsWith(SESSION_PREFIX))
    .map((item) => item.slice(SESSION_PREFIX.length))
    .filter(Boolean);
}

export async function invokeTestAdmin(supabase, action, payload = {}) {
  const eventId = payload.eventId || payload.event_id || '';
  const body = { action, ...payload };
  if (!['createEvent', 'authorize'].includes(action)) body.capability = getTestAdminSession(eventId);
  const { data, error } = await supabase.functions.invoke('v2-test-admin', { body });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Test Admin request failed');
  if (data.capability && data.event?.id) localStorage.setItem(key(data.event.id), data.capability);
  if (action === 'exit' && eventId) clearTestAdminSession(eventId);
  return data;
}

export async function createTestEvent(supabase, payload) {
  return invokeTestAdmin(supabase, 'createEvent', payload);
}

export async function authorizeTestAdmin(supabase, eventId, passcode) {
  return invokeTestAdmin(supabase, 'authorize', { eventId, passcode });
}

export async function exitTestAdmin(supabase, eventId) {
  return invokeTestAdmin(supabase, 'exit', { eventId });
}
