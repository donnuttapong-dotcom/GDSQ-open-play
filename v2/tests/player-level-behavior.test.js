import assert from 'node:assert/strict';
import fs from 'node:fs';

const openplaySource = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');
const joinSource = fs.readFileSync(new URL('../join.html', import.meta.url), 'utf8');
const playerServiceSource = fs.readFileSync(new URL('../src/services/supabasePlayerService.js', import.meta.url), 'utf8');
const identityMigrationSource = fs.readFileSync(new URL('../supabase/migrations/20260826090000_player_level_event_join_consistency.sql', import.meta.url), 'utf8');
const safetyMigrationSource = fs.readFileSync(new URL('../supabase/migrations/20260818180446_production_safety_p0_guards.sql', import.meta.url), 'utf8');
const smartQueueUiSource = fs.readFileSync(new URL('../src/ui/smartQueueUi.js', import.meta.url), 'utf8');
const testAdminSource = fs.readFileSync(new URL('../supabase/functions/v2-test-admin/index.ts', import.meta.url), 'utf8');

assert.match(openplaySource, /levelLock=.*pendingLevelUpdates\.has\(String\(p\.id/, 'Organizer level editing must not lock because a player is active');
assert.match(openplaySource, /Applies from next match/, 'Active-player level edits must explain that the current roster is unchanged');
assert.doesNotMatch(openplaySource.match(/function playerRow\([\s\S]*?\nfunction renderJoin/)[0], /data-level-player[\s\S]*?\$\{actionLock\}/, 'Level select must not reuse the active-match action lock');
assert.match(openplaySource, /pendingLevelUpdates\.add\(String\(id\)\)[\s\S]*?services\.updatePlayerLevel\(event\.id,id,level\)/, 'Level saves must mark only the current level field pending');
assert.match(openplaySource, /pendingLevelUpdates\.delete\(String\(id\)\)[\s\S]*?renderOrganizerUpdate\(\)/, 'Level field must be re-enabled after its request settles');
assert.match(openplaySource, /addEventListener\('input',[\s\S]*?queuePlayerLevelSave/, 'Numeric level editing must auto-save after typing on touch devices');
assert.match(openplaySource, /id="joinLevel"[^>]*type="number"[^>]*step="0\.01"/, 'Organizer Join must accept custom decimal levels');
assert.match(openplaySource, /data-level-player[^>]*type="number"|type="number"[^>]*data-level-player/, 'Organizer player rows must use a direct numeric level editor');
assert.match(joinSource, /id="playerLevel"[^>]*type="number"[^>]*step="0\.01"/, 'QR Join must accept custom decimal levels');
assert.match(joinSource, /level<1\|\|level>6/, 'QR Join must reject values outside the supported backend range');

assert.doesNotMatch(playerServiceSource, /estimated_level:\s*profile\?\.default_level\s*\|\|\s*level/, 'Legacy join fallback must not overwrite a submitted event level with profile default');
assert.match(playerServiceSource, /estimated_level:\s*level/, 'Join fallback must persist the submitted level to the event player');

assert.match(identityMigrationSource, /set default_level = clean_level, updated_at = now\(\)/, 'Self-selected join level must refresh the linked profile default');
assert.match(identityMigrationSource, /clean_level,\n\s*profile\.avatar_url/, 'New event participation must use the submitted level');
assert.doesNotMatch(identityMigrationSource, /update public\.v2_event_players\s+set estimated_level[\s\S]*?public\.v2_players/, 'Join migration must not couple organizer event-level edits to profile defaults');
assert.match(safetyMigrationSource, /update public\.v2_event_players set estimated_level = clean_level/, 'Organizer level RPC must stay event-scoped');
assert.doesNotMatch(safetyMigrationSource.match(/create or replace function public\.v2_admin_update_event_player_level[\s\S]*?\$\$;/)?.[0] || '', /update public\.v2_players/, 'Organizer level RPC must never modify canonical profile defaults');

assert.match(smartQueueUiSource, /modes: SMART_QUEUE_MODES\.slice\(\), preferredMode: null, status: 'ready'/, 'A missing Match Making preference must be treated as ANY and Ready');
assert.match(smartQueueUiSource, /selectedModes\.length \? selectedModes : SMART_QUEUE_MODES\.slice\(\)/, 'Inline save must safely default an empty preference to ANY');
assert.doesNotMatch(smartQueueUiSource, /if \(!modes\.length\) return void showMessage/, 'Missing preference must not block an Organizer Level save');
assert.match(smartQueueUiSource, /await services\.updatePlayerLevel[\s\S]*?await savePreference/, 'Event Level must save independently before the optional preference upsert');
assert.match(testAdminSource, /level < 1 \|\| level > 6/, 'Test Admin must use the Production Level range');
assert.doesNotMatch(testAdminSource, /Math\.round\(Number\(value \|\| 3\) \* 4\) \/ 4/, 'Test Admin must not round Level to quarter steps');
assert.match(testAdminSource, /return level;/, 'Test Admin must preserve the submitted decimal Level');

console.log('player level behavior tests passed');
