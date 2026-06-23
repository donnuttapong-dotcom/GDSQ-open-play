const DEFAULT_PIN = '4646';
const UNLOCK_MINUTES = 180;
const STAFF_ACTION_PATTERNS = [
  'generatePreview',
  'clearWaitingPreviews',
  'setCourtBuildMode',
  'saveManualPreview',
  'saveAndStartManual',
  'clearManualPick',
  'startMatchCard',
  'cancelMatchCard',
  'confirmScoreCard',
  'setPlayerStatus',
  'removePlayer',
  'forceAllReady'
];

function eventIdFromLocation() {
  const params = new URLSearchParams(location.search);
  return params.get('event') || params.get('eventId') || params.get('id') || localStorage.getItem('gdsq_v2_selected_event_id') || 'default';
}

function unlockKey() {
  return `gdsq_v2_staff_unlocked_until:${eventIdFromLocation()}`;
}

function configuredPin() {
  return localStorage.getItem(`gdsq_v2_staff_pin:${eventIdFromLocation()}`) || DEFAULT_PIN;
}

function isUnlocked() {
  return Number(localStorage.getItem(unlockKey()) || 0) > Date.now();
}

function setUnlocked() {
  localStorage.setItem(unlockKey(), String(Date.now() + UNLOCK_MINUTES * 60 * 1000));
}

function lockNow() {
  localStorage.removeItem(unlockKey());
  updateBadge(false);
}

function updateBadge(unlocked = isUnlocked()) {
  const badge = document.getElementById('staffLockBadge');
  const panel = document.getElementById('staffLockPanel');
  if (badge) {
    badge.textContent = unlocked ? 'STAFF UNLOCKED' : 'STAFF LOCKED';
    badge.className = unlocked ? 'pill status-online' : 'pill status-offline';
  }
  if (panel) {
    panel.classList.toggle('staff-unlocked', unlocked);
    panel.classList.toggle('staff-locked', !unlocked);
  }
}

function showToast(text) {
  if (typeof window.mockToast === 'function') {
    window.mockToast(text);
    return;
  }
  console.log(text);
}

function unlockWithPrompt() {
  if (isUnlocked()) return true;
  const input = prompt('Staff PIN');
  if (input === configuredPin()) {
    setUnlocked();
    updateBadge(true);
    showToast('Staff unlocked');
    return true;
  }
  updateBadge(false);
  showToast('Staff locked');
  return false;
}

function actionNeedsStaff(target) {
  const actionNode = target.closest('[onclick], button, a');
  if (!actionNode) return false;
  const inline = actionNode.getAttribute('onclick') || '';
  return STAFF_ACTION_PATTERNS.some((name) => inline.includes(name));
}

function injectPanel() {
  if (document.getElementById('staffLockPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'staffLockPanel';
  panel.className = 'card staff-locked';
  panel.innerHTML = `
    <div class="between mobile-stack">
      <div>
        <h2 class="section-title lime">Staff Lock</h2>
        <p class="muted small">ผู้เล่นเปิดดูได้ แต่ปุ่มคุมเกมต้องปลดล็อกด้วย PIN ก่อน</p>
      </div>
      <span id="staffLockBadge" class="pill status-offline">STAFF LOCKED</span>
    </div>
    <div class="grid grid-2" style="margin-top:12px">
      <button class="btn" id="staffUnlockBtn" type="button">Unlock Staff Mode</button>
      <button class="btn secondary" id="staffLockBtn" type="button">Lock Now</button>
    </div>
    <div class="notice" style="margin-top:12px">Prototype PIN เริ่มต้น: 4646 · เวอร์ชันขายจริงต้องย้ายไป server role / Supabase Auth</div>
  `;
  const main = document.querySelector('main.app');
  const nav = document.querySelector('nav.tabs');
  if (main && nav) {
    main.insertBefore(panel, nav);
  } else if (main) {
    main.prepend(panel);
  }
  document.getElementById('staffUnlockBtn')?.addEventListener('click', unlockWithPrompt);
  document.getElementById('staffLockBtn')?.addEventListener('click', () => {
    lockNow();
    showToast('Staff locked');
  });
}

function installGuard() {
  document.addEventListener('click', (event) => {
    if (!actionNeedsStaff(event.target)) return;
    if (isUnlocked()) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    unlockWithPrompt();
  }, true);
}

function installStyles() {
  if (document.getElementById('staffLockStyles')) return;
  const style = document.createElement('style');
  style.id = 'staffLockStyles';
  style.textContent = `
    #staffLockPanel.staff-locked { border-color: rgba(248,113,113,.35); background: rgba(127,29,29,.12); }
    #staffLockPanel.staff-unlocked { border-color: rgba(199,255,46,.35); background: rgba(199,255,46,.07); }
  `;
  document.head.appendChild(style);
}

function initStaffLock() {
  installStyles();
  injectPanel();
  installGuard();
  updateBadge();
  window.gdsqRequireStaffUnlock = unlockWithPrompt;
  window.gdsqLockStaff = lockNow;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStaffLock);
} else {
  initStaffLock();
}
