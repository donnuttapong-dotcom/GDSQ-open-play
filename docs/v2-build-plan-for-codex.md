# GDSQ OpenPlay Platform v2 — Build Plan for Codex

## Mission

Create a new v2 application for GDSQ OpenPlay without modifying the old working pages.

The old system must remain available for real sessions while v2 is developed separately.

## Do not modify these files

```text
openplay.html
openplay-court-fix.html
openplay-organizer.html
openplay-checkin.html
openplay-player.html
openplay-player-compact.html
event-stats.html
```

## Build inside this folder only

```text
v2/
```

Docs are located in:

```text
docs/v2-product-requirements.md
docs/v2-technical-architecture.md
docs/v2-data-model.md
```

## First milestone

Build a v2 static prototype with mocked data first.

Do not connect to Supabase in the first UI milestone.

Goal: validate flow and mobile UI before database work.

## Milestone 1 — Static UI prototype

Create these pages inside v2:

```text
v2/index.html
v2/organizer.html
v2/checkin.html
v2/player.html
v2/summary.html
```

### v2/index.html

Landing page for internal testing.

Links to:

- Organizer
- Check-in
- Player view
- Summary
- Docs

### v2/organizer.html

Mobile-first organizer prototype.

Tabs:

1. Check-in
2. Queue
3. Courts
4. Results

Must include:

- Event status banner
- Online/offline banner placeholder
- Ready player list
- Court cards
- Start match button
- Confirm score button with saving state placeholder
- Summary link button

### v2/checkin.html

Player check-in prototype.

Fields:

- Player name
- Level
- Join button
- Confirmation state

### v2/player.html

Player view prototype.

Shows:

- Player name
- Status
- Court assignment
- Games played
- Wins/losses
- Next action

### v2/summary.html

Public summary prototype.

Shows:

- Event title
- Stat cards
- Ranking
- Match history
- Player detail card/popup

## Milestone 2 — Logic layer

After static UI is approved, create pure JS/TS modules:

```text
v2/src/logic/matchmaking/generateMatches.ts
v2/src/logic/matchmaking/preventConsecutive.ts
v2/src/logic/matchmaking/balanceLevels.ts
v2/src/logic/ranking/calculatePlayerRanking.ts
```

Do not connect these modules to UI until tested.

## Matchmaking rules

The engine must support:

- Low games first
- Max 2 consecutive games, then rest 1 game
- Balance level across teams
- Avoid repeated partners
- Avoid repeated opponents
- No match generation if fewer than 4 eligible players

## Milestone 3 — Supabase connection

Only after UI and logic are tested:

- Create v2 tables or migration plan
- Add service functions
- Add loading/saving/error states
- Add retry behavior
- Add audit logs

## Critical UX requirements

All important actions must show state:

```text
Idle
Saving
Success
Error
Retry
```

Buttons must be disabled during save.

Never create duplicate score confirmation from repeated clicks.

## Mobile requirements

Organizer must work on mobile first.

- Large primary buttons for critical actions
- Secondary actions hidden in menu or small links
- Cards must not overflow horizontally
- Sticky bottom action only if necessary
- Font sizes readable on iPhone/Android

## Release rule

Never deploy v2 to real event usage until:

- One full mock test passes
- One internal GDSQ dry run passes
- Old system is ready as backup
- No code changes within 24 hours before real event

## Definition of done for first build

The first build is done when:

- `v2/index.html` opens
- All prototype pages open
- No old files are modified
- Organizer prototype clearly shows the future production flow
- There is no iframe wrapping old pages
- There are no runtime patches to old app
