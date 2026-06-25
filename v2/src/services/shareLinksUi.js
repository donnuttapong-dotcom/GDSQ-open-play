// Share links and simple V1-style Join landing UI. Does not change match, score, stats, or queue logic.
const EVENTS_KEY = 'gdsq_v2_events';
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function eventTitle(event) {
  return event?.name || event?.name_th || event?.name_en || 'Untitled Event';
}

function eventStatus(event) {
  return String(event?.status || 'draft').toLowerCase();
}

function listEvents() {
  return safeParse(localStorage.getItem(EVENTS_KEY) || '[]', [])
    .filter((event) => event?.id)
    .sort((a, b) => String(eventStatus(a)).localeCompare(String(eventStatus(b))));
}

function currentEventId() {
  const params = new URLSearchParams(location.search);
  return params.get('event') || params.get('eventId') || params.get('id') || localStorage.getItem(SELECTED_EVENT_KEY) || '';
}

function linkFor(tab) {
  const eventId = currentEventId();
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'openplay.html');
  url.searchParams.set('tab', tab);
  if (eventId) url.searchParams.set('event', eventId);
  url.searchParams.set('v', 'v2-share-event-qr-join-01');
  return url.toString();
}

function qrSrc(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(value)}`;
}

function copyText(value, label) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(() => showShareMessage(`${label} copied`)).catch(() => fallbackCopy(value, label));
    return;
  }
  fallbackCopy(value, label);
}

function fallbackCopy(value, label) {
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
  showShareMessage(`${label} copied`);
}

function showShareMessage(text) {
  const msg = document.getElementById('msg');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 1800);
}

function openTabFromUrl() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (!tab) return;
  const button = document.querySelector(`[data-tab="${tab}"]`);
  if (button) setTimeout(() => button.click(), 250);
}

function goToEventTab(eventId, tab) {
  if (!eventId) return;
  localStorage.setItem(SELECTED_EVENT_KEY, eventId);
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'openplay.html');
  url.searchParams.set('event', eventId);
  url.searchParams.set('tab', tab);
  url.searchParams.set('v', 'v2-share-event-qr-join-01');
  location.href = url.toString();
}

function ensureJoinEventPicker() {
  if (document.getElementById('joinEventPickerBox')) return;
  const joinSection = document.getElementById('tab-join');
  const joinCard = joinSection?.querySelector('.card');
  const joinEventName = document.getElementById('joinEventName');
  if (!joinCard || !joinEventName) return;

  const box = document.createElement('div');
  box.id = 'joinEventPickerBox';
  box.className = 'soft p-3 mt-4 border-lime-300/20';
  box.innerHTML = `
    <label class="text-xs text-slate-400 font-black">เลือกอีเว้นท์ / Select Event
      <select id="joinEventPicker" class="w-full rounded-lg border p-3 mt-1"></select>
    </label>
    <p class="mini mt-2">สแกน QR แล้วระบบจะเลือกอีเว้นท์ให้ ถ้าต้องการเปลี่ยน เลือกจากช่องนี้ได้</p>
  `;
  joinEventName.insertAdjacentElement('afterend', box);
  document.getElementById('joinEventPicker')?.addEventListener('change', (event) => goToEventTab(event.target.value, 'join'));
}

function refreshJoinEventPicker() {
  ensureJoinEventPicker();
  const select = document.getElementById('joinEventPicker');
  if (!select) return;
  const events = listEvents();
  const selectedId = currentEventId();
  select.innerHTML = events.map((event) => {
    const status = eventStatus(event) === 'live' ? 'LIVE' : eventStatus(event).toUpperCase();
    return `<option value="${event.id}">[${status}] ${eventTitle(event)}</option>`;
  }).join('');
  if ([...select.options].some((option) => option.value === selectedId)) select.value = selectedId;
}

function ensureShareBox() {
  if (document.getElementById('eventShareBox')) return;
  const manageSection = document.getElementById('tab-manage');
  const firstCard = manageSection?.querySelector('.card');
  if (!firstCard) return;

  const box = document.createElement('div');
  box.id = 'eventShareBox';
  box.className = 'cut card p-4 border-lime-300/30';
  box.innerHTML = `
    <div class="flex flex-wrap justify-between items-start gap-3">
      <div>
        <h3 class="font-black lime">JOIN QR / SHARE EVENT</h3>
        <p class="mini">ส่ง QR หรือ Join Link ให้ผู้เล่นสแกน แล้วเข้าหน้า Join ของอีเว้นท์นี้ได้ทันที</p>
      </div>
      <span class="pill pill-live">QR</span>
    </div>
    <div class="grid lg:grid-cols-[240px_1fr] gap-4 mt-4 items-start">
      <div class="soft p-3 text-center">
        <img id="joinQrImage" alt="Join QR" class="mx-auto rounded-xl bg-white p-2 w-[220px] h-[220px]" />
        <p class="mini mt-2">Scan to Join / สแกนเพื่อเข้าร่วม</p>
      </div>
      <div class="grid gap-3">
        <label class="text-xs text-slate-400">Join Link / ลิงก์เข้าร่วม
          <div class="grid sm:grid-cols-[1fr_auto] gap-2 mt-1">
            <input id="joinShareLink" class="w-full rounded-lg border p-3 text-xs" readonly />
            <button id="copyJoinLinkBtn" class="cut bg-lime text-black px-4 py-3 font-black">COPY JOIN</button>
          </div>
        </label>
        <label class="text-xs text-slate-400">Event Link / ลิงก์อีเว้นท์
          <div class="grid sm:grid-cols-[1fr_auto] gap-2 mt-1">
            <input id="eventShareLink" class="w-full rounded-lg border p-3 text-xs" readonly />
            <button id="copyEventLinkBtn" class="cut btn bg-white/5 px-4 py-3">COPY EVENT</button>
          </div>
        </label>
        <label class="text-xs text-slate-400">Stats Link / ลิงก์สถิติ
          <div class="grid sm:grid-cols-[1fr_auto] gap-2 mt-1">
            <input id="quickStatsShareLink" class="w-full rounded-lg border p-3 text-xs" readonly />
            <button id="copyQuickStatsLinkBtn" class="cut btn bg-white/5 px-4 py-3">COPY STATS</button>
          </div>
        </label>
      </div>
    </div>
  `;
  firstCard.insertAdjacentElement('afterend', box);

  document.getElementById('copyJoinLinkBtn')?.addEventListener('click', () => copyText(linkFor('join'), 'Join link'));
  document.getElementById('copyEventLinkBtn')?.addEventListener('click', () => copyText(linkFor('events'), 'Event link'));
  document.getElementById('copyQuickStatsLinkBtn')?.addEventListener('click', () => copyText(linkFor('stats'), 'Stats link'));
}

function refreshShareLinks() {
  ensureShareBox();
  refreshJoinEventPicker();
  const joinLink = linkFor('join');
  const joinInput = document.getElementById('joinShareLink');
  const eventInput = document.getElementById('eventShareLink');
  const statsInput = document.getElementById('quickStatsShareLink');
  const qrImage = document.getElementById('joinQrImage');
  if (joinInput) joinInput.value = joinLink;
  if (eventInput) eventInput.value = linkFor('events');
  if (statsInput) statsInput.value = linkFor('stats');
  if (qrImage) qrImage.src = qrSrc(joinLink);
}

function bootShareLinksUi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    openTabFromUrl();
    refreshShareLinks();
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-tab], #eventSelect, [data-pick]')) setTimeout(refreshShareLinks, 250);
    });
    document.addEventListener('change', (event) => {
      if (event.target.closest('#eventSelect, #joinEventPicker')) setTimeout(refreshShareLinks, 250);
    });
    setTimeout(refreshShareLinks, 800);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

bootShareLinksUi();
