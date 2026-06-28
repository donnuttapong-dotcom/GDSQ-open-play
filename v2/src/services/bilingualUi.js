// Safe manual team labels only. No data, queue, score, court, or matchmaking changes.
const LANG_KEY = 'gdsq_v2_ui_lang';

function currentLang() {
  return localStorage.getItem(LANG_KEY) || 'th';
}

function label(th, en) {
  return currentLang() === 'en' ? en : th;
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, th, en) {
  const el = byId(id);
  if (el) el.textContent = label(th, en);
}

function ensureManualTeamLayout() {
  const selects = ['manual0', 'manual1', 'manual2', 'manual3'].map(byId);
  if (selects.some((select) => !select)) return;

  const existing = byId('manualTeamLayout');
  if (existing) {
    setText('manualTeamALabel', 'ทีม A', 'TEAM A');
    setText('manualTeamBLabel', 'ทีม B', 'TEAM B');
    return;
  }

  const parent = selects[0].parentElement;
  if (!parent || selects.some((select) => select.parentElement !== parent)) return;

  parent.id = 'manualTeamLayout';
  parent.className = 'grid gap-3 mt-2';
  parent.textContent = '';

  const teamA = document.createElement('div');
  teamA.className = 'soft p-3 border border-lime-300/30';
  const titleA = document.createElement('div');
  titleA.id = 'manualTeamALabel';
  titleA.className = 'text-xs font-black lime mb-2';
  titleA.textContent = label('ทีม A', 'TEAM A');
  const gridA = document.createElement('div');
  gridA.className = 'grid sm:grid-cols-2 gap-2';
  gridA.append(selects[0], selects[1]);
  teamA.append(titleA, gridA);

  const teamB = document.createElement('div');
  teamB.className = 'soft p-3 border border-cyan-300/30';
  const titleB = document.createElement('div');
  titleB.id = 'manualTeamBLabel';
  titleB.className = 'text-xs font-black text-cyan-300 mb-2';
  titleB.textContent = label('ทีม B', 'TEAM B');
  const gridB = document.createElement('div');
  gridB.className = 'grid sm:grid-cols-2 gap-2';
  gridB.append(selects[2], selects[3]);
  teamB.append(titleB, gridB);

  parent.append(teamA, teamB);
}

export function applyBilingualUiLabels() {
  ensureManualTeamLayout();
  setText('tabBtn-events', 'อีเว้นท์', 'Events');
  setText('tabBtn-join', 'เข้าร่วม', 'Join');
  setText('tabBtn-manage', 'ผู้จัด', 'Organizer');
  setText('tabBtn-stats', 'สถิติ', 'Stats');
}

function boot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => applyBilingualUiLabels();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

boot();
