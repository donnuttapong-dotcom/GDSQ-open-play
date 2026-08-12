# GDSQ Open Play V2 Member Capacity Audit

Date: 2026-08-12

## Current infrastructure

- Frontend: static HTML/JS on GitHub Pages.
- Backend: Supabase Free plan, Nano compute, PostgreSQL 17.
- Current database size: 15 MB.
- Current V2 data: 1 email member, 20 event participants, 33 matches, 132 match-player rows.
- Avatar storage: 1 object / 183,224 bytes. The client permits up to 420 KB per compressed avatar.
- Admin members now use 25-row server pagination and indexed name/email search.
- Open Play Manage/Stats polls two event-scoped queries every three seconds.
- Hall of Fame still loads all events, participants, confirmed matches, and match-player rows into the browser.

## Measured database tests

All write tests ran in transactions and were rolled back.

| Test | Result |
| --- | ---: |
| 100 verified registrations, sequential | 105.972 ms total / 1.060 ms average DB time |
| 100 returning-member same-event lookups | 33.380 ms total / 0.334 ms average DB time |
| Member list: 25 rows from 100,000 synthetic members with indexed history | 3.984 ms |
| Trigram member search across 100,000 synthetic members | 31.130 ms |
| Offset page at row 90,000 | 33.096 ms |
| Indexed career lookup | 6.838 ms |

These are database execution times, not full internet latency or Auth email-delivery time. They show that the new member queries are not the first scaling limit.

## Capacity assessment

| Registered members | Current architecture |
| --- | --- |
| 1,000 | Supported with comfortable headroom for Beta use. |
| 10,000 | Database member queries remain viable, but Free Storage, the browser-loaded Hall of Fame, GitHub Pages hosting, and polling require changes first. |
| 50,000 | Not safe on the current Free/Nano architecture. This also reaches the Free-plan MAU allowance if all accounts are active. |
| 100,000+ | Requires paid compute/storage, server-side Hall aggregation, keyset pagination, production hosting, monitoring, and load testing in a staging environment. |

Conservative operating threshold for the current Beta:

- Total registered members: about 2,000 when planning for every member to upload a maximum-size avatar.
- Concurrent active users: about 50 sustained on Manage/Stats; up to 100 should be treated as a short burst and monitored.
- Expected Beta before infrastructure work: 1,000-2,000 registered members and no more than about 50 concurrently active users.

The avatar limit is important: 2,000 maximum-size avatars consume about 840 MB of the 1 GB Free Storage allowance before operational headroom. At the current observed 183 KB average, the theoretical count is higher, but the safe threshold must not assume every future image stays near that average.

## Required before 10,000 members

1. Upgrade Supabase to Pro and monitor CPU, Disk IO, database size, egress, Auth MAU, and Storage.
2. Replace browser-wide Hall of Fame loading with server-side paginated career aggregates.
3. Replace large-offset pagination with cursor/keyset pagination for deep pages.
4. Move the production frontend from GitHub Pages to hosting intended for an operational application.
5. Reduce or adapt the three-second Manage/Stats polling, or move event updates to controlled Realtime subscriptions.
6. Add staged HTTP concurrency tests for Auth, registration, event refresh, score confirmation, and Admin member history.

## Security and integrity

- Normal email registration and owner display-name edits do not require Admin approval.
- Email verification remains required before a permanent profile/event registration is created.
- Normalized email, normalized display name, organization/user, and event/player uniqueness are enforced by database indexes.
- Member directory RPCs are `SECURITY INVOKER` and executable only by `service_role`; browser access goes through the JWT-protected Admin Edge Function plus Admin email/passcode checks.
- Historical email-less profile claims remain the only member-related approval flow.
