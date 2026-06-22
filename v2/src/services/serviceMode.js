// v2 service mode switch
// Default is mock so v2 remains safe and does not touch real Supabase data.

const MODE_KEY = 'gdsq_v2_service_mode';

export const SERVICE_MODES = {
  MOCK: 'mock',
  SUPABASE: 'supabase'
};

export function getServiceMode() {
  const urlMode = new URLSearchParams(location.search).get('mode');
  if (urlMode === SERVICE_MODES.SUPABASE || urlMode === SERVICE_MODES.MOCK) {
    localStorage.setItem(MODE_KEY, urlMode);
    return urlMode;
  }
  return localStorage.getItem(MODE_KEY) || SERVICE_MODES.MOCK;
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
  return isSupabaseMode() ? 'SUPABASE MODE' : 'MOCK MODE';
}
