# GLOBAL STREAMVERSE — Musicat Sync

This repository contains the read-only public-history validator and the guarded Musicat sync worker for GLOBAL STREAMVERSE.

## Verified behavior

- Public Musicat profile navigation was verified with a clean browser session.
- The history page exposes timestamped visible play rows even when a session notice is displayed.
- The validation workflow successfully read 200 rows across three incremental scroll batches.
- Every validated row had a track title, artist, stable track ID and ISO timestamp.
- Validation is read-only: it does not write to Supabase or count plays.

## Sync design

The worker reads only approved Musicat participants from Supabase and reads the visible public Musicat history UI with Playwright. It does not use Musicat internal APIs, Spotify APIs, or Spotify account credentials.

For each participant:
1. The first sync cutoff is the participant's created_at timestamp (integration time).
2. Later syncs use last_synced_at with a five-minute overlap to recover delayed rows safely.
3. History rows are read newest-first, loading additional visible batches until the cutoff is reached.
4. Events before the cutoff are excluded.
5. Each event uses the Musicat track ID and exact play timestamp as its deduplication key.
6. The worker writes to stream_events; existing database triggers maintain country totals.
7. If history loading is incomplete, the cursor is not advanced. The next run retries the missing range.

## Required protected setting

The manual worker workflow requires a GitHub Actions repository secret named SUPABASE_SECRET_KEY. Create a dedicated Supabase secret API key for this worker and store it only as that GitHub secret. Never commit it, put it in browser code, or send it in chat.

The worker workflow is manual-only until the protected secret is configured and an end-to-end test passes. A scheduled trigger is deliberately not enabled yet.

## Workflows

- Validate public Musicat history — safe read-only browser validation and unit tests.
- Sync approved Musicat profiles — writes events to Supabase and is gated by the protected secret above.

No song, album, or artist rankings are produced by this project.
