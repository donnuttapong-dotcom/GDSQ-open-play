// Text-only bilingual labels. No app data or match logic changes.
function text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function ph(id, value) {
  const el = document.getElementById(id);
  if (el) el.placeholder = value;
}

function applyBilingualUiLabels() {
  text('tabBtn-events', 'Events / อีเว้นท์');
  text('tabBtn-join', 'Join / เข้าร่วม');
  text('tabBtn-manage', 'Organizer / ผู้จัด');
  text('tabBtn-stats', 'Stats / สถิติ');
  text('refreshEventsBtn', 'Refresh / รีเฟรช');
  text('refreshManageBtn', 'Refresh / รีเฟรช');
  text('refreshStatsBtn', 'Refresh / รีเฟรช');
  text('createEventBtn', 'Create Event / สร้างอีเว้นท์');
  text('savePlayerBtn', 'Save Ready / บันทึกเข้าคิว');
  text('endEventBtn', 'End Event / จบอีเว้นท์');
  text('eventLiveBtn', 'Set LIVE / ตั้งเป็น LIVE');
  text('eventDraftBtn', 'Set DRAFT / ตั้งเป็น DRAFT');
  text('generateAutoBtn', 'Auto Match Preview / พรีวิวอัตโนมัติ');
  text('startAllBtn', 'Start All / เริ่มทุกพรีวิว');
  text('clearPreviewBtn', 'Clear Preview / ล้างพรีวิว');
  text('manualPreviewBtn', 'Manual Preview / พรีวิว Manual');
  text('manualClearBtn', 'Clear Players / ล้างรายชื่อ');
  text('manageCreatePlayerBtn', 'Add / เพิ่ม');
  text('copyStatsLinkBtn', 'Copy Stats Link / คัดลอกลิงก์สถิติ');
  ph('newEventName', 'Event name / ชื่องาน');
  ph('newEventVenue', 'Venue / สถานที่');
  ph('joinName', 'Nickname / ชื่อเล่น');
  ph('manageNewPlayerName', 'Add player / เพิ่มผู้เล่น');
}

if (typeof window !== 'undefined') {
  window.applyGdsqBilingualLabels = applyBilingualUiLabels;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBilingualUiLabels);
  } else {
    applyBilingualUiLabels();
  }
  setInterval(applyBilingualUiLabels, 1000);
}
