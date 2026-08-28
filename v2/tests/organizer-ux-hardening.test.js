import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');
const smartQueueSource = fs.readFileSync(new URL('../src/ui/smartQueueUi.js', import.meta.url), 'utf8');
const smartQueueStyles = fs.readFileSync(new URL('../src/styles/smartQueue.css', import.meta.url), 'utf8');

assert.match(source, /@media\(max-width:960px\)[\s\S]*?#tab-manage \.manage-grid\{display:flex!important;flex-direction:column!important\}/, 'iPad portrait and boundary widths must use one organizer column');
assert.match(source, /#tab-manage #matchPanels\{[^}]*order:-2/, 'Live and Preview panels must lead the one-column organizer flow');
assert.match(source, /#tab-manage #matchPanels>\.preview-match-panel\{order:1\}/, 'Match Preview must stay above games that have already started');
assert.match(source, /#tab-manage #matchPanels>\.live-courts-panel\{order:2\}/, 'Started games must stay below Match Preview');
assert.match(source, /type="number" min="0" max="22" step="1" inputmode="numeric"/, 'Live score inputs must accept whole numbers from 0 through 22 only');
assert.match(source, /button,select,input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\),a\.btn\{min-height:44px\}/, 'Operational controls must meet the 44px touch target');
assert.match(source, /\.mode-tabs button,\.mode-tabs a\{min-height:44px\}/, 'Primary navigation targets must not be reduced below 44px by earlier styles');
assert.match(smartQueueStyles, /\.queue-status-grid\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/, 'iPad landscape and desktop queue statuses must stay on one row');
assert.match(smartQueueStyles, /@media\(max-width:767px\)\{\.queue-status-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/, 'Mobile and narrow iPad queue statuses must use a tappable 2x2 grid');
assert.match(smartQueueStyles, /\.queue-status-btn\{[^}]*min-height:44px/, 'Every queue status control must keep a 44px touch target');
assert.match(source, /#tab-stats,#tab-stats>\.space-y-5\{height:auto;max-height:none;overflow:visible\}/, 'Stats content must use normal document height instead of a nested vertical scroller');
assert.match(source, /#tab-stats \.overflow-auto\{overflow-x:auto;overflow-y:visible;max-height:none;overscroll-behavior-x:contain;overscroll-behavior-y:auto;touch-action:pan-x pan-y\}/, 'Stats tables must allow page scrolling while retaining horizontal table access');
assert.match(source, /html\{overflow-y:auto\}[\s\S]*?body\{overflow-y:visible\}/, 'The document root must remain the vertical scroll owner');
assert.match(source, /\.next-team select\{[^}]*min-height:44px/, 'Up Next selectors must retain an iPad-safe touch target');

const playerRowSource = source.match(/function playerRow\([\s\S]*?\nfunction renderJoin/)?.[0] || '';
assert.match(playerRowSource, /queued=queuedNextForPlayer\((?:p\.id|id)\)/, 'Player Queue must identify queued-next reservations independently');
assert.match(playerRowSource, /lockedInCurrentMatch=busy&&!queued/, 'Queued-next players must not be locked like active match players');
assert.match(playerRowSource, /actionLock=\(removed\|\|lockedInCurrentMatch\)/, 'Only removed or current-match players may lock status controls');
assert.match(playerRowSource, /levelLock=\(removed\|\|pendingLevelUpdates/, 'Level editing must remain available for active and queued players');
assert.match(playerRowSource, /queue-player-name[\s\S]*?\$\{inlineEdit\}/, 'Match Making preference edit must sit beside the player name');
assert.match(playerRowSource, /queueStatusControls\(p,\{smart,primary,locked:removed\|\|lockedInCurrentMatch\}\)/, 'Status controls must be rendered directly on every Organizer player card');
assert.match(source, /\['ready','wait','rest','playing'\]\.map/, 'Player cards must expose READY, WAIT, REST and PLAYING in one status group');
assert.match(source, /disabled=key===['"]playing['"]\|\|locked/, 'PLAYING must remain display-only and active match statuses must stay locked');
assert.match(source, /playing=playingPlayerIds\(\)\.has\(id\)/, 'PLAYING must be derived from the live match lifecycle');
assert.match(source, /MATCH MAKING · \$\{gamePreferenceName/, 'Match history must display the renamed Match Making preference');
assert.doesNotMatch(source, />SMART QUEUE</, 'The retired Smart Queue product name must not remain visible');

assert.match(source, /if\(preview\|\|playing\)return showMessage/, 'Preview and Playing players must reject direct queue status changes');
assert.match(source, /if\(cancelsQueued\)await services\.cancelMatchNext\(queued\.id/, 'WAIT or REST must cancel the complete UP NEXT match before changing the player');
assert.match(source, /smartQueueUi\.setQueueStatus\(id,'rest'\)/, 'Match Making WAIT must reuse the existing preference status');
assert.match(source, /const mapped=status==='wait'\?'rest':status==='rest'\?'resting':'ready'/, 'STANDARD WAIT and REST must reuse the existing event-player statuses');
assert.match(source, /render:cancelsQueued\?'organizer-matches':'organizer'/, 'Cancelling a queued player must refresh the match and Up Next panels immediately');
assert.doesNotMatch(smartQueueSource, /data-sq-inline-status/, 'Edit must not duplicate queue status controls');
assert.match(smartQueueSource, /savePreference\(id, \{ modes, preferredMode: modes\[0\] \}\)/, 'Edit must save only Level and Game Preferences');

console.log('organizer UX hardening tests passed');
