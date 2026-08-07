// v2 service mode switch
// Supabase is auto-enabled when public project config exists.

import { hasSupabaseConfig } from './supabaseClient.js';
import { publishLocalEventForPublicStats } from './publicStatsPublisher.js';

const MODE_KEY = 'gdsq_v2_service_mode';
const EVENTS_KEY = 'gdsq_v2_events';
const SELECTED_EVENT_KEY = 'gdsq_v2_selected_event_id';
const STATS_TAB_KEY = 'gdsq_v2_open_tab';
// Build shared links from the deployed host so a fallback host never sends
// players back to a stale GitHub Pages URL.
const publicAppUrl = () => new URL('./openplay.html', location.href).toString();

function hydrateLegacyStatsShare() {
  const params = new URLSearchParams(location.search);
  const encoded = params.get('share');
  if (!encoded || params.get('mode') !== 'mock') return;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload?.version !== 1 || !payload?.event?.id) return;
    const events = safeJsonParse(localStorage.getItem(EVENTS_KEY) || '[]', []);
    const nextEvents = events.filter((event) => String(event.id) !== String(payload.event.id));
    localStorage.setItem(EVENTS_KEY, JSON.stringify([payload.event, ...nextEvents]));
    localStorage.setItem(SELECTED_EVENT_KEY, payload.event.id);
    localStorage.setItem(`gdsq_v2_event_players:${payload.event.id}`, JSON.stringify(payload.players || []));
    localStorage.setItem(`gdsq_v2_matches:${payload.event.id}`, JSON.stringify(payload.matches || []));
  } catch (error) {
    console.warn('Could not open this stats link.', error);
  }
}

hydrateLegacyStatsShare();

export const SERVICE_MODES = {
  MOCK: 'mock',
  SUPABASE: 'supabase'
};

export function getServiceMode() {
  const params = new URLSearchParams(location.search);
  const urlMode = params.get('mode');
  if (urlMode === SERVICE_MODES.SUPABASE || urlMode === SERVICE_MODES.MOCK) {
    localStorage.setItem(MODE_KEY, urlMode);
    return urlMode;
  }
  const saved = localStorage.getItem(MODE_KEY);
  if (saved === SERVICE_MODES.SUPABASE || saved === SERVICE_MODES.MOCK) return saved;
  return hasSupabaseConfig() ? SERVICE_MODES.SUPABASE : SERVICE_MODES.MOCK;
}

export function setServiceMode(mode) {
  if (![SERVICE_MODES.MOCK, SERVICE_MODES.SUPABASE].includes(mode)) {
    throw new Error(`Unsupported service mode: ${mode}`);
  }
  localStorage.setItem(MODE_KEY, mode);
  return mode;
}

export function isSupabaseMode() {
  return getServiceMode() === SERVICE_MODES.SUPABASE;
}

export function modeLabel() {
  return isSupabaseMode() ? 'SUPABASE SHARED MODE' : 'MOCK / LOCAL MODE';
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function eventTitle(event) {
  return event?.name || event?.name_th || event?.name_en || 'Untitled Event';
}

function eventStatusInfo(event) {
  const status = String(event?.status || 'draft').toLowerCase();
  if (['completed', 'ended', 'closed'].includes(status)) return { label: 'ENDED · จบแล้ว', cls: 'pill-ended' };
  if (['live', 'open', 'active'].includes(status)) return { label: 'LIVE · เปิดอยู่', cls: 'pill-live' };
  return { label: 'DRAFT · ยังไม่เปิด', cls: 'pill-draft' };
}

function readEvents() {
  return safeJsonParse(localStorage.getItem(EVENTS_KEY) || '[]', []);
}

function statsLinkForEvent(eventId, shared = isSupabaseMode()) {
  if (!shared || !eventId) return '';
  const url = new URL(publicAppUrl());
  url.searchParams.set('event', eventId);
  url.searchParams.set('tab', 'stats');
  url.searchParams.set('mode', SERVICE_MODES.SUPABASE);
  return url.toString();
}

function updateStatsStatus(select, badge, linkInput, copyButton, events) {
  const selected = events.find((event) => String(event.id) === String(select.value));
  const info = eventStatusInfo(selected);
  badge.className = `pill ${info.cls}`;
  badge.textContent = info.label;
  const link = statsLinkForEvent(select.value);
  if (linkInput) {
    linkInput.value = link;
    linkInput.placeholder = link ? '' : statsLanguageText('publishFirst');
  }
  if (copyButton) copyButton.disabled = !select.value;
}

function shouldOpenStatsTab() {
  const params = new URLSearchParams(location.search);
  return sessionStorage.getItem(STATS_TAB_KEY) === 'stats' || params.get('tab') === 'stats' || params.get('view') === 'stats';
}

function openStatsTabIfRequested() {
  if (!shouldOpenStatsTab()) return;
  const button = document.getElementById('tabBtn-stats');
  if (!button) return;
  sessionStorage.removeItem(STATS_TAB_KEY);
  setTimeout(() => button.click(), 150);
}

function injectStatsEventSelector() {
  if (document.getElementById('statsEventSelect')) return true;
  const statsSection = document.getElementById('tab-stats');
  const firstCard = statsSection?.querySelector('.card');
  if (!firstCard) return false;
  const events = readEvents();
  if (!events.length) return false;

  const params = new URLSearchParams(location.search);
  const urlEventId = params.get('event') || params.get('eventId') || params.get('id');
  const selectedId = urlEventId || localStorage.getItem(SELECTED_EVENT_KEY) || events[0]?.id || '';
  const wrapper = document.createElement('div');
  wrapper.id = 'statsEventPicker';
  wrapper.className = 'soft p-3 mt-4';
  wrapper.innerHTML = `
    <div class="grid md:grid-cols-[1fr_auto] gap-2 items-end">
      <label class="text-xs text-slate-400">เลือกอีเว้นท์ที่ต้องการดูสถิติ
        <select id="statsEventSelect" class="w-full rounded-lg border p-3 mt-1"></select>
      </label>
      <div class="flex md:justify-end"><span id="statsEventStatus" class="pill pill-draft">STATUS</span></div>
    </div>
    <div class="grid md:grid-cols-[1fr_auto] gap-2 mt-3 items-end">
      <label class="text-xs text-slate-400"><span id="statsShareLabel">ลิงก์สถิติสาธารณะ</span>
        <input id="statsShareLink" class="w-full rounded-lg border p-3 mt-1 text-xs" readonly />
      </label>
      <button id="copyStatsLinkBtn" class="cut bg-lime text-black p-3 font-black">COPY STATS LINK</button>
    </div>
  `;

  const header = firstCard.firstElementChild;
  if (header?.nextSibling) firstCard.insertBefore(wrapper, header.nextSibling);
  else firstCard.appendChild(wrapper);

  const select = wrapper.querySelector('#statsEventSelect');
  const badge = wrapper.querySelector('#statsEventStatus');
  const linkInput = wrapper.querySelector('#statsShareLink');
  const copyButton = wrapper.querySelector('#copyStatsLinkBtn');
  select.innerHTML = events.map((event) => `<option value="${event.id}">${eventStatusInfo(event).label.split(' · ')[0]} — ${eventTitle(event)}</option>`).join('');
  select.value = events.some((event) => String(event.id) === String(selectedId)) ? selectedId : events[0].id;
  localStorage.setItem(SELECTED_EVENT_KEY, select.value);
  updateStatsStatus(select, badge, linkInput, copyButton, events);

  select.addEventListener('change', () => {
    localStorage.setItem(SELECTED_EVENT_KEY, select.value);
    sessionStorage.setItem(STATS_TAB_KEY, 'stats');
    const params = new URLSearchParams(location.search);
    params.set('event', select.value);
    params.set('tab', 'stats');
    params.set('mode', getServiceMode());
    params.set('v', 'v2-supabase-shared-mode-01');
    location.href = `${location.pathname}?${params.toString()}`;
  });

  copyButton.addEventListener('click', async () => {
    let link = statsLinkForEvent(select.value);
    if (!isSupabaseMode()) {
      copyButton.disabled = true;
      copyButton.textContent = statsLanguageText('publishing');
      try {
        const sharedEventId = await publishLocalEventForPublicStats(select.value);
        link = statsLinkForEvent(sharedEventId, true);
        linkInput.value = link;
      } catch (error) {
        copyButton.textContent = statsLanguageText('publishFailed');
        copyButton.disabled = false;
        setTimeout(() => { copyButton.textContent = statsLanguageText('publishCopy'); }, 2200);
        return;
      }
    }
    linkInput.value = link;
    linkInput.select();
    try {
      await navigator.clipboard.writeText(link);
      copyButton.textContent = statsLanguageText('copied');
      setTimeout(() => { copyButton.textContent = statsLanguageText(isSupabaseMode() ? 'copy' : 'publishCopy'); }, 1200);
    } catch (error) {
      linkInput.focus();
      linkInput.select();
      try { document.execCommand('copy'); } catch (fallbackError) { /* The selected field remains available for manual copy. */ }
      copyButton.textContent = statsLanguageText('copyFallback');
      setTimeout(() => { copyButton.textContent = statsLanguageText(isSupabaseMode() ? 'copy' : 'publishCopy'); }, 1600);
    }
  });
  applyStatsLanguage();
  return true;
}

function statsLanguageText(key) {
  const thai = localStorage.getItem('gdsq_v2_ui_lang') !== 'en';
  return {
    copy: thai ? 'คัดลอกลิงก์สถิติ' : 'COPY STATS LINK',
    publishCopy: thai ? 'เผยแพร่และคัดลอกลิงก์' : 'PUBLISH & COPY LINK',
    publishing: thai ? 'กำลังเผยแพร่...' : 'PUBLISHING...',
    publishFailed: thai ? 'เผยแพร่ไม่สำเร็จ ลองใหม่' : 'PUBLISH FAILED - TRY AGAIN',
    copied: thai ? 'คัดลอกแล้ว' : 'COPIED',
    copyFallback: thai ? 'เลือกแล้ว กดคัดลอกส่งให้เพื่อน' : 'SELECTED - PRESS COPY',
    publishFirst: thai ? 'กดเผยแพร่และคัดลอก เพื่อสร้างลิงก์สั้นที่เปิดได้ทุกเครื่อง' : 'Publish and copy to create a short public link for every device.',
    shareLabel: thai ? 'ลิงก์สถิติสาธารณะ' : 'Public stats link',
  }[key];
}

function applyStatsLanguage() {
  const copyButton = document.getElementById('copyStatsLinkBtn');
  if (copyButton) copyButton.textContent = statsLanguageText(isSupabaseMode() ? 'copy' : 'publishCopy');
  const label = document.getElementById('statsShareLabel');
  if (label) label.textContent = statsLanguageText('shareLabel');
  const select = document.getElementById('statsEventSelect');
  const badge = document.getElementById('statsEventStatus');
  const linkInput = document.getElementById('statsShareLink');
  if (select && badge && linkInput) updateStatsStatus(select, badge, linkInput, copyButton, readEvents());
}

function bootStatsEventSelector() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const tryInject = () => {
    openStatsTabIfRequested();
    injectStatsEventSelector();
  };
  window.addEventListener('gdsq-language-change', applyStatsLanguage);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInject);
  else tryInject();
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    openStatsTabIfRequested();
    if (injectStatsEventSelector() || tries > 20) clearInterval(timer);
  }, 250);
}

bootStatsEventSelector();
