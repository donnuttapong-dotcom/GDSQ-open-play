# GDSQ Open Play v2 — Stable Shared Mode Baseline

Version: `v2-player-self-info-01`
Saved after Supabase Shared Mode + performance cleanup + player self info on mobile Join page.

## Stable links

### Organizer / Main system

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/openplay.html?mode=supabase&v=v2-performance-safe-01
```

### JOIN QR / QR display page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join-qr.html?mode=supabase&v=v2-supabase-shared-mode-01
```

### JOIN / Player join page with MY INFO

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/join.html?mode=supabase&v=v2-player-self-info-01
```

## Current stable behavior

- Organizer uses Supabase Shared Mode when opened with `mode=supabase`.
- Join QR uses Supabase Shared Mode and creates QR links to `join.html?mode=supabase&event=<eventId>`.
- Join page lists only `LIVE` events.
- Player join from another device writes to Supabase `v2_event_players`.
- Join page saves the joined player ID on that device.
- Player can see `MY INFO` on their own mobile after joining.
- MY INFO shows player name, level, status, queue position, played count, W/L, active match/court/team, and latest update time.
- MY INFO auto-refreshes every 7 seconds and has a manual refresh button.
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
