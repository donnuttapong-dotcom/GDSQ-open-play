# GDSQ Open Play v2 — Stable Shared Mode Baseline

Version: `v2-stable-manual-team-01`

Saved after Supabase Shared Mode + performance cleanup + standalone Player Info page + Manual Pick team clarity.

## Stable commit

```text
f588636cc0d379c1e6f80305152d43f106174786
```

## Stable links

### Organizer / Main system

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/openplay.html?mode=supabase&v=v2-stable-manual-team-01
```

### JOIN QR / QR display page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join-qr.html?mode=supabase&v=v2-stable-manual-team-01
```

### JOIN / Player join form

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join.html?mode=supabase&v=v2-stable-manual-team-01
```

### PLAYER INFO / Personal player page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/player.html?mode=supabase&v=v2-stable-manual-team-01
```

## Current stable behavior

- Organizer uses Supabase Shared Mode when opened with `mode=supabase`.
- Join QR uses Supabase Shared Mode and creates QR links to `join.html?mode=supabase&event=<eventId>`.
- Join page lists only `LIVE` events.
- Join page is only a sign-up form now.
- After a player joins, the app redirects to standalone `player.html` with `event` and `player` params.
- Player join from another device writes to Supabase `v2_event_players`.
- Join page saves the joined player ID on that device.
- Player Info page shows player name, level, status, queue position, rank, played count, W/L, points for, points against, diff, active match/court/team, and latest update time.
- Player Info page shows match history with win/loss, opponents, team, court, and score.
- Player Info page auto-refreshes every 7 seconds and has a manual refresh button.
- Player Info page has a Copy My Link button.
- Event create/update/delete uses Supabase `v2_events` in shared mode.
- Player status and level update use Supabase `v2_event_players` in shared mode.
- Match preview/start/cancel/confirm routes are wired to Supabase v2 services.
- Player status syncs to `playing` on start and back to `ready` on cancel/confirm in shared mode.
- Existing local/demo mode remains available with `mode=mock`.

## Stability cleanup applied

- `bilingualUi.js` now guards against repeated label application with `applyingLabels`.
- DOM observer is throttled and does not create repeated timers while one is pending.
- Observer does not react while labels are already being applied.
- Organizer player button unlock remains available without changing score/stat calculations.
- `shouldRest()` remains disabled for UI blocking so player controls and match generation do not get stuck.

## Manual Pick clarity applied

- Manual Pick now displays team grouping clearly:
  - `manual0` + `manual1` = Team A
  - `manual2` + `manual3` = Team B
- The same original select IDs are preserved.
- Manual Preview logic is not changed.
- Auto Match logic is not changed.
- Score, Stats, Join, QR, Player Info, and Supabase services are not changed by this UI clarity patch.

## Important note

Older events created in Local Mode are not migrated automatically to Supabase. For real multi-device use, open Organizer with `mode=supabase` and create a new LIVE event.

## Good rollback marker

Use commit `f588636cc0d379c1e6f80305152d43f106174786` as the stable reference if future changes cause issues.
