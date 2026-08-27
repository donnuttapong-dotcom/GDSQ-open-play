import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');

assert.match(source, /@media\(max-width:960px\)[\s\S]*?#tab-manage \.manage-grid\{display:flex!important;flex-direction:column!important\}/, 'iPad portrait and boundary widths must use one organizer column');
assert.match(source, /#tab-manage #matchPanels\{[^}]*order:-2/, 'Live and Preview panels must lead the one-column organizer flow');
assert.match(source, /#tab-manage #matchPanels>\.preview-match-panel\{order:1\}/, 'Match Preview must stay above games that have already started');
assert.match(source, /#tab-manage #matchPanels>\.live-courts-panel\{order:2\}/, 'Started games must stay below Match Preview');
assert.match(source, /type="number" min="0" max="22" step="1" inputmode="numeric"/, 'Live score inputs must accept whole numbers from 0 through 22 only');
assert.match(source, /button,select,input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\),a\.btn\{min-height:44px\}/, 'Operational controls must meet the 44px touch target');
assert.match(source, /\.mode-tabs button,\.mode-tabs a\{min-height:44px\}/, 'Primary navigation targets must not be reduced below 44px by earlier styles');
assert.match(source, /@media\(min-width:768px\)\{#playerQueueControl \.queue-actions\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\}/, 'iPad and desktop queue actions must stay on one row');
assert.match(source, /#tab-stats,#tab-stats>\.space-y-5\{height:auto;max-height:none;overflow:visible\}/, 'Stats content must use normal document height instead of a nested vertical scroller');
assert.match(source, /#tab-stats \.overflow-auto\{overflow-x:auto;overflow-y:visible;max-height:none;overscroll-behavior-x:contain;overscroll-behavior-y:auto;touch-action:pan-x pan-y\}/, 'Stats tables must allow page scrolling while retaining horizontal table access');
assert.match(source, /html\{overflow-y:auto\}[\s\S]*?body\{overflow-y:visible\}/, 'The document root must remain the vertical scroll owner');
assert.match(source, /\.next-team select\{[^}]*min-height:44px/, 'Up Next selectors must retain an iPad-safe touch target');

const playerRowSource = source.match(/function playerRow\([\s\S]*?\nfunction renderJoin/)?.[0] || '';
assert.match(playerRowSource, /queued=queuedNextForPlayer\(p\.id\)/, 'Player Queue must identify queued-next reservations independently');
assert.match(playerRowSource, /lockedInCurrentMatch=busy&&!queued/, 'Queued-next players must not be locked like active match players');
assert.match(playerRowSource, /actionLock=\(removed\|\|lockedInCurrentMatch\)/, 'Only removed or current-match players may lock status controls');
assert.match(playerRowSource, /levelLock=\(removed\|\|pendingLevelUpdates/, 'Level editing must remain available for active and queued players');
assert.match(playerRowSource, /queue-player-name[\s\S]*?\$\{inlineEdit\}/, 'Match Making preference edit must sit beside the player name');
assert.match(source, /MATCH MAKING · \$\{gamePreferenceName/, 'Match history must display the renamed Match Making preference');
assert.doesNotMatch(source, />SMART QUEUE</, 'The retired Smart Queue product name must not remain visible');

assert.match(source, /UP NEXT on \$\{queued\.courtName\} was cancelled and the other players were released/, 'Queue cancellation must give the organizer an immediate recovery message');
assert.match(source, /render:cancelsQueued\?'organizer-matches':'organizer'/, 'Cancelling a queued player must refresh the match and Up Next panels immediately');

console.log('organizer UX hardening tests passed');
