import { SMART_QUEUE_MODES, generateSmartQueueMatch, normalizeSmartQueueModes } from '../logic/smartQueue/smartQueueEngine.js';
import { createSmartQueueStore } from '../services/smartQueueService.js';

const MODE_LABELS = { social: 'SOCIAL', balanced: 'BALANCED', challenge: 'CHALLENGE' };

function playerId(player) {
  return String(player?.id || player?.eventPlayerId || player?.event_player_id || '');
}

function matchPlayerIds(match) {
  return [...(match?.teamA || match?.team_a || []), ...(match?.teamB || match?.team_b || [])]
    .map((item) => playerId(typeof item === 'string' ? { id: item } : item))
    .filter(Boolean);
}

function isActiveMatch(match) {
  return ['preview', 'assigned', 'playing', 'pending_score'].includes(String(match?.status || '').toLowerCase());
}

function text(language, english, thai) {
  return language() === 'en' ? english : thai;
}

export function createSmartQueueUi({ services, supabase, getEvent, getPlayers, getMatches, getCourtCount, reloadCore, showMessage }) {
  let state = { preferences: [], schemaAvailable: true };
  let joinModes = [];
  let editorPlayerId = '';
  let busy = false;
  let adminPasscode = '';
  const language = () => localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'en' : 'th';
  const event = () => getEvent?.();
  const players = () => getPlayers?.() || [];
  const matches = () => getMatches?.() || [];
  const isSmartEvent = () => String(event()?.matchingMode || event()?.matching_mode || 'standard') === 'smart_queue';
  const organizationId = () => event()?.organizationId || event()?.organization_id || '00000000-0000-4000-8000-000000000001';
  const store = createSmartQueueStore({
    supabase,
    mode: services.mode,
    getAdminPasscode: async () => {
      if (adminPasscode) return adminPasscode;
      adminPasscode = prompt(text(language, 'Enter organizer passcode', 'กรอกรหัสผู้จัด')) || '';
      return adminPasscode;
    }
  });

  function preferenceFor(id) {
    return state.preferences.find((row) => String(row.eventPlayerId) === String(id)) || {
      eventPlayerId: id,
      modes: [],
      preferredMode: null,
      status: 'rest'
    };
  }

  function modeBadges(modes = []) {
    return normalizeSmartQueueModes(modes).map((mode) => `<span class="smart-pref-badge ${mode}">${MODE_LABELS[mode]}</span>`).join('');
  }

  function displayStatus(player) {
    if (!isSmartEvent()) return null;
    const id = playerId(player);
    const active = matches().find((match) => isActiveMatch(match) && matchPlayerIds(match).includes(id));
    if (active && String(active.status).toLowerCase() === 'playing') return 'playing';
    if (preferenceFor(id).status === 'rest') return 'rest';
    return 'waiting';
  }

  function joinPreferenceMarkup() {
    if (!isSmartEvent()) return '';
    return `<section class="smart-pref-panel mt-3" id="smartJoinPreference"><div class="flex items-center justify-between gap-2"><div><div class="smart-pref-title">${text(language, 'PLAY PREFERENCE', 'รูปแบบเกมที่เล่นได้')}</div><p class="mini mt-1">${text(language, 'Pick one or more. You can change this later.', 'เลือกได้มากกว่า 1 แบบ และแก้ได้ภายหลัง')}</p></div><span class="smart-pref-badge">SMART QUEUE</span></div><div class="smart-pref-modes">${SMART_QUEUE_MODES.map((mode) => `<button type="button" class="smart-pref-mode ${joinModes.includes(mode) ? 'is-on' : ''}" data-sq-join-mode="${mode}" aria-pressed="${joinModes.includes(mode)}">${MODE_LABELS[mode]}</button>`).join('')}<button type="button" class="smart-pref-mode ${joinModes.length === SMART_QUEUE_MODES.length ? 'is-on' : ''}" data-sq-join-any aria-pressed="${joinModes.length === SMART_QUEUE_MODES.length}">ANY</button></div></section>`;
  }

  function smartMatchMarkup() {
    if (!isSmartEvent()) return '';
    const available = players().filter((player) => displayStatus(player) === 'waiting').length;
    const courtCount = Number(getCourtCount?.() || 0);
    return `<div class="cut card p-4 smart-match-control"><div class="flex items-start justify-between gap-3"><div><div class="smart-pref-title">SMART MATCH</div><h3 class="font-black text-cyan-300 mt-1">${text(language, 'Next match recommendation', 'แนะนำแมตช์ถัดไป')}</h3><p class="mini mt-1">${text(language, `${available} waiting · ${courtCount} courts`, `รอเล่น ${available} คน · ${courtCount} คอร์ท`)}</p></div><span class="smart-pref-badge">SMART QUEUE</span></div><button id="generateSmartMatchBtn" class="cut bg-lime p-4 font-black text-black w-full mt-3" ${available < 4 ? 'disabled' : ''}>${text(language, 'GENERATE SMART MATCH', 'สร้าง Smart Match')}</button><p class="mini mt-2">${text(language, 'The recommendation uses preferences, level, waiting time, fairness, and recent pairings.', 'ระบบพิจารณารูปแบบที่เลือก ระดับ เวลารอ ความสมดุล และคู่ที่เพิ่งเล่น')}</p></div>`;
  }

  function editorMarkup() {
    const player = players().find((item) => playerId(item) === editorPlayerId);
    if (!player) return '';
    const pref = preferenceFor(editorPlayerId);
    const modes = normalizeSmartQueueModes(pref.modes);
    return `<dialog id="smartPreferenceDialog" class="cut card smart-pref-dialog p-5"><form method="dialog" class="flex justify-between gap-3"><div><div class="smart-pref-title">SMART QUEUE</div><h2 class="text-xl font-black mt-1">${String(player.displayName || player.nickname || player.name || 'Player')}</h2><p class="mini mt-1">${text(language, 'Update game preference', 'แก้ไขรูปแบบเกม')}</p></div><button class="cut btn bg-white/5 px-3 py-2" value="cancel">${text(language, 'Close', 'ปิด')}</button></form><div class="smart-pref-modes mt-4">${SMART_QUEUE_MODES.map((mode) => `<button type="button" class="smart-pref-mode ${modes.includes(mode) ? 'is-on' : ''}" data-sq-editor-mode="${mode}" aria-pressed="${modes.includes(mode)}">${MODE_LABELS[mode]}</button>`).join('')}<button type="button" class="smart-pref-mode ${modes.length === SMART_QUEUE_MODES.length ? 'is-on' : ''}" data-sq-editor-any>ANY</button></div><div class="grid grid-cols-2 gap-2 mt-4"><button type="button" class="smart-pref-rest ${pref.status !== 'rest' ? 'is-on' : ''}" data-sq-editor-status="ready">${text(language, 'WAITING', 'รอเล่น')}</button><button type="button" class="smart-pref-rest ${pref.status === 'rest' ? 'is-on' : ''}" data-sq-editor-status="rest">${text(language, 'REST', 'พัก')}</button></div><p class="mini mt-3">${text(language, 'Status does not change the normal V2 player status.', 'สถานะนี้ไม่เปลี่ยน Player Status หลักของ V2')}</p></dialog>`;
  }

  function renderEditor() {
    document.getElementById('smartPreferenceDialog')?.remove();
    if (!editorPlayerId || !isSmartEvent()) return;
    document.body.insertAdjacentHTML('beforeend', editorMarkup());
    const dialog = document.getElementById('smartPreferenceDialog');
    dialog?.showModal?.();
    dialog?.addEventListener('close', () => { editorPlayerId = ''; });
  }

  async function refresh({ silent = false } = {}) {
    if (!isSmartEvent() || !event()?.id) {
      state = { preferences: [], schemaAvailable: true };
      joinModes = [];
      return state;
    }
    try {
      state = await store.load(event().id);
      return state;
    } catch (error) {
      console.error('Smart Queue preferences failed to load', error);
      if (!silent) showMessage?.(text(language, `Smart Queue could not load: ${error.message}`, `โหลด Smart Queue ไม่สำเร็จ: ${error.message}`));
      return state;
    }
  }

  async function savePreference(id, patch, updatedBy = 'admin') {
    if (!isSmartEvent() || !event()?.id) return null;
    const current = preferenceFor(id);
    const modes = normalizeSmartQueueModes(patch.modes ?? current.modes);
    const status = patch.status || current.status || 'ready';
    const result = await store.savePreference({
      eventId: event().id,
      organizationId: organizationId(),
      eventPlayerId: id,
      modes,
      preferredMode: patch.preferredMode ?? current.preferredMode ?? modes[0] ?? null,
      status,
      readySince: status === 'ready' ? current.readySince || new Date().toISOString() : null,
      updatedBy
    });
    state.preferences = [...state.preferences.filter((row) => String(row.eventPlayerId) !== String(id)), result];
    return result;
  }

  async function registerJoinedPlayer(player) {
    if (!isSmartEvent() || !player?.id) return;
    const modes = normalizeSmartQueueModes(joinModes);
    if (!modes.length) throw new Error(text(language, 'Choose at least one play preference for this Smart Queue event.', 'เลือกอย่างน้อย 1 รูปแบบเกมสำหรับ Smart Queue ก่อนเข้าคิว'));
    await savePreference(player.id, { modes, preferredMode: modes[0], status: 'ready' }, 'player');
    joinModes = [];
  }

  async function generateSmartMatch() {
    if (!isSmartEvent() || busy) return;
    const courtNumbers = new Set(matches().filter(isActiveMatch).map((match) => Number(match.courtNumber || match.court_number)));
    const court = Array.from({ length: Number(getCourtCount?.() || 0) }, (_, index) => index + 1).find((number) => !courtNumbers.has(number));
    if (!court) return showMessage?.(text(language, 'No court is available. Finish or cancel an active match first.', 'ไม่มีคอร์ทว่าง กรุณาจบหรือยกเลิกแมตช์ที่กำลังเล่นก่อน'));
    const result = generateSmartQueueMatch({ players: players(), preferences: state.preferences, matches: matches() });
    if (!result.match) return showMessage?.(text(language, 'No compatible group of four is ready yet.', 'ยังไม่พบผู้เล่น 4 คนที่เหมาะสมในตอนนี้'));
    busy = true;
    try {
      await services.createMatchPreview({
        eventId: event().id,
        organizationId: organizationId(),
        courtId: `court-${court}`,
        courtNumber: court,
        courtName: `Court ${court}`,
        teamA: result.match.teamA,
        teamB: result.match.teamB,
        matchMode: `smart_queue_${result.match.mode}`,
        fairnessScore: result.match.score,
        idempotencyKey: `smart-queue:${event().id}:${court}:${result.match.playerIds.slice().sort().join('-')}:${Date.now()}`
      });
      await reloadCore?.();
      await refresh({ silent: true });
      showMessage?.(text(language, 'Smart Match preview is ready.', 'สร้างพรีวิว Smart Match แล้ว'));
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', (eventObject) => {
    const target = eventObject.target.closest('[data-sq-join-mode],[data-sq-join-any],[data-sq-edit],[data-sq-editor-mode],[data-sq-editor-any],[data-sq-editor-status],#generateSmartMatchBtn');
    if (!target || busy) return;
    if (target.id === 'generateSmartMatchBtn') {
      generateSmartMatch().catch((error) => showMessage?.(error.message));
      return;
    }
    if (target.dataset.sqJoinMode) {
      const mode = target.dataset.sqJoinMode;
      joinModes = joinModes.includes(mode) ? joinModes.filter((value) => value !== mode) : [...joinModes, mode];
      document.getElementById('smartJoinPreference')?.replaceWith(document.createRange().createContextualFragment(joinPreferenceMarkup()));
      return;
    }
    if (target.hasAttribute('data-sq-join-any')) {
      joinModes = joinModes.length === SMART_QUEUE_MODES.length ? [] : SMART_QUEUE_MODES.slice();
      document.getElementById('smartJoinPreference')?.replaceWith(document.createRange().createContextualFragment(joinPreferenceMarkup()));
      return;
    }
    if (target.dataset.sqEdit) {
      editorPlayerId = target.dataset.sqEdit;
      renderEditor();
      return;
    }
    if (!editorPlayerId) return;
    const current = preferenceFor(editorPlayerId);
    let patch = null;
    if (target.dataset.sqEditorMode) {
      const mode = target.dataset.sqEditorMode;
      const modes = current.modes.includes(mode) ? current.modes.filter((value) => value !== mode) : [...current.modes, mode];
      patch = { modes, preferredMode: modes.includes(current.preferredMode) ? current.preferredMode : modes[0] };
    } else if (target.hasAttribute('data-sq-editor-any')) {
      const modes = SMART_QUEUE_MODES.slice();
      patch = { modes, preferredMode: modes[0] || null };
    } else if (target.dataset.sqEditorStatus) {
      patch = { status: target.dataset.sqEditorStatus };
    }
    if (!patch) return;
    busy = true;
    savePreference(editorPlayerId, patch).then(() => {
      renderEditor();
      window.dispatchEvent(new CustomEvent('gdsq-smart-queue-change'));
    }).catch((error) => {
      if (/passcode|unauthorized|401/i.test(String(error?.message || ''))) adminPasscode = '';
      showMessage?.(error.message);
    }).finally(() => { busy = false; });
  });

  return {
    refresh,
    isSmartEvent,
    joinPreferenceMarkup,
    smartMatchMarkup,
    hasJoinPreference: () => joinModes.length > 0,
    registerJoinedPlayer,
    modeBadges,
    displayStatus,
    preferenceFor,
    isSmartMatch: (match) => String(match?.matchMode || match?.match_type || '').startsWith('smart_queue_'),
    matchMode: (match) => String(match?.matchMode || match?.match_type || '').replace(/^smart_queue_/, ''),
    editorButton: (player) => isSmartEvent() ? `<button type="button" class="cut smart-pref-edit" data-sq-edit="${playerId(player)}">${text(language, 'Edit', 'แก้ไข')}</button>` : ''
  };
}
