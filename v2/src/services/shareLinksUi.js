// Share links UI only. Does not change event, player, match, score, or stats logic.
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';

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
  url.searchParams.set('v', 'v2-share-event-link-01');
  return url.toString();
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
        <h3 class="font-black lime">SHARE EVENT / JOIN LINK</h3>
        <p class="mini">ส่งลิงก์ให้ผู้เล่นเข้าหน้า Join ของอีเว้นท์นี้ได้ทันที</p>
      </div>
      <span class="pill pill-live">SHARE</span>
    </div>
    <div class="grid gap-3 mt-3">
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
  `;
  firstCard.insertAdjacentElement('afterend', box);

  document.getElementById('copyJoinLinkBtn')?.addEventListener('click', () => copyText(linkFor('join'), 'Join link'));
  document.getElementById('copyEventLinkBtn')?.addEventListener('click', () => copyText(linkFor('events'), 'Event link'));
  document.getElementById('copyQuickStatsLinkBtn')?.addEventListener('click', () => copyText(linkFor('stats'), 'Stats link'));
}

function refreshShareLinks() {
  ensureShareBox();
  const joinInput = document.getElementById('joinShareLink');
  const eventInput = document.getElementById('eventShareLink');
  const statsInput = document.getElementById('quickStatsShareLink');
  if (joinInput) joinInput.value = linkFor('join');
  if (eventInput) eventInput.value = linkFor('events');
  if (statsInput) statsInput.value = linkFor('stats');
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
      if (event.target.closest('#eventSelect')) setTimeout(refreshShareLinks, 250);
    });
    setTimeout(refreshShareLinks, 800);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

bootShareLinksUi();
