import assert from 'node:assert/strict';
import fs from 'node:fs';

const openplaySource = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');
const playerServiceSource = fs.readFileSync(new URL('../src/services/supabasePlayerService.js', import.meta.url), 'utf8');
const identityMigrationSource = fs.readFileSync(new URL('../supabase/migrations/20260826090000_player_level_event_join_consistency.sql', import.meta.url), 'utf8');
const safetyMigrationSource = fs.readFileSync(new URL('../supabase/migrations/20260818180446_production_safety_p0_guards.sql', import.meta.url), 'utf8');

assert.match(openplaySource, /levelLock=.*pendingLevelUpdates\.has\(String\(p\.id/, 'Organizer level editing must not lock because a player is active');
assert.match(openplaySource, /Applies from next match/, 'Active-player level edits must explain that the current roster is unchanged');
assert.doesNotMatch(openplaySource.match(/function playerRow\([\s\S]*?\nfunction renderJoin/)[0], /data-level-player[\s\S]*?\$\{actionLock\}/, 'Level select must not reuse the active-match action lock');
assert.match(openplaySource, /pendingLevelUpdates\.add\(String\(id\)\)[\s\S]*?services\.updatePlayerLevel\(event\.id,id,level\)/, 'Level saves must mark only the current level field pending');
assert.match(openplaySource, /pendingLevelUpdates\.delete\(String\(id\)\)[\s\S]*?renderOrganizerUpdate\(\)/, 'Level field must be re-enabled after its request settles');

assert.doesNotMatch(playerServiceSource, /estimated_level:\s*profile\?\.default_level\s*\|\|\s*level/, 'Legacy join fallback must not overwrite a submitted event level with profile default');
assert.match(playerServiceSource, /estimated_level:\s*level/, 'Join fallback must persist the submitted level to the event player');

assert.match(identityMigrationSource, /set default_level = clean_level, updated_at = now\(\)/, 'Self-selected join level must refresh the linked profile default');
assert.match(identityMigrationSource, /clean_level,\n\s*profile\.avatar_url/, 'New event participation must use the submitted level');
assert.doesNotMatch(identityMigrationSource, /update public\.v2_event_players\s+set estimated_level[\s\S]*?public\.v2_players/, 'Join migration must not couple organizer event-level edits to profile defaults');
assert.match(safetyMigrationSource, /update public\.v2_event_players set estimated_level = clean_level/, 'Organizer level RPC must stay event-scoped');
assert.doesNotMatch(safetyMigrationSource.match(/create or replace function public\.v2_admin_update_event_player_level[\s\S]*?\$\$;/)?.[0] || '', /update public\.v2_players/, 'Organizer level RPC must never modify canonical profile defaults');

console.log('player level behavior tests passed');
