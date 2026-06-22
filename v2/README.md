# GDSQ OpenPlay Platform v2

> New product sandbox for a stable, multi-venue pickleball event platform.

## Why v2 exists

The current GDSQ OpenPlay pages are useful for live experiments and real events, but they were built quickly with static pages, wrappers, and patches. For a business-ready platform, v2 must be separated from the old system.

This folder is intentionally isolated from the existing production/testing pages.

## Safety rule

Do not modify the old working pages while developing v2:

- `openplay.html`
- `openplay-court-fix.html`
- `openplay-organizer.html`
- `openplay-checkin.html`
- `openplay-player.html`
- `openplay-player-compact.html`
- `event-stats.html`

The old system remains available for real GDSQ sessions until v2 is tested and approved.

## v2 product direction

GDSQ OpenPlay v2 is not just a match generator. It is a **Pickleball Event & Club Operating System** for:

- Courts / venues
- Open Play organizers
- Clubs and communities
- Coaches and academies
- Tournament and league organizers

## v2 core modules

1. Organization / Venue Management
2. Event Creation
3. Player Check-in
4. Queue Management
5. Court Board
6. Matchmaking Engine
7. Score Confirmation
8. Player Ranking
9. Event Summary
10. Admin Analytics
11. Subscription / Plan Management

## Technical principle

No wrapper patches. No iframe injection. No hidden production hacks.

v2 must be built as a clean application with separate layers:

- UI components
- business logic
- database services
- realtime sync
- error handling
- tests

## Current status

This is the first planning checkpoint. No production app has been built in this folder yet.

Next files to read:

- `docs/v2-product-requirements.md`
- `docs/v2-technical-architecture.md`
- `docs/v2-data-model.md`
- `docs/v2-build-plan-for-codex.md`
