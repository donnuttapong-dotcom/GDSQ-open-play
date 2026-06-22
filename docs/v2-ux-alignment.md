# GDSQ OpenPlay v2 — UX Alignment With Original System

## Purpose

v2 must feel familiar to people who already used the first GDSQ OpenPlay system.

The goal is not to make a complicated new admin system. The goal is to keep the original simple event flow, then make it more stable, safer, and easier to run at real venues.

## Original flow we must preserve

The original product idea is:

```text
Create / select event
→ Player check-in
→ Organizer sees players
→ Generate / manage matches
→ Start court
→ Confirm score
→ Ranking and event summary
→ Share final result
```

v2 must keep this same mental model.

## v2 navigation rule

Use simple words that match real event operation.

Recommended organizer tabs:

```text
1. Event
2. Players
3. Courts
4. Results
```

Alternative for advanced mode later:

```text
Check-in
Queue
Courts
Results
```

But the default live event UI should feel like the original simple flow, not like a complex SaaS dashboard.

## Organizer live screen priority

The organizer should always see these first:

1. Current event name
2. Number of players
3. Ready / playing / pending score counts
4. Court board
5. One clear next action

The page should answer this question immediately:

> What should I do next?

## One-primary-action rule

At any moment, the organizer should have one obvious main action:

- Open check-in
- Generate next matches
- Start selected match
- Confirm score
- Complete event
- Copy summary link

Secondary actions should not compete with the main action.

## Do not overload event cards

The first system became risky when extra buttons were added directly to event cards close to real usage.

In v2:

- Primary action can be a big button.
- Secondary actions should be in `More` menu or small secondary section.
- Delete / archive should not be placed beside important live actions.
- Destructive actions must require confirmation.

## Mobile-first rules

Most real usage will happen on a phone at the court.

Rules:

- Main buttons must be thumb-friendly.
- Text must be readable outdoors.
- The organizer should not need to scroll too much to confirm score.
- Court cards must show team names clearly.
- Saving state must be visible.
- Error state must clearly say what to do next.

## Familiar UI labels

Use familiar language from the first system:

```text
Open Play
Check-in
Ready
Court
Start Match
Confirm Score
Ranking
Match History
Summary Link
```

Avoid overly technical labels like:

```text
Tenant
Entity
Mutation
Idempotency
Workflow Instance
```

These can exist in code, but not in the live organizer UI.

## Safety improvements over v1

Keep the same flow, but add:

- Loading state
- Saving state
- Retry state
- Duplicate click protection
- Weak internet warning
- Local draft for score
- Audit log
- No iframe injection
- No production patching close to event time

## v2 UX target

A new venue staff member should be able to run a small Open Play session after 10 minutes of explanation.

If they need a manual, the UI is too complicated.

## Product principle

v2 should feel like:

> The same GDSQ OpenPlay system, but calmer, safer, cleaner, and ready for venues.

Not like:

> A completely new complicated admin platform.
