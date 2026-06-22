# GDSQ OpenPlay Platform v2 — Product Requirements

## 1. Product vision

Build a stable pickleball event and club operating system that can be licensed to venues, organizers, and clubs.

The platform should help organizers run Open Play sessions smoothly, reduce manual queue confusion, keep fair court rotation, record match results, and create shareable event summaries.

## 2. Current problem from v1 usage

The current system proved the product idea, but real event usage showed issues:

- Wrapper pages and iframe patches can break or feel slow.
- UI changes made close to event time create risk.
- Buttons can fail when the inner app is not ready.
- Weak internet can make save actions feel stuck.
- The organizer flow needs stronger loading, saving, retry, and error states.
- There is no clean multi-venue structure yet.

## 3. v2 product goals

### Must-have goals

- Run one real Open Play event from start to finish without freezing.
- Work clearly on mobile for organizers and players.
- Save score safely with retry behavior.
- Avoid duplicate confirms or accidental double clicks.
- Support event-specific check-in link and QR.
- Generate public summary link after event.
- Keep old system untouched while v2 is being built.

### Business goals

- Allow one organization to manage multiple venues.
- Allow each venue to create events and view statistics.
- Support paid plans later.
- Let organizers use branded event pages.
- Let players build history and ranking over time.

## 4. Primary users

### Venue owner

Wants to see sessions, player volume, repeat players, peak times, event summaries, and revenue opportunities.

### Organizer / staff

Wants to check players in, manage courts, start matches, confirm scores, and handle disputes quickly.

### Player

Wants to check in easily, know when to play, see match results, and view their stats.

### Public viewer

Wants to open a shared event summary after the session.

## 5. v2 modules

### 5.1 Organization and venue

- Create organization
- Create venue
- Venue settings
- Court count
- Branding color/logo later
- Staff roles

### 5.2 Event setup

- Create event
- Date / time / venue / court count
- Event status: draft, open, live, completed, archived
- Player limit
- Check-in mode
- Matchmaking rules

### 5.3 Check-in

- Event-specific QR
- Player name
- Player level
- Player status
- Staff can edit player level
- Prevent duplicate player entries if possible

### 5.4 Organizer court board

- Current courts
- Ready queue
- Playing players
- Resting players
- Pending score matches
- Generate next matches
- Manual override

### 5.5 Matchmaking

- Low games first
- Avoid 3 consecutive games
- Balance levels
- Avoid repeated partners
- Avoid repeated opponents
- Respect available courts
- Do not generate if fewer than 4 eligible players

### 5.6 Score confirmation

- Score input
- Confirm button has saving state
- Prevent double confirm
- Retry if save fails
- Save local draft if network is weak
- Write audit log

### 5.7 Event summary

- Public read-only event page
- Player ranking
- Match history
- Player popup
- Copy summary link
- Copy share message
- Mobile-first layout

### 5.8 Admin analytics

Later phase:

- Players per event
- Average matches per player
- Retention
- Most active players
- Venue usage
- Export CSV

## 6. Non-goals for first v2 build

Do not build these in the first sprint:

- Online payment
- Full tournament bracket
- Membership payment
- Marketplace/shop
- Complex sponsor ads
- Native mobile app

## 7. Success criteria for v2 beta

The v2 beta is successful when:

- One organizer can run a 2-hour Open Play session without code changes.
- 16–32 players can check in and rotate through courts.
- Scores can be confirmed without duplicate records.
- Summary page can be shared after event.
- System works on Chrome/Safari mobile.
- Old v1 pages remain untouched and usable.

## 8. Production event rule

No code changes within 24 hours before a real event unless it is a critical hotfix.

All new features must be tested in v2 sandbox before being used in live events.
