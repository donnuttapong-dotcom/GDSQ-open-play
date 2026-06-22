# GDSQ OpenPlay Platform v2 — Data Model Draft

## 1. Data design goal

The database must support multiple organizations, multiple venues, multiple events, and many players without mixing data between tenants.

Every important record must belong to an organization either directly or through an event/venue.

## 2. Main entities

```text
organizations
venues
events
players
event_players
courts
matches
match_players
audit_logs
staff_members
subscriptions
```

## 3. organizations

Represents a business owner, venue group, club, or organizer company.

Suggested fields:

```text
id uuid primary key
name text not null
slug text unique
plan text default 'free'
status text default 'active'
created_at timestamptz
updated_at timestamptz
```

## 4. venues

A physical place or court location.

```text
id uuid primary key
organization_id uuid references organizations(id)
name text not null
location_text text
court_count int default 1
status text default 'active'
created_at timestamptz
updated_at timestamptz
```

## 5. events

A session, Open Play, tournament day, league night, or community event.

```text
id uuid primary key
organization_id uuid references organizations(id)
venue_id uuid references venues(id)
name text not null
event_date date
start_time time
end_time time
status text default 'draft'
max_players int
court_count int
checkin_open boolean default false
created_at timestamptz
updated_at timestamptz
completed_at timestamptz
```

Recommended statuses:

```text
draft
open
live
completed
archived
deleted
```

## 6. players

Global player profile within an organization.

```text
id uuid primary key
organization_id uuid references organizations(id)
display_name text not null
phone text nullable
email text nullable
default_level numeric nullable
status text default 'active'
created_at timestamptz
updated_at timestamptz
```

## 7. event_players

Player registration and status for a specific event.

```text
id uuid primary key
event_id uuid references events(id)
organization_id uuid references organizations(id)
player_id uuid references players(id)
display_name text not null
estimated_level numeric
status text default 'checked_in'
queue_joined_at timestamptz
matches_played int default 0
wins int default 0
losses int default 0
points_for int default 0
points_against int default 0
created_at timestamptz
updated_at timestamptz
```

Recommended statuses:

```text
registered
checked_in
ready
playing
resting
left
removed
```

## 8. courts

Optional table. Can also be generated from event court count.

```text
id uuid primary key
event_id uuid references events(id)
organization_id uuid references organizations(id)
court_number int
name text
status text default 'available'
created_at timestamptz
updated_at timestamptz
```

Recommended statuses:

```text
available
assigned
playing
maintenance
closed
```

## 9. matches

A match instance assigned to a court.

```text
id uuid primary key
organization_id uuid references organizations(id)
event_id uuid references events(id)
court_number int
status text default 'preview'
team_a_score int nullable
team_b_score int nullable
winner text nullable
started_at timestamptz nullable
completed_at timestamptz nullable
created_by uuid nullable
confirmed_by uuid nullable
idempotency_key text nullable
created_at timestamptz
updated_at timestamptz
```

Recommended statuses:

```text
preview
assigned
playing
pending_score
confirmed
cancelled
deleted
```

## 10. match_players

Who played in a match and on which team.

```text
id uuid primary key
organization_id uuid references organizations(id)
event_id uuid references events(id)
match_id uuid references matches(id)
event_player_id uuid references event_players(id)
player_id uuid references players(id)
team text not null
slot int
created_at timestamptz
```

Team values:

```text
A
B
```

## 11. audit_logs

Every critical action should be logged.

```text
id uuid primary key
organization_id uuid references organizations(id)
event_id uuid nullable
actor_id uuid nullable
action text not null
entity_type text
entity_id uuid nullable
metadata jsonb
created_at timestamptz
```

Examples:

```text
player_checked_in
match_generated
match_started
score_confirmed
score_retry_failed
event_completed
event_deleted
```

## 12. staff_members

Staff and organizer permissions.

```text
id uuid primary key
organization_id uuid references organizations(id)
user_id uuid nullable
name text
email text
role text default 'staff'
status text default 'active'
created_at timestamptz
updated_at timestamptz
```

Roles:

```text
owner
admin
organizer
staff
viewer
```

## 13. subscriptions

Later phase.

```text
id uuid primary key
organization_id uuid references organizations(id)
plan text
status text
billing_cycle text
started_at timestamptz
expires_at timestamptz
created_at timestamptz
updated_at timestamptz
```

## 14. Data safety rules

- Never delete match history hard unless admin confirms.
- Use `status='deleted'` for soft delete.
- Score confirmation should be idempotent.
- Event summary must remain readable after event is completed.
- Data should be filtered by organization.

## 15. v1 migration note

The old system currently has related concepts like events, players, matches, and match-player rows. v2 should not mutate v1 tables during early development.

Migration can be handled later through an import script after the v2 model is stable.
