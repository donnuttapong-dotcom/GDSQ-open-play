// Standalone Join page routing only. Does not change match, score, stats, event, or queue logic.
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

function currentEventId() {
  const params = new URLSearchParams(location.search);
  return params.get('event') || params.get('eventId') || params.get('id') || localStorage.getItem(SELECTED_EVENT_KEY) || '';
}

function standaloneJoinUrl() {
  const eventId = currentEventId();
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'join.html');
  if (eventId) url.searchParams.set('event', eventId);
  url.searchParams.set('v', 'v2-join-standalone-only-01');
  return url.toString();
}

function removeOrganizerShareBox() {
  document.getElementById('eventShareBox')?.remove();
}

function redirectLegacyJoinLink() {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') !== 'join' || location.pathname.endsWith('/join.html')) return;
  location.replace(standaloneJoinUrl());
}

function bootShareLinksUi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    removeOrganizerShareBox();
    redirectLegacyJoinLink();
    const observer = new MutationObserver(removeOrganizerShareBox);
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

bootShareLinksUi();
