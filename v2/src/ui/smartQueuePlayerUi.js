import { normalizeSmartQueueModes, SMART_QUEUE_MODES } from '../logic/smartQueue/smartQueueEngine.js';
import { createSmartQueueStore } from '../services/smartQueueService.js';

function modeLabel(mode, language) {
  const labels = language === 'en'
    ? { social: 'BEGINNER', balanced: 'MIXED LEVEL', challenge: 'CHALLENGE' }
    : { social: 'ผู้เริ่มต้น', balanced: 'คละระดับ', challenge: 'ท้าทาย' };
  return labels[mode] || mode;
}

export function createSmartQueuePlayerUi({ services, supabase, getEvent, getPlayer, showError }) {
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
  const current = () => state.preferences.find((row) => String(row.eventPlayerId) === String(player()?.id));

  function render() {
    if (!(state.enabled || String(event()?.matchingMode || event()?.matching_mode || '') === 'smart_queue') || state.schemaAvailable === false || !event() || !player()) {
      root.classList.add('hidden');
      return;
    }
    root.classList.remove('hidden');
    const preference = current() || { modes: ['balanced'], preferredMode: 'balanced', status: 'rest' };
    const modes = normalizeSmartQueueModes(preference.modes);
    root.innerHTML = `<div class="flex justify-between gap-3 items-start"><div><div class="smart-queue-kicker">GAME PREFERENCES</div><h2 class="text-2xl font-black lime">GDSQ MATCH MAKING</h2><p class="mini mt-1">${copy('Choose every game style you accept. Your organizer sees the same settings.', 'เลือกได้หลายรูปแบบ ข้อมูลชุดเดียวกันจะอัปเดตไปที่หน้าผู้จัด')}</p></div><span class="pill ${preference.status === 'ready' ? 'pill-ready' : preference.status === 'playing' ? 'pill-playing' : 'pill-rest'}">${String(preference.status || 'rest').toUpperCase()}</span></div><div class="smart-queue-modes mt-4">${SMART_QUEUE_MODES.map((mode) => `<button class="smart-queue-mode ${modes.includes(mode) ? 'is-on' : ''}" data-player-sq-mode="${mode}" aria-pressed="${modes.includes(mode)}">${modeLabel(mode, language())}</button>`).join('')}<button class="smart-queue-mode ${modes.length === 3 ? 'is-on' : ''}" data-player-sq-any>${copy('ANY GAME', 'ทุกแบบ')}</button></div><div class="grid sm:grid-cols-[1fr_auto] gap-2 mt-3"><select class="smart-queue-preferred" data-player-sq-preferred ${modes.length ? '' : 'disabled'}><option value="">${copy('Preferred game', 'รูปแบบที่อยากเล่นที่สุด')}</option>${modes.map((mode) => `<option value="${mode}" ${preference.preferredMode === mode ? 'selected' : ''}>${modeLabel(mode, language())}</option>`).join('')}</select><div class="smart-queue-statuses"><button class="smart-queue-status ${preference.status === 'ready' ? 'is-on' : ''}" data-player-sq-status="ready">READY</button><button class="smart-queue-status ${preference.status === 'rest' ? 'is-on' : ''}" data-player-sq-status="rest">REST</button></div></div>`;
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

  root.addEventListener('change', (eventObject) => {
    const select = eventObject.target.closest('[data-player-sq-preferred]');
    if (!select || busy) return;
    busy = true;
    save({ preferredMode: select.value }).catch((error) => showError?.(error.message)).finally(() => { busy = false; });
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
