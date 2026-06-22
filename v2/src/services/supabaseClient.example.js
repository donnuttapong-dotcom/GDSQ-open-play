// Copy this file to supabaseClient.js for local/private development.
// Do not commit real service_role keys to this repository.
// For browser usage, use anon public key only and protect data with RLS.

export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export function assertSupabaseConfigured() {
  if (SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON_KEY.includes('YOUR_')) {
    throw new Error('Supabase is not configured. Copy supabaseClient.example.js to supabaseClient.js and add safe anon config.');
  }
}
