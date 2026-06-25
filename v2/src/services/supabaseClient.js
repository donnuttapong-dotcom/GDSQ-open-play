// Public Supabase browser client for GDSQ Open Play v2.
// Uses publishable/anon key only. No service-role secret belongs in the browser.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const URL_KEY = 'gdsq_v2_supabase_url';
const KEY_KEY = 'gdsq_v2_supabase_publishable_key';

const DEFAULT_SUPABASE_URL = 'https://zzeikmrrlfvwnwsprmjy.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_xSAZX5dgZ_3Qr3nzoOtqYA_Z0l8yOaX';

let cachedClient = null;

export function getSupabaseConfig() {
  const custom = typeof window !== 'undefined' ? window.GDSQ_SUPABASE || {} : {};
  const url = custom.url || localStorage.getItem(URL_KEY) || DEFAULT_SUPABASE_URL;
  const key = custom.publishableKey || custom.anonKey || localStorage.getItem(KEY_KEY) || DEFAULT_SUPABASE_KEY;
  return { url, key };
}

export function hasSupabaseConfig() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key && !String(url).includes('YOUR_') && !String(key).includes('YOUR_'));
}

export function saveSupabaseConfig({ url, key }) {
  if (url) localStorage.setItem(URL_KEY, url);
  if (key) localStorage.setItem(KEY_KEY, key);
  cachedClient = null;
  return getSupabaseConfig();
}

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  if (!cachedClient) {
    const { url, key } = getSupabaseConfig();
    cachedClient = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
  }
  return cachedClient;
}
