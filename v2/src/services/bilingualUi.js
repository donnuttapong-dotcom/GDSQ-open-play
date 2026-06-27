// Bilingual UI labels only. No matchmaking, score, player, court, or data logic changes.
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

function text(id, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.textContent !== next) el.textContent = next;
}

function ph(id, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.placeholder !== next) el.placeholder = next;
}

function attr(id, name, th, en) {
  const el = byId(id);
  if (!el) return;
  const next = pick(th, en);
  if (el.getAttribute(name) !== next) el.setAttribute(name, next);
}

const EN_TO_TH = {
  'Events': 'อีเว้นท์',
  'Join': 'เข้าร่วม',
  'Manage': 'ผู้จัด',
  'Organizer': 'ผู้จัด',
  'Stats': 'สถิติ',
  'Ranking': 'อันดับ',
  'Ranking / Stats': 'อันดับ / สถิติ',
  'Create New Event': 'สร้างอีเว้นท์ใหม่',
  'CREATE NEW EVENT': 'สร้างอีเว้นท์ใหม่',
  'Join Open Play': 'เข้าร่วมเล่น',
  'Players': 'ผู้เล่น',
  'Player': 'ผู้เล่น',
  'Player Queue': 'คิวผู้เล่น',
  'PLAYER QUEUE': 'คิวผู้เล่น',
  'Auto Match Control': 'จัดแมตช์อัตโนมัติ',
  'AUTO MATCH CONTROL': 'จัดแมตช์อัตโนมัติ',
  'Manual Pick': 'เลือกผู้เล่นเอง',
  'MANUAL PICK': 'เลือกผู้เล่นเอง',
  'Match Preview': 'พรีวิวแมตช์',
  'MATCH PREVIEW': 'พรีวิวแมตช์',
  'Live Courts': 'คอร์ทที่กำลังเล่น',
  'LIVE COURTS': 'คอร์ทที่กำลังเล่น',
  'Current Match': 'แมตช์ปัจจุบัน',
  'CURRENT MATCH': 'แมตช์ปัจจุบัน',
  'Player Stats': 'สถิติผู้เล่น',
  'PLAYER STATS': 'สถิติผู้เล่น',
  'Player Stats Popup': 'หน้าต่างสถิติผู้เล่น',
  'PLAYER STATS POPUP': 'หน้าต่างสถิติผู้เล่น',
  'Player Statistics Table': 'ตารางสถิติผู้เล่น',
  'Match History': 'ประวัติการแข่งขัน',
  'MATCH HISTORY': 'ประวัติการแข่งขัน',
  'Top Score': 'คะแนนสูงสุด',
  'Most Played': 'เล่นมากสุด',
  'Best Diff': 'แต้มต่างดีที่สุด',
  'V2 Status': 'สถานะ V2',
  'Which mode should I use?': 'ใช้โหมดไหนดี?',
  'Use System Mode': 'เลือกโหมดการใช้งาน',
  'Choose Your Play Mode': 'เลือกโหมดการเล่นของคุณ',
  'Open Play': 'Open Play',
  'Tournament': 'Tournament',
  'Team Battle': 'Team Battle',

  'Refresh': 'รีเฟรช',
  'Create Event': 'สร้างอีเว้นท์',
  'Save Ready': 'บันทึกเข้าคิว',
  'End Event': 'จบอีเว้นท์',
  'Set LIVE': 'ตั้งเป็น LIVE',
  'Set DRAFT': 'ตั้งเป็น DRAFT',
  'Auto Match Preview': 'พรีวิวอัตโนมัติ',
  'Start All': 'เริ่มทุกพรีวิว',
  'Clear Preview': 'ล้างพรีวิว',
  'Manual Preview': 'พรีวิว Manual',
  'Clear Players': 'ล้างรายชื่อ',
  'Add': 'เพิ่ม',
  'Delete': 'ลบ',
  'Close': 'ปิด',
  'Start': 'เริ่ม',
  'Cancel': 'ยกเลิก',
  'Confirm': 'ยืนยันคะแนน',
  'Copy My Link': 'คัดลอกลิงก์ของฉัน',
  'COPY MY LINK': 'คัดลอกลิงก์ของฉัน',
  'Copy Stats Link': 'คัดลอกลิงก์สถิติ',
  'Copied': 'คัดลอกแล้ว',
  'COPIED': 'คัดลอกแล้ว',
  'Open Open Play': 'เปิด Open Play',
  'Enter Open Play': 'เข้า Open Play',
  'Enter Tournament': 'เข้า Tournament',
  'Enter Team Battle': 'เข้า Team Battle',

  'Ready': 'พร้อม',
  'READY': 'พร้อม',
  'Rest': 'พัก',
  'REST': 'พัก',
  'Left': 'ออก',
  'LEFT': 'ออก',
  'Playing': 'กำลังเล่น',
  'PLAYING': 'กำลังเล่น',
  'Preview': 'พรีวิว',
  'PREVIEW': 'พรีวิว',
  'Live': 'กำลังเล่น',
  'LIVE': 'LIVE',
  'Draft': 'ดราฟต์',
  'DRAFT': 'ดราฟต์',
  'Ended': 'จบแล้ว',
  'ENDED': 'จบแล้ว',
  'Auto Rest': 'พักอัตโนมัติ',
  'AUTO REST': 'พักอัตโนมัติ',
  'Win': 'ชนะ',
  'WIN': 'ชนะ',
  'Lose': 'แพ้',
  'LOSE': 'แพ้',

  'Event name': 'ชื่องาน',
  'Event Name': 'ชื่องาน',
  'Event Date': 'วันที่',
  'Start Time': 'เริ่ม',
  'End Time': 'จบ',
  'Courts': 'คอร์ท',
  'Court': 'คอร์ท',
  'Venue': 'สถานที่',
  'Status': 'สถานะ',
  'Nickname': 'ชื่อเล่น',
  'Add player': 'เพิ่มผู้เล่น',
  'Auto Matching Mode': 'โหมดจับคู่อัตโนมัติ',
  'Match Time Alert / MIN': 'เวลาเตือน / นาที',
  'Players Count': 'ผู้เล่น',
  'Ready Count': 'พร้อม',
  'Completed': 'จบแล้ว',
  'Total Games': 'เกมทั้งหมด',
  'Avg Level': 'เลเวลเฉลี่ย',
  'Score': 'คะแนน',
  'Win%': 'ชนะ%',
  'W': 'ชนะ',
  'L': 'แพ้',
  'W/L': 'ชนะ/แพ้',
  'PF': 'แต้มได้',
  'PA': 'แต้มเสีย',
  'Diff': 'แต้มต่าง',
  'Games': 'เกม',
  'Played': 'เล่นแล้ว',
  'Level': 'เลเวล',
  'Queue': 'คิว',
  'Rank': 'อันดับ',
  'Team A': 'ทีม A',
  'TEAM A': 'ทีม A',
  'Team B': 'ทีม B',
  'TEAM B': 'ทีม B',
  'Result': 'ผล',
  'Mode': 'โหมด',
  'Started': 'เริ่ม',
  'Balance Analysis': 'วิเคราะห์ความสมดุล',
  'Balanced': 'สมดุล',
  'BALANCED': 'สมดุล',
  'Acceptable': 'พอใช้ได้',
  'ACCEPTABLE': 'พอใช้ได้',
  'Need Rebalance': 'ควรจัดใหม่',
  'NEED REBALANCE': 'ควรจัดใหม่',
  'No events': 'ยังไม่มีอีเว้นท์',
  'No players': 'ยังไม่มีผู้เล่น',
  'No players yet': 'ยังไม่มีผู้เล่น',
  'No live courts': 'ยังไม่มีคอร์ทที่กำลังเล่น',
  'No data': 'ยังไม่มีข้อมูล',
  'N/A': 'ไม่มีข้อมูล',

  'Fair Match': 'จับคู่สมดุล',
  'Beginner Friendly': 'เหมาะกับมือใหม่',
  'Competitive': 'แข่งขันจริงจัง',
  'Manual': 'เลือกเอง',
  'Live / Open now': 'Live / เปิดเลย',
  'Draft / Not open yet': 'Draft / ยังไม่เปิด'
};

const TH_TO_EN = {
  'อีเว้นท์': 'Events',
  'เข้าร่วม': 'Join',
  'ผู้จัด': 'Organizer',
  'สถิติ': 'Stats',
  'อันดับ': 'Ranking',
  'อันดับ / สถิติ': 'Ranking / Stats',
  'สร้างอีเว้นท์ใหม่': 'Create New Event',
  'เข้าร่วมเล่น': 'Join Open Play',
  'ผู้เล่น': 'Players',
  'คิวผู้เล่น': 'Player Queue',
  'จัดแมตช์อัตโนมัติ': 'Auto Match Control',
  'เลือกผู้เล่นเอง': 'Manual Pick',
  'พรีวิวแมตช์': 'Match Preview',
  'คอร์ทที่กำลังเล่น': 'Live Courts',
  'แมตช์ปัจจุบัน': 'Current Match',
  'สถิติผู้เล่น': 'Player Stats',
  'หน้าต่างสถิติผู้เล่น': 'Player Stats Popup',
  'ตารางสถิติผู้เล่น': 'Player Statistics Table',
  'ประวัติการแข่งขัน': 'Match History',
  'คะแนนสูงสุด': 'Top Score',
  'เล่นมากสุด': 'Most Played',
  'แต้มต่างดีที่สุด': 'Best Diff',
  'สถานะ V2': 'V2 Status',
  'ใช้โหมดไหนดี?': 'Which mode should I use?',
  'เลือกโหมดการใช้งาน': 'Use System Mode',
  'เลือกโหมดการเล่นของคุณ': 'Choose Your Play Mode',

  'รีเฟรช': 'Refresh',
  'สร้างอีเว้นท์': 'Create Event',
  'บันทึกเข้าคิว': 'Save Ready',
  'จบอีเว้นท์': 'End Event',
  'ตั้งเป็น LIVE': 'Set LIVE',
  'ตั้งเป็น DRAFT': 'Set DRAFT',
  'พรีวิวอัตโนมัติ': 'Auto Match Preview',
  'เริ่มทุกพรีวิว': 'Start All',
  'ล้างพรีวิว': 'Clear Preview',
  'พรีวิว Manual': 'Manual Preview',
  'ล้างรายชื่อ': 'Clear Players',
  'เพิ่ม': 'Add',
  'ลบ': 'Delete',
  'ปิด': 'Close',
  'เริ่ม': 'Start',
  'ยกเลิก': 'Cancel',
  'ยืนยันคะแนน': 'Confirm',
  'คัดลอกลิงก์ของฉัน': 'Copy My Link',
  'คัดลอกลิงก์สถิติ': 'Copy Stats Link',
  'คัดลอกแล้ว': 'Copied',
  'เปิด Open Play': 'Open Open Play',
  'เข้า Open Play': 'Enter Open Play',
  'เข้า Tournament': 'Enter Tournament',
  'เข้า Team Battle': 'Enter Team Battle',

  'พร้อม': 'Ready',
  'พัก': 'Rest',
  'ออก': 'Left',
  'กำลังเล่น': 'Playing',
  'พรีวิว': 'Preview',
  'ดราฟต์': 'Draft',
  'จบแล้ว': 'Ended',
  'พักอัตโนมัติ': 'Auto Rest',
  'ชนะ': 'Win',
  'แพ้': 'Lose',

  'ชื่องาน': 'Event name',
  'วันที่': 'Event Date',
  'สถานที่': 'Venue',
  'สถานะ': 'Status',
  'ชื่อเล่น': 'Nickname',
  'เพิ่มผู้เล่น': 'Add player',
  'โหมดจับคู่อัตโนมัติ': 'Auto Matching Mode',
  'จำนวนคอร์ท': 'Courts',
  'เวลาเตือน / นาที': 'Match Time Alert / MIN',
  'เวลาเตือน / MIN': 'Match Time Alert / MIN',
  'คอร์ท': 'Court',
  'เกมทั้งหมด': 'Total Games',
  'เลเวลเฉลี่ย': 'Avg Level',
  'คะแนน': 'Score',
  'ชนะ%': 'Win%',
  'ชนะ/แพ้': 'W/L',
  'แต้มได้': 'PF',
  'แต้มเสีย': 'PA',
  'แต้มต่าง': 'Diff',
  'เกม': 'Games',
  'เล่นแล้ว': 'Played',
  'เลเวล': 'Level',
  'คิว': 'Queue',
  'ทีม A': 'Team A',
  'ทีม B': 'Team B',
  'ผล': 'Result',
  'โหมด': 'Mode',
  'วิเคราะห์ความสมดุล': 'Balance Analysis',
  'สมดุล': 'Balanced',
  'พอใช้ได้': 'Acceptable',
  'ควรจัดใหม่': 'Need Rebalance',
  'ยังไม่มีอีเว้นท์': 'No events',
  'ยังไม่มีผู้เล่น': 'No players',
  'ยังไม่มีคอร์ทที่กำลังเล่น': 'No live courts',
  'ยังไม่มีข้อมูล': 'No data',
  'ไม่มีข้อมูล': 'N/A',

  'จับคู่สมดุล': 'Fair Match',
  'เหมาะกับมือใหม่': 'Beginner Friendly',
  'แข่งขันจริงจัง': 'Competitive',
  'เลือกเอง': 'Manual'
};

const MIXED_VARIANTS = [
  ['รีเฟรช / REFRESH', 'Refresh'],
  ['สร้างอีเว้นท์ / CREATE EVENT', 'Create Event'],
  ['บันทึกและเข้าคิว / SAVE READY', 'Save Ready'],
  ['Create Event / สร้างอีเว้นท์', 'Create Event'],
  ['Save Ready / บันทึกเข้าคิว', 'Save Ready'],
  ['End Event / จบอีเว้นท์', 'End Event'],
  ['Set LIVE / ตั้งเป็น LIVE', 'Set LIVE'],
  ['Set DRAFT / ตั้งเป็น DRAFT', 'Set DRAFT'],
  ['Auto Match Preview / พรีวิวอัตโนมัติ', 'Auto Match Preview'],
  ['Start All / เริ่มทุกพรีวิว', 'Start All'],
  ['Clear Preview / ล้างพรีวิว', 'Clear Preview'],
  ['Manual Preview / พรีวิว Manual', 'Manual Preview'],
  ['Clear Players / ล้างรายชื่อ', 'Clear Players'],
  ['Add / เพิ่ม', 'Add'],
  ['Close / ปิด', 'Close'],
  ['Events / อีเว้นท์', 'Events'],
  ['Organizer / ผู้จัด', 'Organizer'],
  ['Stats / สถิติ', 'Stats'],
  ['Ranking / สถิติ', 'Stats'],
  ['Players / ผู้เล่น', 'Players'],
  ['Player Queue / คิวผู้เล่น', 'Player Queue'],
  ['Auto Match Control / จัดแมตช์อัตโนมัติ', 'Auto Match Control'],
  ['Manual Pick / เลือกผู้เล่นเอง', 'Manual Pick'],
  ['Match Preview / พรีวิวแมตช์', 'Match Preview'],
  ['Live Courts / คอร์ทที่กำลังเล่น', 'Live Courts'],
  ['Match History / ประวัติการแข่งขัน', 'Match History'],
  ['Player Statistics Table / ตารางสถิติผู้เล่น', 'Player Statistics Table'],
  ['Live / เปิดเลย', 'Live / Open now'],
  ['Draft / ยังไม่เปิด', 'Draft / Not open yet']
];

function labelMap() {
  const map = currentLang() === 'en' ? new Map(Object.entries(TH_TO_EN)) : new Map(Object.entries(EN_TO_TH));
  MIXED_VARIANTS.forEach(([mixed, en]) => map.set(mixed, currentLang() === 'en' ? en : EN_TO_TH[en] || mixed));
  return map;
}

function normalizeComparable(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setElementText(el, next) {
  if (!el || !next) return;
  if (el.textContent.trim() !== next) el.textContent = next;
}

function translateExactElements() {
  const map = labelMap();
  const selector = [
    'button', 'a', 'h1', 'h2', 'h3', 'h4', 'label', 'th', 'option', 'span.pill', '.mini', '[data-bilingual-label]'
  ].join(',');
  document.querySelectorAll(selector).forEach((el) => {
    if (el.id === 'gdsqLangToggle') return;
    if (el.closest?.('#rankingTable,#matchHistory,#statsTable,#historyList,#modalPlayerBody,#statsModalBody') && !['TH', 'OPTION'].includes(el.tagName)) return;
    const value = normalizeComparable(el.textContent);
    const next = map.get(value);
    if (next) setElementText(el, next);
  });
}

function translatePlaceholdersAndTitles() {
  ph('newEventName', 'ชื่องาน', 'Event name');
  ph('newEventVenue', 'สถานที่', 'Venue');
  ph('joinName', 'ชื่อเล่น', 'Nickname');
  ph('manageNewPlayerName', 'เพิ่มผู้เล่น', 'Add player');
  attr('joinBack', 'title', 'กลับไปหน้า Join', 'Back to Join');
  attr('copyMyLinkBtn', 'title', 'คัดลอกลิงก์ของฉัน', 'Copy my player link');
  attr('refreshBtn', 'title', 'รีเฟรชข้อมูล', 'Refresh data');
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
    const map = labelMap();
    const value = normalizeComparable(el.placeholder);
    const next = map.get(value);
    if (next && el.placeholder !== next) el.placeholder = next;
  });
}

function translateSelectOptions() {
  document.querySelectorAll('select option').forEach((option) => {
    const value = normalizeComparable(option.textContent);
    const map = labelMap();
    const next = map.get(value);
    if (next) option.textContent = next;
  });
  const status = byId('newEventStatus');
  if (status) {
    [...status.options].forEach((option) => {
      if (option.value === 'live') option.textContent = pick('Live / เปิดเลย', 'Live / Open now');
      if (option.value === 'draft') option.textContent = pick('Draft / ยังไม่เปิด', 'Draft / Not open yet');
    });
  }
}

function translateStaticIds() {
  text('tabBtn-events', 'อีเว้นท์', 'Events');
  text('tabBtn-join', 'เข้าร่วม', 'Join');
  text('tabBtn-manage', 'ผู้จัด', 'Organizer');
  text('tabBtn-stats', 'สถิติ', 'Stats');
  text('copyMyLinkBtn', 'คัดลอกลิงก์ของฉัน', 'Copy My Link');
  text('refreshBtn', 'รีเฟรช', 'Refresh');
  text('closeStatsModal', 'ปิด', 'Close');
  text('closePlayerModal', 'ปิด', 'Close');
}

function translateDynamicPhrases() {
  const en = currentLang() === 'en';
  document.querySelectorAll('.mini, .pill, h3, h4, b, div').forEach((el) => {
    if (el.id === 'gdsqLangToggle') return;
    if (el.children.length > 0) return;
    let value = el.textContent;
    if (!value || !value.trim()) return;

    if (en) {
      value = value
        .replace(/^Lv\s+(.+)\s+·\s+(\d+)\s+games(\s+·\s+เล่นติดกันครบ 2 เกม \/ ระบบพักอัตโนมัติ)?$/i, 'Level $1 · $2 games$3')
        .replace(' · เล่นติดกันครบ 2 เกม / ระบบพักอัตโนมัติ', ' · auto rest after 2 consecutive games')
        .replace(/^ยังไม่มีพรีวิว$/, 'No preview yet')
        .replace(/^ยังไม่มีผู้เล่นในอีเว้นท์นี้$/, 'No players in this event yet')
        .replace(/^ยังไม่ได้ถูกจัดลงแมตช์$/, 'Not assigned to a match yet')
        .replace(/^ยังไม่มีประวัติแมตช์ที่ Confirm แล้ว$/, 'No confirmed match history yet')
        .replace(/^ชนะ\s+/, 'Win vs ')
        .replace(/^แพ้\s+/, 'Lose vs ')
        .replace(/^คู่ทีมเรา:\s+/, 'Our team: ')
        .replace(/^กำลังเล่น$/, 'Playing')
        .replace(/^ใกล้ครบเวลา$/, 'Almost time')
        .replace(/^เกินเวลา$/, 'Over time')
        .replace(/^เริ่ม:\s*/, 'Started: ')
        .replace(/^Team\s+([AB])\s+·\s+Court\s+(.+)$/, 'Team $1 · Court $2')
        .replace(/^คอร์ท\s+(\d+)$/i, 'Court $1');
    } else {
      value = value
        .replace(/^Level\s+(.+)\s+·\s+(\d+)\s+games(\s+·\s+auto rest after 2 consecutive games)?$/i, 'Lv $1 · $2 เกม$3')
        .replace(' · auto rest after 2 consecutive games', ' · เล่นติดกันครบ 2 เกม / ระบบพักอัตโนมัติ')
        .replace(/^No preview yet$/, 'ยังไม่มีพรีวิว')
        .replace(/^No players in this event yet$/, 'ยังไม่มีผู้เล่นในอีเว้นท์นี้')
        .replace(/^Not assigned to a match yet$/, 'ยังไม่ได้ถูกจัดลงแมตช์')
        .replace(/^No confirmed match history yet$/, 'ยังไม่มีประวัติแมตช์ที่ Confirm แล้ว')
        .replace(/^Win vs\s+/, 'ชนะ ')
        .replace(/^Lose vs\s+/, 'แพ้ ')
        .replace(/^Our team:\s+/, 'คู่ทีมเรา: ')
        .replace(/^Playing$/, 'กำลังเล่น')
        .replace(/^Almost time$/, 'ใกล้ครบเวลา')
        .replace(/^Over time$/, 'เกินเวลา')
        .replace(/^Started:\s*/, 'เริ่ม: ')
        .replace(/^Court\s+(\d+)$/i, 'คอร์ท $1');
    }
    if (el.textContent !== value) el.textContent = value;
  });
}

function enhanceManualPickTeams() {
  const selects = ['manual0', 'manual1', 'manual2', 'manual3'].map((id) => byId(id));
  if (selects.some((select) => !select)) return;
  const existing = byId('manualTeamLayout');
  if (existing) {
    text('manualTeamALabel', 'ทีม A', 'TEAM A');
    text('manualTeamBLabel', 'ทีม B', 'TEAM B');
    selects[0].title = pick('ทีม A ผู้เล่น 1', 'Team A Player 1');
    selects[1].title = pick('ทีม A ผู้เล่น 2', 'Team A Player 2');
    selects[2].title = pick('ทีม B ผู้เล่น 1', 'Team B Player 1');
    selects[3].title = pick('ทีม B ผู้เล่น 2', 'Team B Player 2');
    return;
  }
  const originalParent = selects[0].parentElement;
  if (!originalParent || selects.some((select) => select.parentElement !== originalParent)) return;

  originalParent.id = 'manualTeamLayout';
  originalParent.className = 'grid gap-3 mt-2';
  originalParent.textContent = '';

  const teamA = document.createElement('div');
  teamA.className = 'soft p-3 border border-lime-300/30';
  const teamATitle = document.createElement('div');
  teamATitle.id = 'manualTeamALabel';
  teamATitle.className = 'text-xs font-black lime mb-2';
  teamATitle.textContent = pick('ทีม A', 'TEAM A');
  const teamAGrid = document.createElement('div');
  teamAGrid.className = 'grid sm:grid-cols-2 gap-2';
  teamAGrid.append(selects[0], selects[1]);
  teamA.append(teamATitle, teamAGrid);

  const teamB = document.createElement('div');
  teamB.className = 'soft p-3 border border-cyan-300/30';
  const teamBTitle = document.createElement('div');
  teamBTitle.id = 'manualTeamBLabel';
  teamBTitle.className = 'text-xs font-black text-cyan-300 mb-2';
  teamBTitle.textContent = pick('ทีม B', 'TEAM B');
  const teamBGrid = document.createElement('div');
  teamBGrid.className = 'grid sm:grid-cols-2 gap-2';
  teamBGrid.append(selects[2], selects[3]);
  teamB.append(teamBTitle, teamBGrid);

  originalParent.append(teamA, teamB);
  enhanceManualPickTeams();
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
    translateStaticIds();
    translatePlaceholdersAndTitles();
    translateSelectOptions();
    enhanceManualPickTeams();
    translateExactElements();
    translateDynamicPhrases();
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
  }, 320);
}

function shouldReactToMutations(mutations) {
  if (applyingLabels) return false;
  return mutations.some((mutation) => {
    if (!mutation.addedNodes.length && !mutation.removedNodes.length && mutation.type !== 'characterData') return false;
    const target = mutation.target;
    return target?.id === 'eventList' ||
      target?.id === 'managePlayers' ||
      target?.id === 'matchPanels' ||
      target?.id === 'joinPlayers' ||
      target?.id === 'tab-stats' ||
      target?.id === 'summaryGrid' ||
      target?.id === 'currentMatch' ||
      target?.id === 'statsTable' ||
      target?.id === 'historyList' ||
      target?.closest?.('#eventList,#managePlayers,#matchPanels,#joinPlayers,#tab-stats,#summaryGrid,#currentMatch,#statsTable,#historyList,#modalPlayerBody,#statsModalBody');
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
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

bootBilingualUi();
