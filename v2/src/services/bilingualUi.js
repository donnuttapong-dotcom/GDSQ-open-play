// Bilingual UI labels only. This file must not change data, player status, score, court, or matchmaking logic.
const LANG_KEY = 'gdsq_v2_ui_lang';

function currentLang() {
  return localStorage.getItem(LANG_KEY) || 'th';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang === 'en' ? 'en' : 'th');
}

function pick(th, en) {
  return currentLang() === 'en' ? en : th;
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.textContent.trim() !== next) el.textContent = next;
}

function setPlaceholder(id, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.placeholder !== next) el.placeholder = next;
}

function setTitle(id, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.title !== next) el.title = next;
}

const LABELS = {
  th: new Map([
    ['Events', 'อีเว้นท์'],
    ['Join', 'เข้าร่วม'],
    ['Manage', 'ผู้จัด'],
    ['Organizer', 'ผู้จัด'],
    ['Stats', 'สถิติ'],
    ['Create New Event', 'สร้างอีเว้นท์ใหม่'],
    ['CREATE NEW EVENT', 'สร้างอีเว้นท์ใหม่'],
    ['Join Open Play', 'เข้าร่วมเล่น'],
    ['Players', 'ผู้เล่น'],
    ['Player Queue', 'คิวผู้เล่น'],
    ['PLAYER QUEUE', 'คิวผู้เล่น'],
    ['Auto Match Control', 'จัดแมตช์อัตโนมัติ'],
    ['AUTO MATCH CONTROL', 'จัดแมตช์อัตโนมัติ'],
    ['Manual Pick', 'เลือกผู้เล่นเอง'],
    ['MANUAL PICK', 'เลือกผู้เล่นเอง'],
    ['Match Preview', 'พรีวิวแมตช์'],
    ['MATCH PREVIEW', 'พรีวิวแมตช์'],
    ['Live Courts', 'คอร์ทที่กำลังเล่น'],
    ['LIVE COURTS', 'คอร์ทที่กำลังเล่น'],
    ['Player Statistics Table', 'ตารางสถิติผู้เล่น'],
    ['Match History', 'ประวัติการแข่งขัน'],
    ['MATCH HISTORY', 'ประวัติการแข่งขัน'],
    ['Top Score', 'คะแนนสูงสุด'],
    ['Most Played', 'เล่นมากสุด'],
    ['Best Diff', 'แต้มต่างดีที่สุด'],
    ['Current Match', 'แมตช์ปัจจุบัน'],
    ['CURRENT MATCH', 'แมตช์ปัจจุบัน'],
    ['Player Stats', 'สถิติผู้เล่น'],
    ['PLAYER STATS', 'สถิติผู้เล่น'],
    ['PLAYER STATS POPUP', 'หน้าต่างสถิติผู้เล่น'],
    ['V2 Status', 'สถานะ V2'],
    ['Which mode should I use?', 'ใช้โหมดไหนดี?'],

    ['Refresh', 'รีเฟรช'],
    ['Create Event', 'สร้างอีเว้นท์'],
    ['Save Ready', 'บันทึกเข้าคิว'],
    ['End Event', 'จบอีเว้นท์'],
    ['Set LIVE', 'ตั้งเป็น LIVE'],
    ['Set DRAFT', 'ตั้งเป็น DRAFT'],
    ['Auto Match Preview', 'พรีวิวอัตโนมัติ'],
    ['Start All', 'เริ่มทุกพรีวิว'],
    ['Clear Preview', 'ล้างพรีวิว'],
    ['Manual Preview', 'พรีวิว Manual'],
    ['Clear Players', 'ล้างรายชื่อ'],
    ['Add', 'เพิ่ม'],
    ['Delete', 'ลบ'],
    ['Close', 'ปิด'],
    ['Start', 'เริ่ม'],
    ['START', 'เริ่ม'],
    ['Cancel', 'ยกเลิก'],
    ['CANCEL', 'ยกเลิก'],
    ['Confirm', 'ยืนยันคะแนน'],
    ['CONFIRM', 'ยืนยันคะแนน'],
    ['COPY MY LINK', 'คัดลอกลิงก์ของฉัน'],
    ['Copy My Link', 'คัดลอกลิงก์ของฉัน'],
    ['COPIED', 'คัดลอกแล้ว'],
    ['Copied', 'คัดลอกแล้ว'],
    ['Open Open Play', 'เปิด Open Play'],
    ['Enter Open Play', 'เข้า Open Play'],
    ['Enter Tournament', 'เข้า Tournament'],
    ['Enter Team Battle', 'เข้า Team Battle'],

    ['READY', 'พร้อม'],
    ['Ready', 'พร้อม'],
    ['REST', 'พัก'],
    ['Rest', 'พัก'],
    ['LEFT', 'ออก'],
    ['Left', 'ออก'],
    ['PLAYING', 'กำลังเล่น'],
    ['Playing', 'กำลังเล่น'],
    ['PREVIEW', 'พรีวิว'],
    ['Preview', 'พรีวิว'],
    ['ENDED', 'จบแล้ว'],
    ['Ended', 'จบแล้ว'],
    ['AUTO REST', 'พักอัตโนมัติ'],
    ['Auto Rest', 'พักอัตโนมัติ'],
    ['WIN', 'ชนะ'],
    ['Win', 'ชนะ'],
    ['LOSE', 'แพ้'],
    ['Lose', 'แพ้'],

    ['Player', 'ผู้เล่น'],
    ['Score', 'คะแนน'],
    ['Win%', 'ชนะ%'],
    ['W', 'ชนะ'],
    ['L', 'แพ้'],
    ['W/L', 'ชนะ/แพ้'],
    ['PF', 'แต้มได้'],
    ['PA', 'แต้มเสีย'],
    ['Diff', 'แต้มต่าง'],
    ['Games', 'เกม'],
    ['Played', 'เล่นแล้ว'],
    ['Level', 'เลเวล'],
    ['Queue', 'คิว'],
    ['Rank', 'อันดับ'],
    ['Court', 'คอร์ท'],
    ['Team A', 'ทีม A'],
    ['TEAM A', 'ทีม A'],
    ['Team B', 'ทีม B'],
    ['TEAM B', 'ทีม B'],
    ['Result', 'ผล'],
    ['Mode', 'โหมด'],
    ['Balance Analysis', 'วิเคราะห์ความสมดุล'],
    ['BALANCED', 'สมดุล'],
    ['ACCEPTABLE', 'พอใช้ได้'],
    ['NEED REBALANCE', 'ควรจัดใหม่'],
    ['No events', 'ยังไม่มีอีเว้นท์'],
    ['No players', 'ยังไม่มีผู้เล่น'],
    ['No players yet', 'ยังไม่มีผู้เล่น'],
    ['No live courts', 'ยังไม่มีคอร์ทที่กำลังเล่น'],
    ['No data', 'ยังไม่มีข้อมูล'],
    ['N/A', 'ไม่มีข้อมูล']
  ]),
  en: new Map([
    ['อีเว้นท์', 'Events'],
    ['เข้าร่วม', 'Join'],
    ['จัดการ', 'Manage'],
    ['ผู้จัด', 'Organizer'],
    ['สถิติ', 'Stats'],
    ['สร้างอีเว้นท์ใหม่', 'Create New Event'],
    ['เข้าร่วมเล่น', 'Join Open Play'],
    ['ผู้เล่น', 'Players'],
    ['คิวผู้เล่น', 'Player Queue'],
    ['จัดแมตช์อัตโนมัติ', 'Auto Match Control'],
    ['เลือกผู้เล่นเอง', 'Manual Pick'],
    ['พรีวิวแมตช์', 'Match Preview'],
    ['คอร์ทที่กำลังเล่น', 'Live Courts'],
    ['ตารางสถิติผู้เล่น', 'Player Statistics Table'],
    ['ประวัติการแข่งขัน', 'Match History'],
    ['คะแนนสูงสุด', 'Top Score'],
    ['เล่นมากสุด', 'Most Played'],
    ['แต้มต่างดีที่สุด', 'Best Diff'],
    ['แมตช์ปัจจุบัน', 'Current Match'],
    ['สถิติผู้เล่น', 'Player Stats'],
    ['หน้าต่างสถิติผู้เล่น', 'Player Stats Popup'],
    ['สถานะ V2', 'V2 Status'],
    ['ใช้โหมดไหนดี?', 'Which mode should I use?'],

    ['รีเฟรช', 'Refresh'],
    ['สร้างอีเว้นท์', 'Create Event'],
    ['บันทึกเข้าคิว', 'Save Ready'],
    ['จบอีเว้นท์', 'End Event'],
    ['ตั้งเป็น LIVE', 'Set LIVE'],
    ['ตั้งเป็น DRAFT', 'Set DRAFT'],
    ['พรีวิวอัตโนมัติ', 'Auto Match Preview'],
    ['เริ่มทุกพรีวิว', 'Start All'],
    ['ล้างพรีวิว', 'Clear Preview'],
    ['พรีวิว Manual', 'Manual Preview'],
    ['ล้างรายชื่อ', 'Clear Players'],
    ['เพิ่ม', 'Add'],
    ['ลบ', 'Delete'],
    ['ปิด', 'Close'],
    ['เริ่ม', 'Start'],
    ['ยกเลิก', 'Cancel'],
    ['ยืนยันคะแนน', 'Confirm'],
    ['คัดลอกลิงก์ของฉัน', 'Copy My Link'],
    ['คัดลอกแล้ว', 'Copied'],
    ['เปิด Open Play', 'Open Open Play'],
    ['เข้า Open Play', 'Enter Open Play'],
    ['เข้า Tournament', 'Enter Tournament'],
    ['เข้า Team Battle', 'Enter Team Battle'],

    ['พร้อม', 'Ready'],
    ['พัก', 'Rest'],
    ['ออก', 'Left'],
    ['กำลังเล่น', 'Playing'],
    ['พรีวิว', 'Preview'],
    ['จบแล้ว', 'Ended'],
    ['พักอัตโนมัติ', 'Auto Rest'],
    ['ชนะ', 'Win'],
    ['แพ้', 'Lose'],

    ['คะแนน', 'Score'],
    ['ชนะ%', 'Win%'],
    ['ชนะ/แพ้', 'W/L'],
    ['แต้มได้', 'PF'],
    ['แต้มเสีย', 'PA'],
    ['แต้มต่าง', 'Diff'],
    ['เกม', 'Games'],
    ['เล่นแล้ว', 'Played'],
    ['เลเวล', 'Level'],
    ['คิว', 'Queue'],
    ['อันดับ', 'Rank'],
    ['คอร์ท', 'Court'],
    ['ทีม A', 'Team A'],
    ['ทีม B', 'Team B'],
    ['ผล', 'Result'],
    ['โหมด', 'Mode'],
    ['วิเคราะห์ความสมดุล', 'Balance Analysis'],
    ['สมดุล', 'BALANCED'],
    ['พอใช้ได้', 'ACCEPTABLE'],
    ['ควรจัดใหม่', 'NEED REBALANCE'],
    ['ยังไม่มีอีเว้นท์', 'No events'],
    ['ยังไม่มีผู้เล่น', 'No players'],
    ['ยังไม่มีคอร์ทที่กำลังเล่น', 'No live courts'],
    ['ยังไม่มีข้อมูล', 'No data'],
    ['ไม่มีข้อมูล', 'N/A']
  ])
};

const MIXED_LABELS = new Map([
  ['รีเฟรช / REFRESH', ['รีเฟรช', 'Refresh']],
  ['สร้างอีเว้นท์ / CREATE EVENT', ['สร้างอีเว้นท์', 'Create Event']],
  ['บันทึกและเข้าคิว / SAVE READY', ['บันทึกเข้าคิว', 'Save Ready']],
  ['Events / อีเว้นท์', ['อีเว้นท์', 'Events']],
  ['Organizer / ผู้จัด', ['ผู้จัด', 'Organizer']],
  ['Stats / สถิติ', ['สถิติ', 'Stats']],
  ['Ranking / สถิติ', ['สถิติ', 'Stats']],
  ['Players / ผู้เล่น', ['ผู้เล่น', 'Players']],
  ['Auto Match Control / จัดแมตช์อัตโนมัติ', ['จัดแมตช์อัตโนมัติ', 'Auto Match Control']],
  ['Manual Pick / เลือกผู้เล่นเอง', ['เลือกผู้เล่นเอง', 'Manual Pick']],
  ['Match Preview / พรีวิวแมตช์', ['พรีวิวแมตช์', 'Match Preview']],
  ['Live Courts / คอร์ทที่กำลังเล่น', ['คอร์ทที่กำลังเล่น', 'Live Courts']],
  ['Match History / ประวัติการแข่งขัน', ['ประวัติการแข่งขัน', 'Match History']],
  ['Live / เปิดเลย', ['Live / เปิดเลย', 'Live / Open now']],
  ['Draft / ยังไม่เปิด', ['Draft / ยังไม่เปิด', 'Draft / Not open yet']]
]);

function mapForCurrentLang() {
  return currentLang() === 'en' ? LABELS.en : LABELS.th;
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function translatePlainTextElement(el) {
  if (!el || el.id === 'gdsqLangToggle') return;
  if (el.childElementCount > 0) return;
  const value = normalize(el.textContent);
  if (!value) return;

  const mixed = MIXED_LABELS.get(value);
  if (mixed) {
    const next = currentLang() === 'en' ? mixed[1] : mixed[0];
    if (el.textContent !== next) el.textContent = next;
    return;
  }

  const next = mapForCurrentLang().get(value);
  if (next && el.textContent !== next) el.textContent = next;
}

function translateButtonsHeadingsTables() {
  document.querySelectorAll('button, h1, h2, h3, h4, label, th, option, span.pill, a.cut').forEach(translatePlainTextElement);
}

function translatePlaceholders() {
  setPlaceholder('newEventName', 'ชื่องาน', 'Event name');
  setPlaceholder('newEventVenue', 'สถานที่', 'Venue');
  setPlaceholder('joinName', 'ชื่อเล่น', 'Nickname');
  setPlaceholder('manageNewPlayerName', 'เพิ่มผู้เล่น', 'Add player');
  setTitle('joinBack', 'กลับไปหน้า Join', 'Back to Join');
  setTitle('copyMyLinkBtn', 'คัดลอกลิงก์ของฉัน', 'Copy my player link');
  setTitle('refreshBtn', 'รีเฟรชข้อมูล', 'Refresh data');
}

function translateKnownIds() {
  setText('tabBtn-events', 'อีเว้นท์', 'Events');
  setText('tabBtn-join', 'เข้าร่วม', 'Join');
  setText('tabBtn-manage', 'ผู้จัด', 'Organizer');
  setText('tabBtn-stats', 'สถิติ', 'Stats');
  setText('copyMyLinkBtn', 'คัดลอกลิงก์ของฉัน', 'Copy My Link');
  setText('refreshBtn', 'รีเฟรช', 'Refresh');
  setText('closeStatsModal', 'ปิด', 'Close');
  setText('closePlayerModal', 'ปิด', 'Close');
}

function translateStatusOptionsOnly() {
  const status = byId('newEventStatus');
  if (!status) return;
  [...status.options].forEach((option) => {
    if (option.value === 'live') option.textContent = pick('Live / เปิดเลย', 'Live / Open now');
    if (option.value === 'draft') option.textContent = pick('Draft / ยังไม่เปิด', 'Draft / Not open yet');
  });
}

function ensureLangToggle() {
  if (byId('gdsqLangToggle')) return;
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
  const button = byId('gdsqLangToggle');
  if (!button) return;
  button.textContent = currentLang() === 'en' ? 'ENG / TH' : 'TH / ENG';
  button.title = currentLang() === 'en' ? 'Switch to Thai' : 'Switch to English';
  document.documentElement.lang = currentLang() === 'en' ? 'en' : 'th';
}

let applyingLabels = false;
export function applyBilingualUiLabels() {
  if (applyingLabels) return;
  applyingLabels = true;
  try {
    ensureLangToggle();
    updateToggleText();
    translateKnownIds();
    translatePlaceholders();
    translateStatusOptionsOnly();
    translateButtonsHeadingsTables();
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
  }, 350);
}

function shouldReactToMutations(mutations) {
  if (applyingLabels) return false;
  return mutations.some((mutation) => {
    if (!mutation.addedNodes.length && !mutation.removedNodes.length) return false;
    const target = mutation.target;
    return target?.id === 'eventList' ||
      target?.id === 'managePlayers' ||
      target?.id === 'matchPanels' ||
      target?.id === 'joinPlayers' ||
      target?.id === 'tab-stats' ||
      target?.closest?.('#eventList,#managePlayers,#matchPanels,#joinPlayers,#tab-stats');
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
