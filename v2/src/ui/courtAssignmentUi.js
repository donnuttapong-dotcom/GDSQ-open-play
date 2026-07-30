import { createV2Services } from '../services/index.js';
import {
  buildAutoAssignmentProposal,
  duplicateCourt,
  getCourtAssignment,
  prunePlayerAssignments,
  resetCourt,
  saveCourtSetup,
  savePlayerAssignments
} from '../services/localCourtAssignmentStore.js';

const services = createV2Services();
const TYPES = ['social', 'balanced', 'challenge', 'open', 'custom'];
const COLORS = ['green', 'blue', 'orange', 'purple', 'gray'];
const root = document.getElementById('courtAssignmentModule');
const menuButton = document.getElementById('courtAssignmentBtn');

let event = null;
let players = [];
let data = null;
let activeTab = 'setup';
let activeMobileColumn = 'unassigned';
let selectedPlayerIds = new Set();
let proposal = null;
let visible = false;
let lastContextKey = '';

const copy = {
  en: {
    menu: 'Court Assignment', title: 'Court & Player Assignment', setup: '1. Court Setup', assignment: '2. Assign Players', refresh: 'Refresh', player: 'Player', openPlayEvent: 'Open Play Event',
    quickTitle: 'Quick start', quick: '1. Set court profile  2. Choose players or Auto Assign  3. Apply when ready', localOnly: 'Assignments are saved on this device for this event only. Matches, queue, score, and ranking are unchanged.',
    displayName: 'Court name', courtType: 'Court type', minLevel: 'Min level', maxLevel: 'Max level', active: 'Use this court', advanced: 'Advanced settings', color: 'Theme color', note: 'Note (optional)',
    save: 'Save court', copyNext: 'Copy to next court', reset: 'Reset court', unassigned: 'Unassigned', noPlayers: 'No players here', playersHere: 'Players not assigned to a court yet',
    select: 'Select', selected: 'selected', chooseCourt: 'Choose court', assign: 'Assign selected', resetAssignments: 'Reset all assignments', autoAssign: 'Auto Assign by Level', clearSelection: 'Clear selection',
    move: 'Move to court', remove: 'Remove', appliedCourt: 'Court', previewTitle: 'Review auto assignment', previewText: 'Check the suggested court placement, then apply it. Players outside all level ranges remain unassigned.', apply: 'Apply assignment', discard: 'Back to editing',
    active: 'Active', disabled: 'Disabled', level: 'Level', selectEvent: 'Select an event before configuring court assignments.', invalidRange: 'Min level must not be higher than max level.',
    social: 'Social', balanced: 'Balanced', challenge: 'Challenge', open: 'Open', custom: 'Custom', green: 'Green', blue: 'Blue', orange: 'Orange', purple: 'Purple', gray: 'Gray'
  },
  th: {
    menu: 'จัดคอร์ท', title: 'จัดคอร์ทและผู้เล่น', setup: '1. ตั้งค่าคอร์ท', assignment: '2. จัดผู้เล่น', refresh: 'รีเฟรช', player: 'ผู้เล่น', openPlayEvent: 'อีเวนต์ Open Play',
    quickTitle: 'เริ่มใช้งาน 3 ขั้น', quick: '1. ตั้งรูปแบบคอร์ท  2. เลือกผู้เล่น หรือจัดอัตโนมัติ  3. ตรวจสอบแล้วกดบันทึก', localOnly: 'ข้อมูลจัดคอร์ทเก็บในอุปกรณ์นี้ แยกตามอีเว้นท์เท่านั้น โดยไม่เปลี่ยนแมตช์ คิว คะแนน หรืออันดับ',
    displayName: 'ชื่อคอร์ท', courtType: 'ประเภทคอร์ท', minLevel: 'ระดับต่ำสุด', maxLevel: 'ระดับสูงสุด', active: 'เปิดใช้คอร์ทนี้', advanced: 'ตั้งค่าเพิ่มเติม', color: 'สีคอร์ท', note: 'หมายเหตุ (ไม่บังคับ)',
    save: 'บันทึกคอร์ท', copyNext: 'คัดลอกไปคอร์ทถัดไป', reset: 'รีเซ็ตคอร์ท', unassigned: 'ยังไม่จัดคอร์ท', noPlayers: 'ยังไม่มีผู้เล่น', playersHere: 'ผู้เล่นที่ยังไม่ได้จัดลงคอร์ท',
    select: 'เลือก', selected: 'คนที่เลือก', chooseCourt: 'เลือกคอร์ท', assign: 'จัดผู้เล่นที่เลือก', resetAssignments: 'ล้างการจัดคอร์ททั้งหมด', autoAssign: 'จัดคอร์ทอัตโนมัติตามระดับ', clearSelection: 'ล้างที่เลือก',
    move: 'ย้ายไปคอร์ท', remove: 'นำออกจากคอร์ท', appliedCourt: 'คอร์ท', previewTitle: 'ตรวจสอบการจัดอัตโนมัติ', previewText: 'ตรวจสอบคอร์ทที่ระบบแนะนำ แล้วกดบันทึก ผู้เล่นที่ไม่อยู่ในช่วงระดับใดจะยังไม่ถูกจัดคอร์ท', apply: 'ยืนยันการจัดคอร์ท', discard: 'กลับไปแก้ไข',
    active: 'เปิดใช้', disabled: 'ปิดใช้', level: 'ระดับ', selectEvent: 'เลือกอีเว้นท์ก่อนตั้งค่าการจัดคอร์ท', invalidRange: 'ระดับต่ำสุดต้องไม่สูงกว่าระดับสูงสุด',
    social: 'สังคม', balanced: 'สมดุล', challenge: 'ท้าทาย', open: 'เปิดทุกระดับ', custom: 'กำหนดเอง', green: 'เขียว', blue: 'น้ำเงิน', orange: 'ส้ม', purple: 'ม่วง', gray: 'เทา'
  }
};

function language() {
  return localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'en' : 'th';
}

function t(key) {
  return copy[language()][key] || key;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function playerName(player) {
  return player?.displayName || player?.nickname || player?.name || t('player');
}

function playerLevel(player) {
  const value = Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function playerStatus(player) {
  const status = String(player?.status || 'ready').toLowerCase();
  const labels = { ready: ['Ready', 'พร้อม'], checked_in: ['Checked in', 'เช็กอินแล้ว'], playing: ['Playing', 'กำลังเล่น'], resting: ['Resting', 'พัก'], rest: ['Resting', 'พัก'], left: ['Left', 'ออกแล้ว'] };
  return labels[status]?.[language() === 'en' ? 0 : 1] || status.replace(/_/g, ' ');
}

function eventCourtCount() {
  return Math.max(1, Math.min(10, Number(event?.courtCount ?? event?.court_count ?? 1)));
}

function assignmentMap() {
  return proposal || data?.playerAssignments || {};
}

function assignedCourtNumber(playerId) {
  return Number(assignmentMap()[String(playerId)]?.courtNumber) || null;
}

function activeCourts() {
  return (data?.courts || []).filter((court) => court.active);
}

function showModule() {
  visible = true;
  menuButton.textContent = t('menu');
  document.querySelectorAll('#tab-events,#tab-join,#tab-manage,#tab-stats').forEach((section) => section.classList.add('hidden'));
  root.classList.remove('hidden');
  document.querySelectorAll('.mode-tabs [data-tab]').forEach((button) => {
    button.className = 'cut btn py-3 tab-idle';
  });
  menuButton.className = 'cut btn py-3 tab-active';
  refreshContext(true);
}

function hideModule() {
  visible = false;
  root.classList.add('hidden');
  menuButton.className = 'cut btn py-3 tab-idle';
}

async function refreshContext(force = false) {
  const nextEvent = await services.getCurrentEvent();
  if (!nextEvent) {
    event = null;
    players = [];
    data = null;
    render();
    return;
  }
  const nextPlayers = await services.listEventPlayers(nextEvent.id);
  const key = `${nextEvent.id}:${nextPlayers.map((player) => player.id).sort().join(',')}:${eventCourtCount()}`;
  if (!force && key === lastContextKey) return;
  event = nextEvent;
  players = nextPlayers.filter((player) => String(player.status || '').toLowerCase() !== 'removed');
  data = prunePlayerAssignments(event.id, eventCourtCount(), players.map((player) => player.id));
  selectedPlayerIds = new Set([...selectedPlayerIds].filter((id) => players.some((player) => String(player.id) === String(id))));
  proposal = null;
  lastContextKey = `${event.id}:${players.map((player) => player.id).sort().join(',')}:${eventCourtCount()}`;
  render();
}

function courtCard(court) {
  const nextCourt = data.courts.find((item) => item.courtNumber === court.courtNumber + 1) || data.courts.find((item) => item.courtNumber !== court.courtNumber);
  return `<article class="cut ca-court-card" data-color="${esc(court.themeColor)}" data-court-card="${court.courtNumber}">
    <div class="flex items-center justify-between gap-2"><b class="lime">${t('appliedCourt').toUpperCase()} ${court.courtNumber}</b><span class="ca-badge">${esc(t(court.courtType))}</span></div>
    <div class="ca-court-fields">
      <label class="ca-field ca-wide">${t('displayName')}<input data-court-field="displayName" value="${esc(court.displayName)}" maxlength="60"></label>
      <label class="ca-field">${t('courtType')}<select data-court-field="courtType">${TYPES.map((type) => `<option value="${type}" ${type === court.courtType ? 'selected' : ''}>${t(type)}</option>`).join('')}</select></label>
      <label class="ca-field ca-field-toggle"><span class="ca-toggle"><input data-court-field="active" type="checkbox" ${court.active ? 'checked' : ''}> ${t('active')}</span></label>
      <label class="ca-field">${t('minLevel')}<input data-court-field="minLevel" type="number" min="1" max="6" step="0.25" value="${court.minLevel}"></label>
      <label class="ca-field">${t('maxLevel')}<input data-court-field="maxLevel" type="number" min="1" max="6" step="0.25" value="${court.maxLevel}"></label>
      <details class="ca-advanced ca-wide"><summary>${t('advanced')}</summary><div class="ca-court-fields mt-2"><label class="ca-field">${t('color')}<select data-court-field="themeColor">${COLORS.map((color) => `<option value="${color}" ${color === court.themeColor ? 'selected' : ''}>${t(color)}</option>`).join('')}</select></label><label class="ca-field">${t('note')}<textarea data-court-field="note" maxlength="240">${esc(court.note)}</textarea></label></div></details>
    </div>
    <div class="ca-actions mt-3"><button class="cut ca-button primary" data-save-court="${court.courtNumber}">${t('save')}</button><button class="cut ca-button" data-duplicate-court="${court.courtNumber}" data-duplicate-target="${nextCourt?.courtNumber || ''}" ${nextCourt ? '' : 'disabled'}>${t('copyNext')}</button><button class="cut ca-button danger" data-reset-court="${court.courtNumber}">${t('reset')}</button></div>
  </article>`;
}

function playerCard(player, courtNumber) {
  const id = String(player.id);
  const isSelected = selectedPlayerIds.has(id);
  const currentCourt = assignedCourtNumber(id);
  const choices = activeCourts().map((court) => `<option value="${court.courtNumber}" ${Number(courtNumber) === Number(court.courtNumber) ? 'selected' : ''}>${esc(court.displayName)}</option>`).join('');
  const avatar = player.avatarUrl || player.avatar_url
    ? `<img class="ca-avatar" src="${esc(player.avatarUrl || player.avatar_url)}" alt="">`
    : `<span class="ca-avatar">${esc(playerName(player).slice(0, 1).toUpperCase())}</span>`;
  return `<article class="ca-player"><div class="ca-player-top"><div class="ca-player-title"><input class="ca-player-check" type="checkbox" data-select-player="${esc(id)}" aria-label="${t('select')} ${esc(playerName(player))}" ${isSelected ? 'checked' : ''}>${avatar}<div class="min-w-0"><div class="ca-player-name">${esc(playerName(player))}</div><div class="ca-player-meta">${t('level')} ${playerLevel(player).toFixed(2)} · ${esc(playerStatus(player))}</div></div></div><span class="ca-badge">${currentCourt ? `${t('appliedCourt')} ${currentCourt}` : t('unassigned')}</span></div><div class="ca-player-actions"><select data-move-player="${esc(id)}" aria-label="${t('move')} ${esc(playerName(player))}"><option value="">${t('move')}</option>${choices}</select><button class="cut" data-remove-assignment="${esc(id)}" ${currentCourt ? '' : 'disabled'}>${t('remove')}</button></div></article>`;
}

function boardColumn(id, title, court, columnPlayers) {
  const isActive = activeMobileColumn === id;
  const color = court?.themeColor || 'gray';
  return `<section class="cut ca-column ${isActive ? 'is-mobile-active' : ''}" data-column="${id}"><div class="ca-column-head" data-color="${color}"><div><b>${esc(title)}</b>${court ? `<div class="mini">${t('level')} ${court.minLevel.toFixed(2)}–${court.maxLevel.toFixed(2)} · ${court.active ? t('active') : t('disabled')}</div>` : `<div class="mini">${t('playersHere')}</div>`}</div><span class="ca-badge">${columnPlayers.length}</span></div><div class="ca-player-list">${columnPlayers.map((player) => playerCard(player, court?.courtNumber)).join('') || `<div class="ca-empty">${t('noPlayers')}</div>`}</div></section>`;
}

function renderSetup() {
  return `<div class="ca-court-grid">${data.courts.map(courtCard).join('')}</div>`;
}

function renderAssignment() {
  const mapping = assignmentMap();
  const unassigned = players.filter((player) => !mapping[String(player.id)]?.courtNumber);
  const columns = [boardColumn('unassigned', t('unassigned'), null, unassigned), ...data.courts.map((court) => boardColumn(`court-${court.courtNumber}`, court.displayName, court, players.filter((player) => Number(mapping[String(player.id)]?.courtNumber) === Number(court.courtNumber))))];
  const choices = activeCourts().map((court) => `<option value="${court.courtNumber}">${esc(court.displayName)}</option>`).join('');
  const selectedCount = selectedPlayerIds.size;
  const preview = proposal ? `<div class="cut ca-preview"><b>${t('previewTitle')}</b><p>${t('previewText')}</p><div class="ca-actions mt-2"><button class="cut ca-button primary" data-apply-proposal>${t('apply')}</button><button class="cut ca-button" data-discard-proposal>${t('discard')}</button></div></div>` : '';
  return `${preview}<div class="cut card p-4 ca-action-card"><div class="ca-action-intro"><b>${t('autoAssign')}</b><span class="mini">${language()==='en'?'Use this first when courts are configured by level.':'ใช้ปุ่มนี้ก่อนเมื่อกำหนดช่วงระดับของแต่ละคอร์ทแล้ว'}</span></div><div class="ca-actions mt-3"><button class="cut ca-button primary" data-auto-assign ${activeCourts().length ? '' : 'disabled'}>${t('autoAssign')}</button><button class="cut ca-button danger" data-reset-assignments>${t('resetAssignments')}</button></div><div class="ca-bulk mt-4"><label class="ca-bulk-label">${selectedCount} ${t('selected')}<select id="caBulkCourt" class="ca-bulk-select"><option value="">${t('chooseCourt')}</option>${choices}</select></label><button class="cut ca-button" data-assign-selected ${selectedCount && choices ? '' : 'disabled'}>${t('assign')}</button><button class="cut ca-button" data-clear-selection ${selectedCount ? '' : 'disabled'}>${t('clearSelection')}</button></div></div><div class="ca-mobile-tabs mt-3">${['unassigned', ...data.courts.map((court) => `court-${court.courtNumber}`)].map((id) => `<button class="cut ca-button ${activeMobileColumn === id ? 'primary' : ''}" data-mobile-column="${id}">${id === 'unassigned' ? t('unassigned') : `${t('appliedCourt')} ${id.split('-')[1]}`}</button>`).join('')}</div><div class="ca-board">${columns.join('')}</div>`;
}

function render() {
  if (!root) return;
  if (!event || !data) {
    root.innerHTML = `<section class="court-assignment"><div class="cut card p-5">${t('selectEvent')}</div></section>`;
    return;
  }
  menuButton.textContent = t('menu');
  root.innerHTML = `<section class="court-assignment"><div class="cut card p-5"><div class="ca-head"><div><p class="kicker">${t('title').toUpperCase()}</p><h1 class="text-2xl font-black lime">${esc(event.name || event.name_th || event.name_en || t('openPlayEvent'))}</h1><p class="mini mt-1">${t('localOnly')}</p></div><button class="cut ca-button" data-refresh-assignment>${t('refresh')}</button></div><div class="ca-quick-start mt-4"><b>${t('quickTitle')}</b><span>${t('quick')}</span></div><div class="ca-tabs mt-4"><button class="cut ca-tab ${activeTab === 'setup' ? 'is-active' : ''}" data-ca-tab="setup">${t('setup')}</button><button class="cut ca-tab ${activeTab === 'assignment' ? 'is-active' : ''}" data-ca-tab="assignment">${t('assignment')}</button></div></div>${activeTab === 'setup' ? renderSetup() : renderAssignment()}</section>`;
}

function readCourtForm(courtNumber) {
  const card = root.querySelector(`[data-court-card="${courtNumber}"]`);
  const current = data.courts.find((court) => Number(court.courtNumber) === Number(courtNumber));
  return {
    ...current,
    displayName: card.querySelector('[data-court-field="displayName"]').value,
    courtType: card.querySelector('[data-court-field="courtType"]').value,
    themeColor: card.querySelector('[data-court-field="themeColor"]').value,
    minLevel: Number(card.querySelector('[data-court-field="minLevel"]').value),
    maxLevel: Number(card.querySelector('[data-court-field="maxLevel"]').value),
    active: card.querySelector('[data-court-field="active"]').checked,
    note: card.querySelector('[data-court-field="note"]').value
  };
}

function saveSingleCourt(courtNumber) {
  const courts = data.courts.map((court) => Number(court.courtNumber) === Number(courtNumber) ? readCourtForm(courtNumber) : court);
  const updated = courts.find((court) => Number(court.courtNumber) === Number(courtNumber));
  if (updated.minLevel > updated.maxLevel) {
    window.alert(t('invalidRange'));
    return;
  }
  data = saveCourtSetup(event.id, eventCourtCount(), courts);
  proposal = null;
  render();
}

function updateAssignments(next) {
  data = savePlayerAssignments(event.id, eventCourtCount(), next);
  proposal = null;
  render();
}

function assignPlayers(playerIds, courtNumber) {
  const validCourt = activeCourts().find((court) => Number(court.courtNumber) === Number(courtNumber));
  if (!validCourt) return;
  const next = { ...data.playerAssignments };
  playerIds.forEach((id) => { next[String(id)] = { courtNumber: Number(courtNumber) }; });
  updateAssignments(next);
}

root?.addEventListener('click', (eventClick) => {
  const tab = eventClick.target.closest('[data-ca-tab]');
  if (tab) { activeTab = tab.dataset.caTab; render(); return; }
  const save = eventClick.target.closest('[data-save-court]');
  if (save) { saveSingleCourt(save.dataset.saveCourt); return; }
  const duplicate = eventClick.target.closest('[data-duplicate-court]');
  if (duplicate) { data = duplicateCourt(event.id, eventCourtCount(), duplicate.dataset.duplicateCourt, duplicate.dataset.duplicateTarget); proposal = null; render(); return; }
  const reset = eventClick.target.closest('[data-reset-court]');
  if (reset) { data = resetCourt(event.id, eventCourtCount(), reset.dataset.resetCourt); proposal = null; render(); return; }
  if (eventClick.target.closest('[data-auto-assign]')) { proposal = buildAutoAssignmentProposal(data.courts, players); selectedPlayerIds.clear(); render(); return; }
  if (eventClick.target.closest('[data-apply-proposal]')) { updateAssignments(proposal || {}); return; }
  if (eventClick.target.closest('[data-discard-proposal]')) { proposal = null; render(); return; }
  if (eventClick.target.closest('[data-reset-assignments]')) { updateAssignments({}); return; }
  if (eventClick.target.closest('[data-clear-selection]')) { selectedPlayerIds.clear(); render(); return; }
  if (eventClick.target.closest('[data-assign-selected]')) { const target = root.querySelector('#caBulkCourt')?.value; if (target) assignPlayers([...selectedPlayerIds], target); return; }
  const remove = eventClick.target.closest('[data-remove-assignment]');
  if (remove) { const next = { ...data.playerAssignments }; delete next[remove.dataset.removeAssignment]; updateAssignments(next); return; }
  const mobile = eventClick.target.closest('[data-mobile-column]');
  if (mobile) { activeMobileColumn = mobile.dataset.mobileColumn; render(); return; }
  if (eventClick.target.closest('[data-refresh-assignment]')) refreshContext(true);
});

root?.addEventListener('change', (eventChange) => {
  const check = eventChange.target.closest('[data-select-player]');
  if (check) {
    if (check.checked) selectedPlayerIds.add(check.dataset.selectPlayer);
    else selectedPlayerIds.delete(check.dataset.selectPlayer);
    render();
    return;
  }
  const move = eventChange.target.closest('[data-move-player]');
  if (move && move.value) assignPlayers([move.dataset.movePlayer], move.value);
});

menuButton?.addEventListener('click', showModule);
document.querySelector('.mode-tabs')?.addEventListener('click', (eventClick) => {
  if (eventClick.target.closest('[data-tab]')) hideModule();
});
window.addEventListener('storage', (eventStorage) => {
  if (eventStorage.key?.startsWith('gdsq_v2_') && visible) refreshContext(true);
});
window.addEventListener('gdsq-language-change', () => {
  menuButton.textContent = t('menu');
  if (visible) render();
});
setInterval(() => { if (visible) refreshContext(); }, 1000);
