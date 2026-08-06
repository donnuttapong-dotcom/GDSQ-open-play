function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

export function mountAdminResultsTab({ services }) {
  const root = document.getElementById('tab-admin');
  if (!root) return;
  let events = [];
  let eventId = '';

  function message(text, error = false) {
    const node = root.querySelector('#adminResultMessage');
    if (!node) return;
    node.textContent = text;
    node.className = `mt-3 rounded-lg border p-3 text-sm ${error ? 'border-red-300/40 bg-red-300/10 text-red-100' : 'border-lime-300/40 bg-lime-300/10 text-lime-100'}`;
  }

  async function renderMatches() {
    const list = root.querySelector('#adminMatchList');
    if (!list || !eventId) return;
    list.innerHTML = '<p class="mini">กำลังโหลดผลการแข่งขัน...</p>';
    const [players, matches] = await Promise.all([services.listEventPlayers(eventId), services.listEventMatches(eventId)]);
    const names = new Map(players.map((player) => [String(player.id), player.displayName || player.display_name || player.nickname || 'Player']));
    const confirmed = matches.filter((match) => String(match.status).toLowerCase() === 'confirmed');
    list.innerHTML = confirmed.length ? confirmed.map((match) => {
      const team = (key) => (match[key] || []).map((item) => names.get(String(item?.id || item)) || item?.displayName || item).join(' / ');
      return `<article class="soft p-4"><b>${esc(match.courtName || 'Court')}</b><p class="mini mt-1">${esc(team('teamA'))} vs ${esc(team('teamB'))}</p><div class="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center mt-3 max-w-md"><input data-score-a="${match.id}" class="rounded-lg border p-3 text-center" type="number" min="0" max="99" value="${Number(match.teamAScore)}"><b>:</b><input data-score-b="${match.id}" class="rounded-lg border p-3 text-center" type="number" min="0" max="99" value="${Number(match.teamBScore)}"><button data-save-score="${match.id}" class="cut bg-lime text-black p-3 font-black">บันทึก</button></div></article>`;
    }).join('') : '<p class="mini">ยังไม่มีผลที่ยืนยันแล้ว</p>';
  }

  async function render() {
    const user = await services.getAuthenticatedPlayer();
    if (!user) {
      root.innerHTML = '<div class="cut card p-5"><p class="kicker">ADMIN RESULTS</p><h2 class="text-2xl font-black">Admin</h2><p class="mini mt-2">กรุณา Sign in ก่อนใช้งานหน้าแก้ไขผลการแข่งขัน</p><a class="cut bg-lime text-black inline-block p-3 mt-4 font-black" href="./my-profile.html?mode=supabase">SIGN IN</a></div>';
      return;
    }
    events = await services.listEvents();
    eventId = eventId || events[0]?.id || '';
    root.innerHTML = `<div class="space-y-4"><div class="cut card p-5"><p class="kicker">ADMIN RESULTS</p><h2 class="text-2xl font-black">Admin</h2><p class="mini mt-1">${esc(user.email)} · แก้เฉพาะคะแนนผลที่ยืนยันแล้ว ไม่มีการลบประวัติ</p><p id="adminResultMessage" class="hidden"></p></div><div class="cut card p-5"><label class="text-xs text-slate-400">เลือก Event<select id="adminEventSelect" class="w-full rounded-lg border p-3 mt-1">${events.map((event) => `<option value="${event.id}" ${String(event.id) === String(eventId) ? 'selected' : ''}>${esc(event.name || 'Untitled Event')}</option>`).join('')}</select></label><div id="adminMatchList" class="grid gap-3 mt-4"></div></div></div>`;
    root.querySelector('#adminEventSelect').addEventListener('change', async (event) => { eventId = event.target.value; await renderMatches(); });
    root.querySelector('#adminMatchList').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-save-score]');
      if (!button) return;
      const id = button.dataset.saveScore;
      const a = Number(root.querySelector(`[data-score-a="${id}"]`).value);
      const b = Number(root.querySelector(`[data-score-b="${id}"]`).value);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99 || a === b) return message('คะแนนต้องเป็นจำนวนเต็ม 0-99 และห้ามเสมอ', true);
      if (!confirm(`ยืนยันแก้ผลเป็น ${a} : ${b} ?`)) return;
      button.disabled = true;
      try { await services.updateConfirmedScore(id, { eventId, teamAScore: a, teamBScore: b }); message('บันทึกคะแนนแล้ว สถิติจะอัปเดตจากผลใหม่นี้'); await renderMatches(); } catch (error) { message(error.message || 'บันทึกไม่สำเร็จ', true); button.disabled = false; }
    });
    await renderMatches();
  }

  render().catch((error) => { root.innerHTML = `<div class="cut card p-5 bad">${esc(error.message || 'เปิด Admin ไม่สำเร็จ')}</div>`; });
}
