# GDSQ OpenPlay Platform v2 — Technical Architecture

## 1. Core principle

v2 must be a clean application, not a wrapper around the old static pages.

Do not use:

- iframe nesting
- DOM injection into another page
- runtime monkey patches for production logic
- version query hacks as feature control

Use clear application code, services, and testable business logic.

## 2. Recommended stack

For the next build, use one of these approaches:

### Option A — Fast and practical

- Vite
- React
- TypeScript
- Supabase
- TanStack Query
- Zustand
- CSS modules or Tailwind

### Option B — More SaaS-ready

- Next.js
- React
- TypeScript
- Supabase
- Server routes for sensitive actions later
- TanStack Query

Recommended for immediate build: **Option A** because it is simpler and can still be deployed to GitHub Pages or static hosting.

## 3. Folder structure

```text
v2/
  README.md
  package.json
  index.html
  src/
    main.tsx
    app.tsx
    routes/
      organizer/
      checkin/
      player/
      summary/
      admin/
    components/
      EventCard.tsx
      CourtCard.tsx
      PlayerRow.tsx
      MatchCard.tsx
      ScoreConfirmForm.tsx
      StatusBanner.tsx
    services/
      supabaseClient.ts
      organizationService.ts
      venueService.ts
      eventService.ts
      playerService.ts
      matchService.ts
      rankingService.ts
      auditService.ts
    logic/
      matchmaking/
        generateMatches.ts
        scoreCandidateGroup.ts
        preventConsecutive.ts
        balanceLevels.ts
      ranking/
        calculatePlayerRanking.ts
      network/
        connectionStatus.ts
    state/
      useEventStore.ts
      useOrganizerStore.ts
    tests/
      matchmaking.test.ts
      scoring.test.ts
      eventFlow.test.ts
```

## 4. Application routes

### `/v2/organizer`

For staff and organizers.

- Event list
- Court board
- Queue
- Match start
- Score confirmation
- Event completion

### `/v2/checkin/:eventId`

For players.

- Join event
- Select level
- Check-in status

### `/v2/player/:eventId/:playerId`

For individual player view.

- Current status
- Next court if assigned
- Player stats

### `/v2/summary/:eventId`

Public read-only summary.

- Event ranking
- Match history
- Player detail popup

### `/v2/admin`

Later phase.

- Organization
- Venue
- Staff
- Plan
- Analytics

## 5. Data loading strategy

Use service functions for database operations.

Example:

```text
eventService.getEvent(eventId)
playerService.getEventPlayers(eventId)
matchService.createMatch(payload)
matchService.confirmScore(matchId, scorePayload)
```

UI components should not call Supabase directly. They call services or hooks.

## 6. Save action rules

Every important action must implement:

- `idle`
- `saving`
- `success`
- `error`
- `retry`

Important actions:

- check-in
- update player level
- generate match
- start match
- confirm score
- complete event
- delete/archive event

## 7. Confirm score safety

Confirm score is the highest-risk action.

Required behavior:

- Disable button while saving
- Show saving indicator
- Use idempotency key or match status check
- Do not allow second confirm if already confirmed
- If network fails, keep local draft
- Allow retry
- Write audit log

## 8. Network reliability

Add a visible connection banner:

```text
ONLINE
SLOW CONNECTION
OFFLINE — changes will be saved locally first
SYNC PENDING
SYNCED
```

Organizer should never lose score input because of weak internet.

## 9. Matchmaking engine

Matchmaking must be a pure function.

Input:

```ts
players
courts
matchHistory
rules
currentAssignments
```

Output:

```ts
MatchPreview[]
```

No DOM access. No Supabase access. No UI state mutation inside the engine.

## 10. Testing requirements

Before real usage, test these cases:

- 4 players / 1 court
- 8 players / 2 courts
- 16 players / 4 courts
- player joins late
- player has played 0 games
- player has played 2 consecutive games
- weak internet during confirm score
- confirm score double click
- event summary after completion

## 11. Compatibility with old system

v2 can initially read from the same Supabase project, but it must avoid breaking old tables.

Recommended approach:

- Create new v2 tables with prefix or clear schema naming.
- Build v2 screens against v2 tables.
- Add migration/import from v1 later if needed.

## 12. Release strategy

### Alpha

Local or hidden `/v2/` path, used by internal team only.

### Beta

Run one GDSQ event with v2 while old system is ready as backup.

### Pilot

Use with 1–3 venues after 3 successful internal sessions.

### SaaS

Add organization, roles, plans, billing, and analytics.
