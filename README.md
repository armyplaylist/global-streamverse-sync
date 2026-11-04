# GLOBAL STREAMVERSE — Musicat Sync

This repository contains the GLOBAL STREAMVERSE frontend (`site/index.html`), public-history validator, and guarded Musicat sync worker.

## Verified behavior

- Public Musicat profile navigation was verified with a clean browser session.
- The history page exposes timestamped visible play rows even when a session notice is displayed.
- The validation workflow successfully read 200 rows across three incremental scroll batches.
- Every validated row had a track title, artist, stable track ID and ISO timestamp.
- Validation is read-only: it does not write to Supabase or count plays.

## Sync design

The worker reads only approved Musicat participants from Supabase and reads the visible public Musicat history UI with Playwright. The public frontend collects the country, public profile URL and explicit consent; no private Musicat or Spotify credentials are requested. It does not use Musicat internal APIs, Spotify APIs, or Spotify account credentials.

For each participant:
1. The first sync cutoff is the participant's created_at timestamp (integration time).
2. If a first-time backfill exceeds the per-run scroll limit, history_cursor_at stores the oldest timestamp reached and the next run resumes immediately before that cursor.
3. Later syncs use last_synced_at with a five-minute overlap to recover delayed rows safely.
4. History rows are read newest-first, loading additional visible batches until the cutoff or the end of the public history is confirmed.
5. Events before the original integration timestamp are excluded.
6. Each event uses the Musicat track ID and exact play timestamp as its deduplication key.
7. The worker writes to stream_events; existing database triggers maintain country totals.
8. If history loading is incomplete, the cursor is not advanced. The next run retries from the saved history cursor.

## Required protected setting

The worker requires a GitHub Actions repository secret named `SUPABASE_SECRET_KEY`. It must be a dedicated Supabase secret API key stored only as that GitHub secret. Never commit it, put it in browser code, or send it in chat.

The sync workflow runs automatically every five minutes, can also be started manually, and runs on pushes to `main`. It checks the protected secret before accessing Supabase, validates pending public profiles, and then syncs approved profiles. The private profile's **Actualizar desde Musicat** button inserts a protected sync request; the worker prioritizes that participant on its next scheduled run, reports whether the capture completed, and keeps the request queued if a paginated history scan must continue. The request survives closing the page. The public page refreshes displayed country totals every five minutes so new totals appear after a sync finishes. The personal profile distinguishes the last successful Musicat capture, the timestamp of the newest play reported by Musicat, and when the newest event was inserted into Streamverse.

## Workflows

- Validate public Musicat history — safe read-only browser validation and unit tests.
- Sync approved Musicat profiles — scheduled every 10 minutes, with manual and main-branch push triggers.

No song, album, or artist rankings are produced by this project.


## React + Python analytics

- The React shell lives in the repository root (`index.html` and `src.js`) and keeps the existing public Musicat pages available while the migration continues.
- The React **Estadísticas** page calls the FastAPI endpoint at `/api/analytics`.
- The Python endpoint reads only the public, consented directory via the `get_public_profiles` and `get_public_profile` RPCs. It does not use a service-role or Supabase secret key.
- The analytics endpoint caches responses briefly and labels the track list as a recent sample (up to 50 latest events per public profile), not an all-time track ranking.
- Vercel uses the lightweight root `requirements.txt`; the separate Streamlit admin app keeps its own dependencies in `admin/requirements.txt`.


### Python catalog analytics

- `api/catalog.py` exposes `/api/catalog`, which securely proxies the existing `tracks-catalog` Supabase Edge Function and adds album totals, top songs, and candidate album summaries.
- The public Tracks page now reads the catalog through this Python endpoint; the Spotify client secret remains inside Supabase Edge Function secrets.
- The React **Estadísticas** page combines the public-profile summary endpoint with Python's catalog rankings.
- Confirmed album totals include only songs with a unique Spotify match. Candidate releases remain separate and receive no attributed plays.
- The API keeps a short in-memory cache to avoid repeatedly triggering catalog enrichment.
- The latest deployment is a Vercel preview; the production domain has not been reassigned.


- The React app now renders the Tracks and Albums views directly from `/api/catalog`, including period filters, search, album details, confirmed releases, and a separate candidate-release list.
- The existing homepage and profile are still served in the compatibility iframe while those screens are migrated.
