import { normalizeSmartQueueModes, SMART_QUEUE_MODES } from '../logic/smartQueue/smartQueueEngine.js';
import { createSmartQueueStore } from '../services/smartQueueService.js';
import { gamePreferenceLabel, anyGamePreferenceLabel } from '../services/gamePreferenceLabels.js';

export function createSmartQueuePlayerUi({ services, supabase, getEvent, getPlayer, getMatches, showError }) {
  const store = createSmartQueueStore({ supabase, mode: services.mode });
  const root = document.createElement('section');
  root.id = 'playerSmartQueue';
  root.className = 'cut card p-5 mt-4 hidden';
  document.querySelector('main')?.append(root);
  let state = { enabled: false, schemaAvailable: null, preferences: [] };
  let busy = false;

  const language = () => localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'en' : 'th';
  const copy = (en, th) => language() === 'en' ? en : th;
  const event = () => getEvent?.();
  const player = () => getPlayer?.();
  const matches = () => getMatches?.() || [];
  const current = () => state.preferences.find((row) => String(row.eventPlayerId) === String(player()?.id));
  const isReserved = () => matches().some((match) => ['preview', 'assigned', 'playing', 'pending_score', 'queued_next'].includes(String(match?.status || '').toLowerCase())
    && [...(match?.teamA || []), ...(match?.teamB || [])].some((item) => String(item?.id || item?.eventPlayerId || item?.event_player_id || item) === String(player()?.id)));

  function render() {
    if (!(state.enabled || String(event()?.matchingMode || event()?.matching_mode || '') === 'smart_queue') || state.schemaAvailable === false || !event() || !player()) {
      root.classList.add('hidden');
      return;
    }
    root.classList.remove('hidden');
    const preference = current() || { modes: ['balanced'], preferredMode: 'balanced', status: 'rest' };
    const modes = normalizeSmartQueueModes(preference.modes);
    const statusLabel = preference.status === 'ready' ? copy('READY TO PLAY', 'พร้อมเล่น') : copy('WAIT', 'รอก่อน');
    root.innerHTML = `<div class="flex justify-between gap-3 items-start"><div><div class="smart-queue-kicker">GAME PREFERENCES</div><h2 class="text-2xl font-black lime">MATCH MAKING</h2><p class="mini mt-1">${copy('Choose every game type you accept. Match Making chooses the court, teammate, and opponents.', 'เลือกรูปแบบเกมที่รับได้ ระบบจะเลือกคอร์ท คู่ทีม และคู่แข่งให้')}</p></div><span class="pill ${preference.status === 'ready' ? 'pill-ready' : 'pill-rest'}">${statusLabel}</span></div><div class="smart-queue-modes mt-4">${SMART_QUEUE_MODES.map((mode) => `<button class="smart-queue-mode ${modes.includes(mode) ? 'is-on' : ''}" data-player-sq-mode="${mode}" aria-pressed="${modes.includes(mode)}">${gamePreferenceLabel(mode, language())}</button>`).join('')}<button class="smart-queue-mode ${modes.length === 3 ? 'is-on' : ''}" data-player-sq-any>${anyGamePreferenceLabel(language())}</button></div><div class="smart-queue-statuses mt-3"><button class="smart-queue-status ${preference.status === 'ready' ? 'is-on' : ''}" data-player-sq-status="ready">${copy('READY TO PLAY', 'พร้อมเล่น')}</button><button class="smart-queue-status ${preference.status === 'rest' ? 'is-on' : ''}" data-player-sq-status="rest">${copy('WAIT', 'รอก่อน')}</button></div>${isReserved() ? `<p class="mini mt-3 text-cyan-200">${copy('Your current Preview / Playing / Up Next reservation stays unchanged. WAIT applies after it.', 'การจอง Preview / Playing / Up Next ปัจจุบันยังคงอยู่ สถานะรอจะมีผลหลังจากนั้น')}</p>` : ''}`;
  }

  async function save(patch) {
    const eventRow = event();
    const playerRow = player();
    if (!eventRow || !playerRow) return;
    const preference = current() || { modes: ['balanced'], preferredMode: 'balanced', status: 'rest' };
    const modes = normalizeSmartQueueModes(patch.modes ?? preference.modes);
    const result = await store.savePreference({
      eventId: eventRow.id,
      organizationId: eventRow.organizationId || eventRow.organization_id || '00000000-0000-4000-8000-000000000001',
      eventPlayerId: playerRow.id,
      modes,
      preferredMode: patch.preferredMode ?? preference.preferredMode,
      status: patch.status || preference.status,
      readySince: patch.status === 'ready' ? new Date().toISOString() : preference.readySince,
      updatedBy: 'player'
    });
    state.preferences = [...state.preferences.filter((row) => String(row.eventPlayerId) !== String(playerRow.id)), result];
    render();
  }

  async function refresh() {
    if (busy || !event()?.id || !player()?.id) return;
    busy = true;
    try {
      state = await store.load(event().id);
      render();
    } catch (error) {
      console.error('Player Match Making failed', error);
      showError?.(copy(`Match Making failed: ${error.message}`, `Match Making มีปัญหา: ${error.message}`));
    } finally {
      busy = false;
    }
  }

  root.addEventListener('click', (eventObject) => {
    if (busy) return;
    const modeButton = eventObject.target.closest('[data-player-sq-mode]');
    const anyButton = eventObject.target.closest('[data-player-sq-any]');
    const statusButton = eventObject.target.closest('[data-player-sq-status]');
    if (!modeButton && !anyButton && !statusButton) return;
    const preference = current() || { modes: ['balanced'], preferredMode: 'balanced', status: 'rest' };
    let task;
    if (anyButton) task = save({ modes: SMART_QUEUE_MODES.slice(), preferredMode: preference.preferredMode || 'balanced' });
    else if (modeButton) {
      const mode = modeButton.dataset.playerSqMode;
      const modes = preference.modes.includes(mode) ? preference.modes.filter((value) => value !== mode) : [...preference.modes, mode];
      task = save({ modes, preferredMode: modes.includes(preference.preferredMode) ? preference.preferredMode : modes[0] });
    } else task = save({ status: statusButton.dataset.playerSqStatus });
    busy = true;
    Promise.resolve(task).catch((error) => showError?.(error.message)).finally(() => { busy = false; });
  });

  document.addEventListener('click', (eventObject) => {
    if (eventObject.target.closest('#playerLanguageToggle')) setTimeout(render, 0);
  });

  let initialAttempts = 0;
  const initialTimer = setInterval(() => {
    initialAttempts += 1;
    if (event()?.id && player()?.id) {
      clearInterval(initialTimer);
      refresh();
    } else if (initialAttempts >= 20) clearInterval(initialTimer);
  }, 500);
  setInterval(refresh, 7000);
  return { refresh, render };
}
