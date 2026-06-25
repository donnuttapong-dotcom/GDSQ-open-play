# GDSQ Open Play v2 — Stable Shared Mode Baseline

Version: `v2-player-page-01`
Saved after Supabase Shared Mode + performance cleanup + standalone Player Info page.

## Stable links

### Organizer / Main system

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/openplay.html?mode=supabase&v=v2-performance-safe-01
```

### JOIN QR / QR display page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join-qr.html?mode=supabase&v=v2-supabase-shared-mode-01
```

### JOIN / Player join form

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join.html?mode=supabase&v=v2-player-page-01
```

### PLAYER INFO / Personal player page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/player.html?mode=supabase&v=v2-player-page-01
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

## Performance cleanup applied

- Removed persistent full-body observer from `shareLinksUi.js`.
- Kept only one immediate cleanup and one delayed cleanup for legacy Organizer QR block.
- Throttled `bilingualUi.js` DOM observer with a 180ms debounce.
- Limited bilingual observer reaction to high-change render zones only: events, manage players, matches, join players, stats.

## Important note

Older events created in Local Mode are not migrated automatically to Supabase. For real multi-device use, open Organizer with `mode=supabase` and create a new LIVE event.

## Good rollback marker

Use this file as the reference baseline if future changes cause issues.
