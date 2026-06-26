// Language toggle and emergency organizer unlock. No score/stat calculation changes.
const LANG_KEY = 'gdsq_v2_ui_lang';
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';
const PLAYER_STATS_KEY_PREFIX = 'gdsq_v2_player_stats:';

function currentLang() {
  return localStorage.getItem(LANG_KEY) || 'th';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang === 'en' ? 'en' : 'th');
}

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function text(id, th, en) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = currentLang() === 'en' ? en : th;
  if (el.textContent !== next) el.textContent = next;
}

function ph(id, th, en) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = currentLang() === 'en' ? en : th;
  if (el.placeholder !== next) el.placeholder = next;
}

function replaceTextVariants(selector, variants, th, en) {
  const wanted = currentLang() === 'en' ? en : th;
  document.querySelectorAll(selector).forEach((el) => {
    const value = el.textContent.trim();
    if (variants.includes(value) && value !== wanted) el.textContent = wanted;
  });
}

function forceReleasePlayingStats() {
  const eventId = localStorage.getItem(SELECTED_EVENT_KEY);
  if (!eventId) return;
  const key = `${PLAYER_STATS_KEY_PREFIX}${eventId}`;
  const stats = safeParse(localStorage.getItem(key) || '{}', {});
  let changed = false;
  const now = new Date().toISOString();
  Object.values(stats).forEach((record) => {
    if (record && record.status === 'playing') {
      record.status = 'ready';
      record.queueJoinedAt = now;
      changed = true;
    }
  });
  if (changed) localStorage.setItem(key, JSON.stringify(stats));
}

function unlockOrganizerPlayerButtons() {
  forceReleasePlayingStats();
  const panel = document.getElementById('managePlayers');
  if (!panel) return;
  panel.querySelectorAll('button[data-player][disabled], button[data-remove-player][disabled]').forEach((button) => {
    button.removeAttribute('disabled');
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
  });
  panel.querySelectorAll('.pill-auto').forEach((badge) => {
    badge.classList.remove('pill-auto');
    badge.classList.add('pill-ready');
    badge.textContent = currentLang() === 'en' ? 'READY' : 'พร้อม';
  });
}

function ensureLangToggle() {
  if (document.getElementById('gdsqLangToggle')) return;
  const button = document.createElement('button');
  button.id = 'gdsqLangToggle';
  button.type = 'button';
  button.style.cssText = [
    'position:fixed',
    'right:0px',
    'top:10px',
    'z-index:9999',
    'border:1px solid rgba(255,255,255,.22)',
    'border-right:0',
    'background:#c7ff2e',
    'color:#10151b',
    'font-weight:1000',
    'font-size:12px',
    'border-radius:999px 0 0 999px',
    'padding:10px 14px',
    'box-shadow:0 12px 30px rgba(0,0,0,.35)'
  ].join(';');
  button.addEventListener('click', () => {
    setLang(currentLang() === 'en' ? 'th' : 'en');
    applyBilingualUiLabels();
  });
  document.body.appendChild(button);
}

function updateToggleText() {
  const button = document.getElementById('gdsqLangToggle');
  if (!button) return;
  button.textContent = currentLang() === 'en' ? 'ENG / TH' : 'TH / ENG';
  button.title = currentLang() === 'en' ? 'Switch to Thai' : 'Switch to English';
}

function translateButtons() {
  const items = [
    { th: 'รีเฟรช', en: 'Refresh', variants: ['รีเฟรช', 'Refresh', 'Refresh / รีเฟรช', 'รีเฟรช / REFRESH'] },
    { th: 'เข้าร่วม', en: 'Join', variants: ['เข้าร่วม', 'Join', 'Join / เข้าร่วม'] },
    { th: 'จัดการ', en: 'Manage', variants: ['จัดการ', 'Manage', 'Manage / จัดการ'] },
    { th: 'ลบ', en: 'Delete', variants: ['ลบ', 'Delete', 'Delete / ลบ'] },
    { th: 'ปิด', en: 'Close', variants: ['ปิด', 'Close', 'Close / ปิด'] },
    { th: 'สร้างอีเว้นท์', en: 'Create Event', variants: ['สร้างอีเว้นท์ / CREATE EVENT', 'Create Event / สร้างอีเว้นท์', 'สร้างอีเว้นท์', 'Create Event'] },
    { th: 'บันทึกเข้าคิว', en: 'Save Ready', variants: ['บันทึกและเข้าคิว / SAVE READY', 'Save Ready / บันทึกเข้าคิว', 'บันทึกเข้าคิว', 'Save Ready'] },
    { th: 'จบอีเว้นท์', en: 'End Event', variants: ['จบอีเว้นท์', 'End Event', 'End Event / จบอีเว้นท์'] },
    { th: 'ตั้งเป็น LIVE', en: 'Set LIVE', variants: ['ตั้งเป็น LIVE', 'Set LIVE', 'Set LIVE / ตั้งเป็น LIVE'] },
    { th: 'ตั้งเป็น DRAFT', en: 'Set DRAFT', variants: ['ตั้งเป็น DRAFT', 'Set DRAFT', 'Set DRAFT / ตั้งเป็น DRAFT'] },
    { th: 'พรีวิวอัตโนมัติ', en: 'Auto Match Preview', variants: ['สร้างพรีวิวอัตโนมัติ', 'Auto Match Preview', 'Auto Match Preview / พรีวิวอัตโนมัติ'] },
    { th: 'เริ่มทุกพรีวิว', en: 'Start All', variants: ['เริ่มทุกพรีวิว', 'Start All', 'Start All / เริ่มทุกพรีวิว'] },
    { th: 'ล้างพรีวิว', en: 'Clear Preview', variants: ['ล้างพรีวิว', 'Clear Preview', 'Clear Preview / ล้างพรีวิว'] },
    { th: 'พรีวิว Manual', en: 'Manual Preview', variants: ['สร้างพรีวิว Manual', 'Manual Preview', 'Manual Preview / พรีวิว Manual'] },
    { th: 'ล้างรายชื่อ', en: 'Clear Players', variants: ['ล้างรายชื่อ', 'Clear Players', 'Clear Players / ล้างรายชื่อ'] },
    { th: 'เพิ่ม', en: 'Add', variants: ['ADD', 'เพิ่ม', 'Add', 'Add / เพิ่ม'] },
    { th: 'เริ่ม', en: 'Start', variants: ['START', 'Start', 'เริ่ม'] },
    { th: 'ยกเลิก', en: 'Cancel', variants: ['CANCEL', 'Cancel', 'ยกเลิก'] },
    { th: 'ยืนยันคะแนน', en: 'Confirm', variants: ['CONFIRM', 'Confirm', 'ยืนยันคะแนน'] },
    { th: 'พร้อม', en: 'Ready', variants: ['READY', 'Ready', 'พร้อม'] },
    { th: 'พัก', en: 'Rest', variants: ['REST', 'Rest', 'พัก'] },
    { th: 'ออก', en: 'Left', variants: ['LEFT', 'Left', 'ออก'] },
    { th: 'คัดลอกลิงก์สถิติ', en: 'Copy Stats Link', variants: ['COPY STATS LINK', 'Copy Stats Link', 'Copy Stats Link / คัดลอกลิงก์สถิติ', 'คัดลอกลิงก์สถิติ'] },
    { th: 'คัดลอกแล้ว', en: 'Copied', variants: ['COPIED', 'Copied', 'คัดลอกแล้ว'] }
  ];
  document.querySelectorAll('button').forEach((button) => {
    const value = button.textContent.trim();
    const item = items.find((entry) => entry.variants.includes(value));
    if (!item) return;
    const next = currentLang() === 'en' ? item.en : item.th;
    if (button.textContent !== next) button.textContent = next;
  });
}

function translateHeadings() {
  replaceTextVariants('h1', ['Events', 'Events / อีเว้นท์', 'อีเว้นท์'], 'อีเว้นท์', 'Events');
  replaceTextVariants('h2', ['CREATE NEW EVENT', 'Create New Event / สร้างอีเว้นท์ใหม่', 'สร้างอีเว้นท์ใหม่'], 'สร้างอีเว้นท์ใหม่', 'Create New Event');
  replaceTextVariants('h2', ['Join Open Play', 'Join Open Play / เข้าร่วมเล่น', 'เข้าร่วมเล่น'], 'เข้าร่วมเล่น', 'Join Open Play');
  replaceTextVariants('h2', ['Organizer', 'Organizer / ผู้จัด', 'ผู้จัด'], 'ผู้จัด', 'Organizer');
  replaceTextVariants('h2', ['Ranking / สถิติ', 'Stats / สถิติ', 'สถิติ'], 'สถิติ', 'Stats');
  replaceTextVariants('h3', ['Players', 'Players / ผู้เล่น', 'ผู้เล่น'], 'ผู้เล่น', 'Players');
  replaceTextVariants('h3', ['AUTO MATCH CONTROL', 'Auto Match Control / จัดแมตช์อัตโนมัติ', 'จัดแมตช์อัตโนมัติ'], 'จัดแมตช์อัตโนมัติ', 'Auto Match Control');
  replaceTextVariants('h3', ['MANUAL PICK', 'Manual Pick / เลือกผู้เล่นเอง', 'เลือกผู้เล่นเอง'], 'เลือกผู้เล่นเอง', 'Manual Pick');
  replaceTextVariants('h3', ['PLAYER QUEUE', 'Player Queue / คิวผู้เล่น', 'คิวผู้เล่น'], 'คิวผู้เล่น', 'Player Queue');
  replaceTextVariants('h3', ['MATCH PREVIEW', 'Match Preview / พรีวิวแมตช์', 'พรีวิวแมตช์'], 'พรีวิวแมตช์', 'Match Preview');
  replaceTextVariants('h3', ['LIVE COURTS', 'Live Courts / คอร์ทที่กำลังเล่น', 'คอร์ทที่กำลังเล่น'], 'คอร์ทที่กำลังเล่น', 'Live Courts');
  replaceTextVariants('h3', ['ตารางสถิติผู้เล่น', 'Player Statistics Table / ตารางสถิติผู้เล่น', 'Player Statistics Table'], 'ตารางสถิติผู้เล่น', 'Player Statistics Table');
  replaceTextVariants('h3', ['ประวัติการแข่งขัน / MATCH HISTORY', 'Match History / ประวัติการแข่งขัน', 'ประวัติการแข่งขัน'], 'ประวัติการแข่งขัน', 'Match History');
  replaceTextVariants('h3', ['คะแนนสูงสุด', 'Top Score / คะแนนสูงสุด', 'Top Score'], 'คะแนนสูงสุด', 'Top Score');
  replaceTextVariants('h3', ['เล่นมากสุด', 'Most Played / เล่นมากสุด', 'Most Played'], 'เล่นมากสุด', 'Most Played');
  replaceTextVariants('h3', ['แต้มต่างดีที่สุด', 'Best Diff / แต้มต่างดีที่สุด', 'Best Diff'], 'แต้มต่างดีที่สุด', 'Best Diff');
}

let applyingLabels = false;

export function applyBilingualUiLabels() {
  if (applyingLabels) return;
  applyingLabels = true;
  try {
    ensureLangToggle();
    updateToggleText();
    text('tabBtn-events', 'อีเว้นท์', 'Events');
    text('tabBtn-join', 'เข้าร่วม', 'Join');
    text('tabBtn-manage', 'ผู้จัด', 'Organizer');
    text('tabBtn-stats', 'สถิติ', 'Stats');

    ph('newEventName', 'ชื่องาน', 'Event name');
    ph('newEventVenue', 'สถานที่', 'Venue');
    ph('joinName', 'ชื่อเล่น', 'Nickname');
    ph('manageNewPlayerName', 'เพิ่มผู้เล่น', 'Add player');

    unlockOrganizerPlayerButtons();
    translateButtons();
    translateHeadings();
  } finally {
    applyingLabels = false;
  }
}

let applyTimer = null;
function scheduleApplyBilingualUiLabels() {
  if (applyTimer || applyingLabels) return;
  applyTimer = setTimeout(() => {
    applyTimer = null;
    requestAnimationFrame(applyBilingualUiLabels);
  }, 420);
}

function shouldReactToMutations(mutations) {
  if (applyingLabels) return false;
  return mutations.some((mutation) => {
    if (!mutation.addedNodes.length && !mutation.removedNodes.length) return false;
    const target = mutation.target;
    return target?.id === 'eventList' || target?.id === 'managePlayers' || target?.id === 'matchPanels' || target?.id === 'joinPlayers' || target?.id === 'tab-stats' || target?.closest?.('#eventList,#managePlayers,#matchPanels,#joinPlayers,#tab-stats');
  });
}

function bootBilingualUi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => {
    applyBilingualUiLabels();
    const root = document.querySelector('main') || document.body;
    if (!root || !window.MutationObserver) return;
    const observer = new MutationObserver((mutations) => {
      if (shouldReactToMutations(mutations)) scheduleApplyBilingualUiLabels();
    });
    observer.observe(root, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

bootBilingualUi();
