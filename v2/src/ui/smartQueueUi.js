import { generateSmartQueueMatch, normalizeSmartQueueModes, SMART_QUEUE_MODES } from '../logic/smartQueue/smartQueueEngine.js';
import { createSmartQueueStore } from '../services/smartQueueService.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function itemId(value) {
  return String(typeof value === 'string' ? value : value?.id || value?.eventPlayerId || value?.event_player_id || '');
}

function matchPlayerIds(match) {
  return [...(match?.teamA || match?.team_a || []), ...(match?.teamB || match?.team_b || [])].map(itemId).filter(Boolean);
}

function statusOf(value) {
  return String(value || '').toLowerCase();
}

function modeLabel(mode) {
  return ({ social: 'SOCIAL', balanced: 'BALANCED', challenge: 'CHALLENGE' })[mode] || mode;
}

export function createSmartQueueUi({ root, services, supabase, getEvent, getPlayers, getMatches, getCourtCount, reloadCore, showMessage }) {
  let adminPasscode = '';
  const requestAdminPasscode = () => {
    if (adminPasscode) return adminPasscode;
    adminPasscode = window.prompt(localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'Enter Admin passcode for Smart Queue' : 'กรอกรหัส Admin สำหรับ Smart Queue') || '';
    return adminPasscode;
  };
  const store = createSmartQueueStore({ supabase, mode: services.mode, getAdminPasscode: requestAdminPasscode });
  let state = { enabled: false, schemaAvailable: null, preferences: [], matches: [] };
  let busy = false;

  const language = () => localStorage.getItem('gdsq_v2_ui_lang') === 'en' ? 'en' : 'th';
  const copy = (en, th) => language() === 'en' ? en : th;
  const event = () => getEvent?.() || null;
  const players = () => getPlayers?.() || [];
  const matches = () => getMatches?.() || [];
  const preferenceMap = () => new Map(state.preferences.map((row) => [String(row.eventPlayerId), row]));
  const playerById = (id) => players().find((player) => String(player.id) === String(id));
  const playerName = (player) => player?.displayName || player?.display_name || player?.nickname || player?.name || 'Player';
  const playerLevel = (player) => Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 0).toFixed(2);
  const organizationId = () => event()?.organizationId || event()?.organization_id || '00000000-0000-4000-8000-000000000001';
  const currentMeta = () => new Map(state.matches.map((row) => [String(row.matchId), row]));
  const activeStatuses = new Set(['preview', 'assigned', 'playing', 'pending_score']);

  function activeMatches() {
    return matches().filter((match) => activeStatuses.has(statusOf(match.status)));
  }

  function courtNumber(match) {
    return Number(match?.courtNumber || match?.court_number || String(match?.courtId || match?.courtName || '').match(/\d+/)?.[0]) || 0;
  }

  function availableCourts() {
    const used = new Set(activeMatches().map(courtNumber));
    return Array.from({ length: Math.max(1, Math.min(10, Number(getCourtCount?.() || event()?.courtCount || event()?.court_count || 4))) }, (_, index) => index + 1)
      .filter((number) => !used.has(number));
  }

  function smartMatches() {
    const meta = currentMeta();
    return matches().filter((match) => meta.has(String(match.id))).map((match) => ({ match, meta: meta.get(String(match.id)) }));
  }

  async function savePreference(playerId, patch, updatedBy = 'admin') {
    const current = preferenceMap().get(String(playerId));
    const modes = normalizeSmartQueueModes(patch.modes ?? current?.modes ?? []);
    const status = patch.status || current?.status || 'rest';
    const result = await store.savePreference({
      eventId: event().id,
      organizationId: organizationId(),
      eventPlayerId: playerId,
      modes,
      preferredMode: patch.preferredMode ?? current?.preferredMode,
      status,
      readySince: status === 'ready' ? patch.readySince || current?.readySince : null,
      updatedBy
    });
    state.preferences = [...state.preferences.filter((row) => String(row.eventPlayerId) !== String(playerId)), result];
    return result;
  }

  async function setPlayersStatus(playerIds, status) {
    await Promise.all(playerIds.map((id) => savePreference(id, { status, readySince: status === 'ready' ? new Date().toISOString() : null }, 'system')));
  }

  async function reconcile() {
    const prefs = preferenceMap();
    for (const { match, meta } of smartMatches()) {
      const status = statusOf(match.status);
      const expected = status === 'playing' || status === 'pending_score' ? 'playing'
        : status === 'confirmed' || status === 'completed' ? 'confirmed'
          : status === 'cancelled' || status === 'deleted' ? 'cancelled'
            : 'match_ready';
      if (meta.state !== expected) {
        const updated = await store.setMatchState(meta, expected);
        state.matches = state.matches.map((row) => String(row.matchId) === String(updated.matchId) ? updated : row);
      }
      if (expected === 'confirmed' || expected === 'cancelled') {
        const stale = matchPlayerIds(match).filter((id) => ['playing', 'match_ready'].includes(prefs.get(id)?.status));
        if (stale.length) await setPlayersStatus(stale, 'ready');
      }
    }
  }

  function queueCounts() {
    const prefs = preferenceMap();
    const active = new Set(activeMatches().flatMap(matchPlayerIds));
    return Object.fromEntries(SMART_QUEUE_MODES.map((mode) => [mode, players().filter((player) => {
      const preference = prefs.get(String(player.id));
      return preference?.status === 'ready' && preference.modes.includes(mode) && !active.has(String(player.id));
    }).length]));
  }

  function renderHeader() {
    return `<div class="smart-queue-head"><div><div class="smart-queue-kicker">EXPERIMENTAL MODULE</div><h2>GDSQ SMART QUEUE</h2><p class="mini mt-1">${copy('Optional match grouping by level, preferences, waiting fairness, and variety.', 'ระบบทดลองจัดกลุ่มจากระดับ โหมดที่รับได้ เวลารอ และความหลากหลาย')}</p></div><div class="smart-queue-actions"><button class="smart-queue-toggle ${state.enabled ? 'bg-lime text-black' : 'btn bg-white/5'}" data-sq-toggle type="button" aria-pressed="${state.enabled}">${state.enabled ? 'ON' : 'OFF'}</button><button class="btn bg-white/5" data-sq-refresh type="button">${copy('REFRESH', 'รีเฟรช')}</button></div></div>`;
  }

  function renderModeCounts() {
    const counts = queueCounts();
    return `<div class="smart-queue-mode-counts">${SMART_QUEUE_MODES.map((mode) => `<div class="smart-queue-mode-count"><span class="smart-queue-${mode} font-black">${modeLabel(mode)}</span><b>${counts[mode]}</b><span class="mini">${copy('eligible', 'พร้อมในโหมดนี้')}</span></div>`).join('')}</div>`;
  }

  function renderCourts() {
    const meta = currentMeta();
    const activeByCourt = new Map(activeMatches().map((match) => [courtNumber(match), { match, meta: meta.get(String(match.id)) }]));
    const count = Math.max(1, Math.min(10, Number(getCourtCount?.() || event()?.courtCount || event()?.court_count || 4)));
    return `<div class="smart-queue-courts">${Array.from({ length: count }, (_, index) => index + 1).map((number) => {
      const active = activeByCourt.get(number);
      const mode = active?.meta?.playMode;
      return `<div class="smart-queue-court ${active ? 'is-playing' : 'is-available'}"><b>${copy('COURT', 'คอร์ท')} ${number}</b><div class="mini mt-1">${active ? `${statusOf(active.match.status).toUpperCase()}${mode ? ` · ${modeLabel(mode)}` : ''}` : copy('AVAILABLE', 'ว่าง')}</div></div>`;
    }).join('')}</div>`;
  }

  function teamNames(team) {
    return team.map((id) => playerName(playerById(itemId(id)))).join(' + ');
  }

  function renderSmartMatch(match, meta) {
    const status = statusOf(match.status);
    const canStart = status === 'preview';
    const canScore = status === 'playing' || status === 'pending_score';
    return `<div class="smart-queue-match"><div class="flex justify-between gap-3"><div><b>${copy('COURT', 'คอร์ท')} ${courtNumber(match)}</b><div class="smart-queue-${meta.playMode} text-xs font-black mt-1">${modeLabel(meta.playMode)}</div></div><span class="pill ${canStart ? 'pill-draft' : canScore ? 'pill-playing' : 'pill-ended'}">${status.toUpperCase()}</span></div><div class="smart-queue-versus"><div class="smart-queue-team"><span class="mini">TEAM A</span><b>${escapeHtml(teamNames(match.teamA || []))}</b></div><span class="font-black text-center">VS</span><div class="smart-queue-team"><span class="mini">TEAM B</span><b>${escapeHtml(teamNames(match.teamB || []))}</b></div></div>${canScore ? `<div class="smart-queue-score"><input type="number" min="0" max="99" inputmode="numeric" placeholder="A" data-sq-score-a="${match.id}"><input type="number" min="0" max="99" inputmode="numeric" placeholder="B" data-sq-score-b="${match.id}"></div>` : ''}<div class="smart-queue-actions mt-3">${canStart ? `<button class="bg-orange-400 text-black" data-sq-start="${match.id}">${copy('START MATCH', 'เริ่มแมตช์')}</button><button class="btn bg-white/5" data-sq-cancel="${match.id}">${copy('CANCEL', 'ยกเลิก')}</button>` : ''}${canScore ? `<button class="bg-lime text-black" data-sq-confirm="${match.id}">${copy('CONFIRM RESULT', 'ยืนยันผล')}</button>` : ''}</div></div>`;
  }

  function renderNextMatches() {
    const rows = smartMatches().filter(({ match }) => activeStatuses.has(statusOf(match.status)));
    if (!rows.length) return `<div class="smart-queue-disabled"><b>${copy('No Smart Queue match is ready.', 'ยังไม่มีแมตช์ Smart Queue')}</b><p class="mini mt-2">${copy('Generate one when at least four compatible players and a court are available.', 'สร้างได้เมื่อมีผู้เล่นที่เข้ากันอย่างน้อย 4 คนและมีคอร์ทว่าง')}</p><button class="smart-queue-status bg-lime text-black mt-4" data-sq-generate ${state.enabled ? '' : 'disabled'}>${copy('GENERATE MATCH READY', 'สร้าง MATCH READY')}</button></div>`;
    return `<div class="smart-queue-next">${rows.map(({ match, meta }) => renderSmartMatch(match, meta)).join('')}</div>`;
  }

  function playerControls(player) {
    const preference = preferenceMap().get(String(player.id)) || { modes: [], preferredMode: null, status: 'rest' };
    const modes = normalizeSmartQueueModes(preference.modes);
    const preferredOptions = modes.map((mode) => `<option value="${mode}" ${preference.preferredMode === mode ? 'selected' : ''}>${modeLabel(mode)}</option>`).join('');
    const avatar = player.avatarUrl || player.avatar_url;
    return `<div class="smart-queue-player"><div class="smart-queue-player-main">${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(playerName(player))}">` : '<div class="smart-queue-avatar"></div>'}<div class="min-w-0"><b class="block truncate">${escapeHtml(playerName(player))}</b><span class="mini">Level ${playerLevel(player)} · ${String(preference.status || 'rest').toUpperCase()}</span></div></div><div class="smart-queue-player-controls"><div class="smart-queue-modes">${SMART_QUEUE_MODES.map((mode) => `<button class="smart-queue-mode ${modes.includes(mode) ? 'is-on' : ''}" data-sq-mode="${mode}" data-player-id="${player.id}" aria-pressed="${modes.includes(mode)}">${modeLabel(mode)}</button>`).join('')}<button class="smart-queue-mode ${modes.length === 3 ? 'is-on' : ''}" data-sq-any data-player-id="${player.id}">ANY GAME</button></div><div class="smart-queue-statuses"><button class="smart-queue-status ${preference.status === 'ready' ? 'is-on' : ''}" data-sq-status="ready" data-player-id="${player.id}">READY</button><button class="smart-queue-status ${preference.status === 'rest' ? 'is-on' : ''}" data-sq-status="rest" data-player-id="${player.id}">REST</button><select class="smart-queue-preferred" data-sq-preferred data-player-id="${player.id}" ${modes.length ? '' : 'disabled'}><option value="">${copy('Preferred mode', 'โหมดที่ต้องการ')}</option>${preferredOptions}</select></div></div></div>`;
  }

  function render() {
    if (!root) return;
    const navigationButton = document.getElementById('tabBtn-smart-queue');
    if (navigationButton) navigationButton.textContent = copy('Smart Queue', 'สมาร์ตคิว');
    if (!event()) {
      root.innerHTML = `${renderHeader()}<div class="smart-queue-disabled">${copy('Select an event first.', 'กรุณาเลือกอีเว้นท์ก่อน')}</div>`;
      return;
    }
    if (state.schemaAvailable === false) {
      root.innerHTML = `${renderHeader()}<div class="smart-queue-disabled smart-queue-warning"><b>${copy('Smart Queue database migration is not installed yet.', 'ยังไม่ได้ติดตั้งฐานข้อมูล Smart Queue')}</b><p class="mini mt-2">${copy('The existing V2 system is unaffected and Smart Queue remains OFF.', 'ระบบ V2 เดิมยังทำงานปกติ และ Smart Queue ยังคงปิดอยู่')}</p></div>`;
      return;
    }
    const playerRows = players().filter((player) => !['removed', 'deleted'].includes(statusOf(player.status)));
    root.innerHTML = `${renderHeader()}${state.enabled ? `<div class="smart-queue-grid"><div class="smart-queue-panel"><h3>${copy('NEXT MATCH', 'แมตช์ถัดไป')}</h3>${renderNextMatches()}</div><div class="grid gap-3"><div class="smart-queue-panel"><h3>${copy('QUEUE', 'คิว')}</h3>${renderModeCounts()}</div><div class="smart-queue-panel"><h3>${copy('COURTS', 'คอร์ท')}</h3>${renderCourts()}</div></div></div><div class="smart-queue-panel"><div class="flex justify-between gap-3 items-end"><div><h3>${copy('PLAYER PREFERENCES', 'โหมดการเล่นของผู้เล่น')}</h3><p class="mini mt-1">${copy('Admin and player update the same Smart Queue record.', 'Admin และผู้เล่นแก้ข้อมูล Smart Queue ชุดเดียวกัน')}</p></div><span class="pill pill-draft">${playerRows.length} PLAYERS</span></div><div class="smart-queue-player-list">${playerRows.map(playerControls).join('') || `<div class="mini">${copy('No players.', 'ยังไม่มีผู้เล่น')}</div>`}</div></div>` : `<div class="smart-queue-disabled"><b>${copy('Smart Queue is OFF', 'Smart Queue ปิดอยู่')}</b><p class="mini mt-2">${copy('Auto Match, Manual Match, and the existing Queue continue unchanged.', 'Auto Match, Manual Match และ Queue เดิมทำงานเหมือนเดิม')}</p></div>`}`;
  }

  async function refresh({ silent = false, force = false } = {}) {
    if ((!force && busy) || !event()) {
      render();
      return;
    }
    busy = true;
    try {
      state = await store.load(event().id);
      if (state.schemaAvailable && state.enabled) await reconcile();
      render();
    } catch (error) {
      console.error('Smart Queue refresh failed', error);
      if (!silent) showMessage?.(copy(`Smart Queue failed: ${error.message}`, `Smart Queue มีปัญหา: ${error.message}`));
    } finally {
      busy = false;
    }
  }

  async function toggleEnabled() {
    if (!event() || state.schemaAvailable === false) return;
    state.enabled = await store.setEnabled({ eventId: event().id, organizationId: organizationId(), enabled: !state.enabled });
    showMessage?.(state.enabled ? copy('Smart Queue enabled.', 'เปิด Smart Queue แล้ว') : copy('Smart Queue disabled. Existing V2 is unchanged.', 'ปิด Smart Queue แล้ว ระบบ V2 เดิมไม่เปลี่ยน'));
    await refresh({ silent: true, force: true });
  }

  async function toggleMode(playerId, mode, any = false) {
    const current = preferenceMap().get(String(playerId));
    let modes = normalizeSmartQueueModes(current?.modes || []);
    modes = any ? SMART_QUEUE_MODES.slice() : modes.includes(mode) ? modes.filter((value) => value !== mode) : [...modes, mode];
    await savePreference(playerId, { modes, preferredMode: modes.includes(current?.preferredMode) ? current.preferredMode : modes[0], status: current?.status || 'ready' });
    render();
  }

  async function generateMatchReady() {
    if (!state.enabled || !event()) return;
    const court = availableCourts()[0];
    if (!court) return showMessage?.(copy('No court is available.', 'ไม่มีคอร์ทว่าง'));
    const result = generateSmartQueueMatch({ players: players(), preferences: state.preferences, matches: matches() });
    if (!result.match) return showMessage?.(copy('No compatible group of four is ready yet.', 'ยังไม่พบผู้เล่น 4 คนที่โหมดและระดับเข้ากัน'));
    const idempotencyKey = `smart-queue:${event().id}:${court}:${result.match.playerIds.slice().sort().join('-')}:${Date.now()}`;
    const preview = await services.createMatchPreview({
      eventId: event().id,
      organizationId: organizationId(),
      courtId: `court-${court}`,
      courtNumber: court,
      courtName: `Court ${court}`,
      teamA: result.match.teamA,
      teamB: result.match.teamB,
      matchMode: `smart_queue_${result.match.mode}`,
      fairnessScore: result.match.score,
      idempotencyKey
    });
    await store.recordMatch({ matchId: preview.id, eventId: event().id, organizationId: organizationId(), courtNumber: court, playMode: result.match.mode, state: 'match_ready' });
    await setPlayersStatus(result.match.playerIds, 'match_ready');
    await reloadCore?.();
    await refresh({ silent: true, force: true });
    showMessage?.(copy('Smart Queue MATCH READY created.', 'สร้าง Smart Queue MATCH READY แล้ว'));
  }

  async function start(matchId) {
    const meta = currentMeta().get(String(matchId));
    const match = matches().find((row) => String(row.id) === String(matchId));
    if (!meta || !match) return;
    await services.startMatch(matchId, { eventId: event().id });
    await setPlayersStatus(matchPlayerIds(match), 'playing');
    await store.setMatchState(meta, 'playing');
    await reloadCore?.();
    await refresh({ silent: true, force: true });
  }

  async function cancel(matchId) {
    const meta = currentMeta().get(String(matchId));
    const match = matches().find((row) => String(row.id) === String(matchId));
    if (!meta || !match) return;
    await services.cancelMatch(matchId, { eventId: event().id, reason: 'smart_queue_cancelled' });
    await setPlayersStatus(matchPlayerIds(match), 'ready');
    await store.setMatchState(meta, 'cancelled');
    await reloadCore?.();
    await refresh({ silent: true, force: true });
  }

  async function confirm(matchId) {
    const meta = currentMeta().get(String(matchId));
    const match = matches().find((row) => String(row.id) === String(matchId));
    const scoreA = Number(root.querySelector(`[data-sq-score-a="${matchId}"]`)?.value);
    const scoreB = Number(root.querySelector(`[data-sq-score-b="${matchId}"]`)?.value);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA > 99 || scoreB > 99 || scoreA === scoreB) return showMessage?.(copy('Enter different whole-number scores from 0 to 99.', 'กรอกคะแนนจำนวนเต็ม 0-99 และคะแนนต้องไม่เท่ากัน'));
    await services.confirmScore(matchId, { eventId: event().id, teamAScore: scoreA, teamBScore: scoreB });
    await setPlayersStatus(matchPlayerIds(match), 'ready');
    await store.setMatchState(meta, 'confirmed');
    await reloadCore?.();
    await refresh({ silent: true, force: true });
    showMessage?.(copy('Result confirmed through existing Match History.', 'ยืนยันผลผ่าน Match History เดิมแล้ว'));
  }

  root?.addEventListener('click', (eventObject) => {
    const target = eventObject.target.closest('[data-sq-toggle],[data-sq-refresh],[data-sq-generate],[data-sq-mode],[data-sq-any],[data-sq-status],[data-sq-start],[data-sq-cancel],[data-sq-confirm]');
    if (!target || busy) return;
    const task = target.hasAttribute('data-sq-toggle') ? toggleEnabled()
      : target.hasAttribute('data-sq-refresh') ? refresh()
        : target.hasAttribute('data-sq-generate') ? generateMatchReady()
          : target.hasAttribute('data-sq-mode') ? toggleMode(target.dataset.playerId, target.dataset.sqMode)
            : target.hasAttribute('data-sq-any') ? toggleMode(target.dataset.playerId, '', true)
              : target.hasAttribute('data-sq-status') ? savePreference(target.dataset.playerId, { status: target.dataset.sqStatus }).then(render)
                : target.hasAttribute('data-sq-start') ? start(target.dataset.sqStart)
                  : target.hasAttribute('data-sq-cancel') ? cancel(target.dataset.sqCancel)
                    : confirm(target.dataset.sqConfirm);
    busy = true;
    Promise.resolve(task).catch((error) => {
      console.error('Smart Queue action failed', error);
      if (/passcode|401|unauthorized/i.test(String(error?.message || ''))) adminPasscode = '';
      showMessage?.(copy(`Smart Queue action failed: ${error.message}`, `Smart Queue ทำรายการไม่สำเร็จ: ${error.message}`));
    }).finally(() => { busy = false; });
  });

  root?.addEventListener('change', (eventObject) => {
    const select = eventObject.target.closest('[data-sq-preferred]');
    if (!select || busy) return;
    busy = true;
    savePreference(select.dataset.playerId, { preferredMode: select.value }).then(render).catch((error) => showMessage?.(error.message)).finally(() => { busy = false; });
  });

  window.addEventListener('gdsq-language-change', render);
  setInterval(() => {
    if (!root?.classList.contains('hidden')) refresh({ silent: true });
  }, 8000);

  return { refresh, render };
}
