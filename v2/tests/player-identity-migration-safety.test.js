import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260820083907_player_identity_integrity_phase1.sql', import.meta.url), 'utf8');
const normalized = sql.replace(/--.*$/gm, '').toLowerCase();

assert.doesNotMatch(normalized, /\b(update|insert\s+into|delete\s+from)\s+public\.v2_matches\b/);
assert.doesNotMatch(normalized, /\b(update|insert\s+into|delete\s+from)\s+public\.v2_match_players\b/);
assert.match(normalized, /update\s+public\.v2_event_players\s+set\s+player_id/);
assert.match(normalized, /revoke all on function public\.v2_admin_link_legacy_player_history[\s\S]*from public, anon, authenticated/);
assert.match(normalized, /grant execute on function public\.v2_admin_link_legacy_player_history[\s\S]*to service_role/);

console.log('player identity migration safety tests passed');
