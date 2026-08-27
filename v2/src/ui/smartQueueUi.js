import { SMART_QUEUE_MODES, buildMatchMakingCourtProfile, generateMatchMakingCourtMatches, normalizeSmartQueueModes } from '../logic/smartQueue/smartQueueEngine.js?v=match-making-level-courts-01';
import { createSmartQueueStore } from '../services/smartQueueService.js';
import { gamePreferenceLabel, anyGamePreferenceLabel } from '../services/gamePreferenceLabels.js';
import { matchPlayerIds as normalizedMatchPlayerIds, playerId } from '../services/matchModel.js';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const matchPlayerIds = (match) => normalizedMatchPlayerIds(match);
const isActiveMatch = (match) => ['preview', 'assigned', 'playing', 'pending_score', 'queued_next'].includes(String(match?.status || '').toLowerCase());

export function createSmartQueueUi({ services, supabase, getEvent, getPlayers, getMatches, getCourtCount, getAvailableCourts, reloadCore, showMessage }) {
  let state = { preferences: [], schemaAvailable: true };
  let joinModes = [];
  let editorPlayerId = '';
  let busy = false;
  let adminPasscode = '';
  const language = () => localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'en' : 'th';
  const text = (english, thai) => language() === 'en' ? english : thai;
  const modeLabel = (mode) => gamePreferenceLabel(mode, language());
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
      adminPasscode = prompt(text('Enter organizer passcode', 'กรอกรหัสผู้จัด')) || '';
      return adminPasscode;
    }
  });

  function normalizePreference(row = {}) {
    return {
      ...row,
      eventPlayerId: row.eventPlayerId || row.event_player_id,
      preferredMode: row.preferredMode || row.preferred_mode || null,
      readySince: row.readySince || row.ready_since || null,
      status: row.status || row.queue_status || 'rest',
      modes: normalizeSmartQueueModes(row.modes)
    };
  }

  function preferenceFor(id, context = null) {
    return context?.preferencesById?.get(String(id)) || state.preferences.find((row) => String(row.eventPlayerId) === String(id)) || {
      eventPlayerId: id, modes: [], preferredMode: null, status: 'rest'
    };
  }

  function modeBadges(modes = []) {
    return normalizeSmartQueueModes(modes).map((mode) => `<span class="smart-pref-badge ${mode}">${modeLabel(mode)}</span>`).join('');
  }

  function createRenderContext(sourcePlayers = players(), sourceMatches = matches()) {
    const preferencesById = new Map(state.preferences.map((row) => [String(row.eventPlayerId), row]));
    const activePlayerIds = new Set();
    sourceMatches.filter(isActiveMatch).forEach((match) => matchPlayerIds(match).forEach((id) => activePlayerIds.add(String(id))));
    const statusById = new Map(sourcePlayers.map((player) => {
      const id = playerId(player);
      const playerStatus = String(player?.status || 'ready').toLowerCase();
      const unavailable = ['removed', 'deleted', 'left', 'rest', 'resting', 'wait'].includes(playerStatus);
      const status = activePlayerIds.has(id) ? 'playing' : (unavailable || preferencesById.get(id)?.status === 'rest' ? 'rest' : 'waiting');
      return [id, status];
    }));
    return { preferencesById, activePlayerIds, statusById, waitingCount: [...statusById.values()].filter((status) => status === 'waiting').length };
  }

  function displayStatus(player, context = null) {
    if (!isSmartEvent()) return null;
    const id = playerId(player);
    if (context?.statusById) return context.statusById.get(id) || 'waiting';
    if (matches().some((match) => isActiveMatch(match) && matchPlayerIds(match).includes(id))) return 'playing';
    return preferenceFor(id).status === 'rest' ? 'rest' : 'waiting';
  }

  function joinPreferenceMarkup() {
    if (!isSmartEvent()) return '';
    return `<section class="smart-pref-panel mt-3" id="smartJoinPreference"><div class="flex items-center justify-between gap-2"><div><div class="smart-pref-title">${text('GAME PREFERENCES', 'รูปแบบเกมที่ต้องการ')}</div><p class="mini mt-1">${text('Preferences guide tie-breaks. Your Event Level controls court eligibility.', 'ใช้เป็นตัวช่วยเมื่อคะแนนความเหมาะสมใกล้กัน โดย Level ของอีเว้นท์เป็นตัวกำหนดคอร์ทที่เล่นได้')}</p></div><span class="smart-pref-badge">MATCH MAKING</span></div><div class="smart-pref-modes">${SMART_QUEUE_MODES.map((mode) => `<button type="button" class="smart-pref-mode ${joinModes.includes(mode) ? 'is-on' : ''}" data-sq-join-mode="${mode}" aria-pressed="${joinModes.includes(mode)}">${modeLabel(mode)}</button>`).join('')}<button type="button" class="smart-pref-mode ${joinModes.length === SMART_QUEUE_MODES.length ? 'is-on' : ''}" data-sq-join-any aria-pressed="${joinModes.length === SMART_QUEUE_MODES.length}">${anyGamePreferenceLabel(language())}</button></div></section>`;
  }

  function courtRoleLevel(role) {
    if (role === 'social') return '2.00–2.30';
    if (role === 'challenge') return '2.60+';
    return text('ALL LEVELS', 'ทุก Level');
  }

  function courtNumberFromMatch(match) {
    return Number(match?.courtNumber ?? match?.court_number)
      || Number(String(match?.courtId || match?.court_id || match?.courtName || match?.court_name || '').match(/\d+/)?.[0])
      || 0;
  }

  function courtProfile() {
    return buildMatchMakingCourtProfile(getCourtCount?.() || 1);
  }

  function isFallbackThisRound(court) {
    if (court.role === 'balanced') return false;
    return matches().some((match) => isActiveMatch(match)
      && courtNumberFromMatch(match) === court.courtNumber
      && String(match?.matchMode || match?.match_type || '') === 'smart_queue_balanced');
  }

  function courtProfileMarkup() {
    return `<section class="match-making-courts mt-3"><div class="smart-pref-title">${text('MATCH MAKING COURTS', 'คอร์ท MATCH MAKING')}</div><div class="match-making-court-grid mt-2">${courtProfile().map((court) => {
      const fallback = isFallbackThisRound(court);
      return `<div class="match-making-court ${court.role} ${fallback ? 'is-fallback' : ''}"><b>${text('Court', 'คอร์ท')} ${court.courtNumber}</b><span>${modeLabel(court.role)}${fallback ? ` → ${modeLabel('balanced')} ${text('THIS ROUND', 'รอบนี้')}` : ''}</span><small>${courtRoleLevel(court.role)}</small></div>`;
    }).join('')}</div></section>`;
  }

  function smartMatchMarkup(context = null) {
    if (!isSmartEvent()) return '';
    const available = context?.waitingCount ?? players().filter((player) => displayStatus(player) === 'waiting').length;
    const freeCourtCount = getAvailableCourts?.().length ?? Number(getCourtCount?.() || 0);
    return `<div class="cut card p-4 smart-match-control"><div class="flex items-start justify-between gap-3"><div><div class="smart-pref-title">${text('AUTOMATIC MATCHING', 'จับคู่อัตโนมัติ')}</div><h3 class="font-black text-cyan-300 mt-1">${text('Match by Court Level Profile', 'จับคู่ตาม Level ของคอร์ท')}</h3><p class="mini mt-1">${text(`${available} waiting · ${freeCourtCount} free courts`, `รอเล่น ${available} คน · ว่าง ${freeCourtCount} คอร์ท`)}</p></div><span class="smart-pref-badge">MATCH MAKING</span></div>${courtProfileMarkup()}<button id="generateSmartMatchBtn" class="cut bg-lime p-4 font-black text-black w-full mt-3" ${available < 4 || freeCourtCount < 1 ? 'disabled' : ''}>${text('GENERATE MATCHES', 'สร้างแมตช์ทั้งหมด')}</button><p class="mini mt-2">${text('Beginner and Challenge courts are filled first. Any specialist shortage becomes Mix Level for this round.', 'เติมคอร์ท Beginner และ Challenge ก่อน หากผู้เล่นไม่ครบ คอร์ทนั้นจะเป็น Mix Level เฉพาะรอบนี้')}</p></div>`;
  }

  function inlineEditor(player, context = null) {
    const id = playerId(player);
    if (!isSmartEvent() || editorPlayerId !== id) return '';
    const pref = preferenceFor(id, context);
    const modes = normalizeSmartQueueModes(pref.modes);
    const active = context?.activePlayerIds?.has(id) || matches().some((match) => isActiveMatch(match) && matchPlayerIds(match).includes(id));
    const level = Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 3);
    return `<div class="smart-inline-editor" data-sq-inline-editor="${id}" data-modes="${modes.join(',')}" data-status="${pref.status === 'rest' ? 'rest' : 'ready'}"><label class="smart-inline-field"><span>LEVEL</span><input type="number" min="1" max="6" step="0.01" inputmode="decimal" value="${level.toFixed(2)}" data-sq-inline-level></label><div><div class="smart-pref-title">${text('GAME PREFERENCES', 'รูปแบบเกมที่ต้องการ')}</div><div class="smart-pref-modes">${SMART_QUEUE_MODES.map((mode) => `<button type="button" class="smart-pref-mode ${modes.includes(mode) ? 'is-on' : ''}" data-sq-inline-mode="${mode}" aria-pressed="${modes.includes(mode)}">${modeLabel(mode)}</button>`).join('')}<button type="button" class="smart-pref-mode ${modes.length === SMART_QUEUE_MODES.length ? 'is-on' : ''}" data-sq-inline-any>${anyGamePreferenceLabel(language())}</button></div></div><div><div class="smart-pref-title">${text('QUEUE STATUS', 'สถานะคิว')}</div><div class="smart-inline-statuses"><button type="button" class="smart-pref-rest ${pref.status !== 'rest' ? 'is-on' : ''}" data-sq-inline-status="ready">${text('READY TO PLAY', 'พร้อมเล่น')}</button><button type="button" class="smart-pref-rest ${pref.status === 'rest' ? 'is-on' : ''}" data-sq-inline-status="rest">${text('WAIT', 'รอก่อน')}</button></div></div>${active ? `<p class="mini text-cyan-200">${text('Current Preview / Playing / Up Next reservation stays unchanged. Updates apply from the next match.', 'การจอง Preview / Playing / Up Next ปัจจุบันไม่เปลี่ยน ค่าใหม่มีผลจากแมตช์ถัดไป')}</p>` : ''}<div class="smart-inline-actions"><button type="button" class="cut btn bg-white/5" data-sq-inline-cancel>${text('CANCEL', 'ยกเลิก')}</button><button type="button" class="cut bg-lime text-black font-black" data-sq-inline-save>${text('SAVE', 'บันทึก')}</button></div></div>`;
  }

  async function refresh({ silent = false } = {}) {
    if (!isSmartEvent() || !event()?.id) { state = { preferences: [], schemaAvailable: true }; joinModes = []; return state; }
    try {
      state = String(event()?.environment || 'live') === 'test'
        ? { preferences: (await services.listTestSmartPreferences(event().id)).map(normalizePreference), schemaAvailable: true }
        : await store.load(event().id);
      state.preferences = (state.preferences || []).map(normalizePreference);
      return state;
    } catch (error) {
      console.error('Match Making preferences failed to load', error);
      if (!silent) showMessage?.(text(`Match Making could not load: ${error.message}`, `โหลด Match Making ไม่สำเร็จ: ${error.message}`));
      return state;
    }
  }

  function hydratePreferences(preferences = []) {
    state = { preferences: (preferences || []).map(normalizePreference), schemaAvailable: true };
    return state;
  }

  async function savePreference(id, patch, updatedBy = 'admin') {
    if (!isSmartEvent() || !event()?.id) return null;
    const current = preferenceFor(id);
    const modes = normalizeSmartQueueModes(patch.modes ?? current.modes);
    if (!modes.length) throw new Error(text('Choose at least one Game Preference.', 'เลือกอย่างน้อย 1 รูปแบบเกม'));
    const status = patch.status || current.status || 'ready';
    const payload = { eventId: event().id, organizationId: organizationId(), eventPlayerId: id, modes, preferredMode: patch.preferredMode ?? (modes.includes(current.preferredMode) ? current.preferredMode : modes[0]), status, readySince: status === 'ready' ? current.readySince || new Date().toISOString() : null, updatedBy };
    const saved = String(event()?.environment || 'live') === 'test' ? await services.saveTestSmartPreference(payload) : await store.savePreference(payload);
    const result = normalizePreference(saved?.preference || saved);
    state.preferences = [...state.preferences.filter((row) => String(row.eventPlayerId) !== String(id)), result];
    return result;
  }

  async function registerJoinedPlayer(player) {
    if (!isSmartEvent() || !player?.id) return;
    const modes = normalizeSmartQueueModes(joinModes);
    if (!modes.length) throw new Error(text('Choose at least one Game Preference for this Match Making event.', 'เลือกอย่างน้อย 1 รูปแบบเกมสำหรับ Match Making'));
    await savePreference(player.id, { modes, preferredMode: modes[0], status: 'ready' }, 'player');
    joinModes = [];
  }

  async function generateSmartMatches() {
    if (!isSmartEvent() || busy) return;
    const freeCourts = getAvailableCourts?.() || Array.from({ length: Number(getCourtCount?.() || 0) }, (_, index) => ({ id: `court-${index + 1}`, name: `Court ${index + 1}`, courtNumber: index + 1 }));
    if (!freeCourts.length) return showMessage?.(text('No court is available. Finish or cancel an active match first.', 'ไม่มีคอร์ทว่าง กรุณาจบหรือยกเลิกแมตช์ที่กำลังเล่นก่อน'));
    const result = generateMatchMakingCourtMatches({ players: players(), preferences: state.preferences, matches: matches(), courts: freeCourts, courtCount: getCourtCount?.() || freeCourts.length });
    if (!result.matches.length) return showMessage?.(text('No eligible group of four is ready yet.', 'ยังไม่มีผู้เล่นที่พร้อมครบ 4 คน'));
    busy = true;
    let created = 0;
    try {
      for (const generated of result.matches) {
        await services.createMatchPreview({ eventId: event().id, organizationId: organizationId(), courtId: generated.courtId, courtNumber: generated.courtNumber, courtName: generated.courtName, teamA: generated.teamA, teamB: generated.teamB, matchMode: `smart_queue_${generated.mode}`, fairnessScore: generated.score, idempotencyKey: `match-making:${event().id}:${generated.courtId}:${generated.playerIds.slice().sort().join('-')}:${Date.now()}` });
        created += 1;
      }
      await reloadCore?.({ render: 'organizer-matches' });
      if (String(event()?.environment || 'live') !== 'test') await refresh({ silent: true });
      const assigned = created * 4;
      const waiting = createRenderContext().waitingCount;
      showMessage?.(text(`${created} MATCHES READY · ${assigned} PLAYERS ASSIGNED · ${waiting} PLAYERS WAITING`, `พร้อม ${created} แมตช์ · จัดผู้เล่น ${assigned} คน · รอ ${waiting} คน`));
    } finally { busy = false; }
  }

  async function generateNextForCourt(court) {
    if (!isSmartEvent() || !court) return false;
    const result = generateMatchMakingCourtMatches({ players: players(), preferences: state.preferences, matches: matches(), courts: [court], courtCount: getCourtCount?.() || 1 });
    const generated = result.matches[0];
    if (!generated) return false;
    await services.createMatchNext({ eventId: event().id, organizationId: organizationId(), courtId: generated.courtId, courtNumber: generated.courtNumber, courtName: generated.courtName, teamA: generated.teamA, teamB: generated.teamB, matchMode: `smart_queue_${generated.mode}`, fairnessScore: generated.score });
    return true;
  }

  function rerenderQueue() { window.dispatchEvent(new CustomEvent('gdsq-smart-queue-change')); }

  document.addEventListener('click', (eventObject) => {
    const target = eventObject.target.closest('[data-sq-join-mode],[data-sq-join-any],[data-sq-edit],[data-sq-inline-mode],[data-sq-inline-any],[data-sq-inline-status],[data-sq-inline-save],[data-sq-inline-cancel],#generateSmartMatchBtn');
    if (!target || busy) return;
    if (target.id === 'generateSmartMatchBtn') return void generateSmartMatches().catch((error) => showMessage?.(error.message));
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
    if (target.dataset.sqEdit) { editorPlayerId = editorPlayerId === target.dataset.sqEdit ? '' : target.dataset.sqEdit; rerenderQueue(); return; }
    const editor = target.closest('[data-sq-inline-editor]');
    if (!editor) return;
    if (target.hasAttribute('data-sq-inline-cancel')) { editorPlayerId = ''; rerenderQueue(); return; }
    if (target.dataset.sqInlineMode || target.hasAttribute('data-sq-inline-any')) {
      const currentModes = normalizeSmartQueueModes(editor.dataset.modes.split(',').filter(Boolean));
      const modes = target.hasAttribute('data-sq-inline-any') ? SMART_QUEUE_MODES.slice() : currentModes.includes(target.dataset.sqInlineMode) ? currentModes.filter((mode) => mode !== target.dataset.sqInlineMode) : [...currentModes, target.dataset.sqInlineMode];
      editor.dataset.modes = modes.join(',');
      SMART_QUEUE_MODES.forEach((mode) => { const button = editor.querySelector(`[data-sq-inline-mode="${mode}"]`); button?.classList.toggle('is-on', modes.includes(mode)); button?.setAttribute('aria-pressed', String(modes.includes(mode))); });
      editor.querySelector('[data-sq-inline-any]')?.classList.toggle('is-on', modes.length === SMART_QUEUE_MODES.length);
      return;
    }
    if (target.dataset.sqInlineStatus) {
      editor.dataset.status = target.dataset.sqInlineStatus;
      editor.querySelectorAll('[data-sq-inline-status]').forEach((button) => button.classList.toggle('is-on', button.dataset.sqInlineStatus === editor.dataset.status));
      return;
    }
    if (target.hasAttribute('data-sq-inline-save')) {
      const id = editor.dataset.sqInlineEditor;
      const level = Number(editor.querySelector('[data-sq-inline-level]')?.value);
      const modes = normalizeSmartQueueModes(editor.dataset.modes.split(',').filter(Boolean));
      if (!Number.isFinite(level) || level < 1 || level > 6) return void showMessage?.(text('Enter a Level from 1.00 to 6.00.', 'กรอก Level ตั้งแต่ 1.00 ถึง 6.00'));
      if (!modes.length) return void showMessage?.(text('Choose at least one Game Preference.', 'เลือกอย่างน้อย 1 รูปแบบเกม'));
      busy = true;
      Promise.all([services.updatePlayerLevel(event().id, id, level), savePreference(id, { modes, preferredMode: modes[0], status: editor.dataset.status })]).then(async () => {
        editorPlayerId = '';
        await reloadCore?.({ render: 'organizer' });
        showMessage?.(text('Player settings saved.', 'บันทึกข้อมูลผู้เล่นแล้ว'));
      }).catch((error) => {
        if (/passcode|unauthorized|401/i.test(String(error?.message || ''))) adminPasscode = '';
        showMessage?.(error.message);
      }).finally(() => { busy = false; rerenderQueue(); });
    }
  });

  return {
    refresh, hydratePreferences, isSmartEvent, joinPreferenceMarkup, smartMatchMarkup,
    hasJoinPreference: () => joinModes.length > 0,
    registerJoinedPlayer, generateNextForCourt, courtProfile, modeBadges, createRenderContext, displayStatus, preferenceFor, inlineEditor,
    isSmartMatch: (match) => String(match?.matchMode || match?.match_type || '').startsWith('smart_queue_'),
    matchMode: (match) => String(match?.matchMode || match?.match_type || '').replace(/^smart_queue_/, ''),
    editorButton: (player) => isSmartEvent() ? `<button type="button" class="cut smart-pref-edit" data-sq-edit="${playerId(player)}" aria-expanded="${editorPlayerId === playerId(player)}">${text('EDIT', 'แก้ไข')}</button>` : ''
  };
}
