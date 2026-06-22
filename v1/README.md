# GDSQ OpenPlay v1 — Live Usage Links

This is the stable link set for the original system.

Use this v1 set for real sessions until v2 is fully tested and approved.

## Important rule

v1 and v2 are separate.

Do not use `/v2/` pages for real events yet.

Do not modify these v1 live pages while developing v2:

- `openplay.html`
- `openplay-court-fix.html`
- `openplay-organizer.html`
- `openplay-checkin.html`
- `openplay-player.html`
- `openplay-player-compact.html`
- `event-stats.html`

## 1. Organizer main link

Use this as the main live organizer page:

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-court-fix.html?v=stable-direct-01
```

Use for:

- Select / manage event
- Player list
- Queue
- Courts
- Start match
- Confirm score
- End event

## 2. Check-in / QR link

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-checkin.html?v=level025-main-01
```

Use for player check-in.

## 3. Player page

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-player-compact.html?v=level025-main-01
```

Use for players to view their event/player status.

## 4. Event summary

Base summary link:

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/event-stats.html?v=final-summary-01
```

Shareable event-specific format:

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/event-stats.html?event=EVENT_ID&v=final-summary-01
```

Best practice: use COPY SUMMARY from the organizer after the event is completed so the correct `event=` parameter is included.

## 5. Organizer helper after event

Use only after event completion for copy summary / delete or hide completed event:

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-organizer.html?v=rollback-buttons-02
```

Do not use this helper as the main live event control page.

## Do not use for live v1 events

Do not use these for real sessions:

```text
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/index.html
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/organizer.html
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/events.html
https://donnuttapong-dotcom.github.io/GDSQ-open-play/v2/stats.html
```

v2 is development sandbox only.

## Short live-use set

```text
Organizer:
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-court-fix.html?v=stable-direct-01

Check-in:
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-checkin.html?v=level025-main-01

Player:
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-player-compact.html?v=level025-main-01

Summary:
https://donnuttapong-dotcom.github.io/GDSQ-open-play/event-stats.html?v=final-summary-01

Organizer after event:
https://donnuttapong-dotcom.github.io/GDSQ-open-play/openplay-organizer.html?v=rollback-buttons-02
```
