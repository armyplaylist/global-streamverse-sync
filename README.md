# GLOBAL STREAMVERSE — Musicat sync

Independent worker for GLOBAL STREAMVERSE. This repository is intentionally separate from the ARMY playlist and voting projects.

## Product rules

- No rankings, leaderboards, or song/artist popularity tables.
- Store individual listening events only: participant, country, track, artist, and the timestamp shown in Musicat.
- A participant's counting window begins at their integration/approval timestamp. Older history must never be counted.
- Read only the public Musicat website as a normal browser user. Do not call Musicat private APIs, websockets, or Spotify APIs.
- Deduplicate every event. Re-running a sync must not increase totals for an event already stored.
- Never guess a timestamp, artist, track, or country. If the public UI cannot be read reliably, fail the sync and report the reason.
- Participants must explicitly consent and be approved before collection starts.

## Current verified state (2026-11-03)

- Supabase project and tables exist: `participants`, `stream_events`, `sync_runs`, and `country_totals`.
- Existing Supabase Edge Function `sync-participant` is only a guarded placeholder and returns `CONNECTOR_PENDING_VALIDATION`. It does not import events.
- A previous browser check could render a Musicat history page and inspect recent rows. A fresh check on 2026-11-03 was stopped by Musicat's message: "The state of your account has changed. Please log in again." The history is therefore not currently validated as reliably readable without an authenticated Musicat session.
- No participant records or listening events have been inserted.
- No scheduled sync is active.

## Planned worker

1. Read only approved, consented participants from Supabase.
2. Open each participant's public Musicat profile and visible history in Playwright.
3. Parse only clearly identified visible track/artist/timestamp rows.
4. Discard events older than the participant's `created_at` integration boundary.
5. Insert rows with a deterministic deduplication key; rely on database uniqueness to make retries safe.
6. Record sync status and last successful sync. Country totals are derived from saved individual events.

## Required repository Actions secrets

Before enabling a scheduled workflow, configure these in **Settings → Secrets and variables → Actions → New repository secret**:

- `SUPABASE_URL`: project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Keep it secret; never put it in source code, commits, browser code, or chat.

The worker must use the service-role key only in the GitHub Actions runtime. Do not add a secret until the browser parser and database write path have been tested end-to-end.

## Safety / rollout gate

Do not enable scheduled collection until all of the following pass:

- Musicat history is accessible through the public UI without relying on a private account session.
- DOM parsing is validated against actual visible rows and their timestamps.
- Integration-time cutoff and deduplication are tested.
- A test event is inserted into Supabase and verified; then the test data is removed or clearly marked.
- A sync run reports success only after the database confirms inserts/upserts.

Until then, the production site and existing Supabase tables remain unchanged.
