# Public Event Summary Page Direction

## Decision

`event-stats.html` will become the main public event summary page for GDSQ OpenPlay.

This page is designed to be shared with all event participants after an event ends, while also supporting live viewing during the event.

## Core Purpose

The page should work as:

- A public read-only event recap
- A realtime event summary while the event is active
- A post-event archive link after the event ends
- A shareable link for LINE / social / group chat
- A player ranking and individual stats viewer

## Main URL Pattern

```text
event-stats.html?event=EVENT_ID
```

Optional player detail deep link:

```text
event-stats.html?event=EVENT_ID&player=PLAYER_ID
```

## Required Sections

### 1. Event Header

Show:

- Event name
- Venue
- Date / time
- Status: Live / Completed / Archived
- Last updated time
- Copy Result Link button

### 2. Event Summary Cards

Show:

- Players
- Confirmed Matches
- Live / Pending Matches
- Top Player
- Event Status

### 3. Final Ranking / Player Ranking

This is the most important section after the event ends.

Each player row should show:

- Rank
- Nickname
- Level
- Played
- Win / Loss
- Win Rate
- Points For
- Points Against
- Point Difference

Each ranking row must be clickable.

### 4. Player Detail Popup

When a user clicks a ranking row, open a popup modal.

The popup should show:

- Player nickname
- Rank
- Level
- Score
- Played
- Wins
- Losses
- Win Rate
- Point Difference
- Badges
- Personal Match History
- Partner in each match
- Opponents in each match
- Score per match
- Copy Player Link button

The popup must be closeable with:

- Close button
- Background click
- Esc key

### 5. Match History

Show all confirmed matches:

- Court number
- Team A names
- Team B names
- Score
- Winner
- Match order

### 6. Live Courts

During the event, show:

- Current / pending matches
- Court number
- Team A / Team B
- Current score if available
- Match status

After the event ends, this section can be hidden or shown as empty.

## Sharing Flow

After the event ends, Organizer should copy the event stats link and send it to the group.

Example message:

```text
สรุปผล GDSQ OpenPlay วันนี้มาแล้วครับ
ดูอันดับ ผลแข่ง และสถิติรายคนได้ที่ลิงก์นี้:
[event-stats link]
```

## Product Direction

This page should feel like a public recap page, not an admin page.

It should be:

- Clean
- Shareable
- Mobile-first
- Fast to understand
- Read-only
- Good enough to send after every event

## Development Priority

1. Stabilize event selection and event link
2. Make post-event ranking accurate
3. Improve player popup detail
4. Improve share/copy link behavior
5. Add final event status / archive behavior
6. Polish mobile UI for sharing after event
