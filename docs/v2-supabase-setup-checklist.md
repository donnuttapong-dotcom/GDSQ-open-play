# GDSQ OpenPlay v2 — Supabase Setup Checklist

## Status

This checklist prepares v2 for MVP.

Do not connect v2 to production data until this checklist is reviewed.

## Safety rule

v2 must not modify v1 tables.

Use only tables with `v2_` prefix:

```text
v2_organizations
v2_venues
v2_events
v2_players
v2_event_players
v2_matches
v2_match_players
v2_audit_logs
```

## Recommended setup path

### Option A — safest

Create a new Supabase project only for v2.

Pros:

- No risk to v1 production data
- Easy to reset during development
- Clean security rules

Cons:

- Need migration/import later

### Option B — same Supabase project as v1

Use existing project but create only `v2_` tables.

Pros:

- Easier to compare old/new data
- Same billing/project

Cons:

- Higher risk if policies or table names are wrong

Recommendation: **Option A for early MVP**, then decide later.

## Step 1 — Create v2 tables

Review and run:

```text
v2/db/schema.sql
```

Do not run without review.

## Step 2 — Seed demo data

After schema is applied, run:

```text
v2/db/seed.sql
```

This creates:

- Demo organization
- Demo venues
- Demo events
- Demo players
- Demo event players

## Step 3 — Configure client

Copy:

```text
v2/src/services/supabaseClient.example.js
```

To local/private development file:

```text
v2/src/services/supabaseClient.js
```

Add only safe browser anon key.

Never commit service_role key.

## Step 4 — Enable RLS before production

Before production, enable Row Level Security on all v2 tables.

Minimum requirement:

- Only staff in organization can manage organization data
- Public users can only check in to open events
- Public summary can read completed event data only
- Score confirmation only from organizer/staff roles

## Step 5 — Service mode

v2 has service mode control:

```text
mock
supabase
```

Default is mock.

Switch by URL later:

```text
?v=something&mode=supabase
```

Do not use Supabase mode in real events until MVP passes internal testing.

## Step 6 — MVP test flow

Test in this order:

1. Create event
2. Select event
3. Check in 8 players
4. Open Organizer
5. Generate match
6. Start match
7. Input score
8. Confirm score
9. Confirm draft is cleared
10. Confirm audit log is created
11. Open summary
12. Open stats

## Step 7 — Real session dry run

Before replacing v1:

- Run GDSQ internal dry run
- Keep v1 link ready as backup
- Do not update code within 24 hours before real event
- Use one organizer device only
- Use Chrome/Safari, not LINE browser

## Current safe default

Until all above is done:

```text
v1 = live event use
v2 = development sandbox
```
