# GLOBAL STREAMVERSE

GLOBAL STREAMVERSE is an international ARMY listening-history and community statistics platform. The production site is https://global-streamverse.vercel.app/.

## Product rules

- Musicat is the source of truth for public community listening history and country totals.
- Spotify is used in two separate ways: metadata/artwork for the Musicat song catalog, and optional private listening-history imports for an account owner who explicitly connects Spotify.
- Spotify account history is private. It is shown only inside the authenticated owner's profile and is never included in public profiles, country rankings, or the community catalog.
- Last.fm and ListenBrainz are not part of the active tracking pipeline.
- Public profiles show only consented, approved Musicat activity.
- Candidate Spotify releases are not counted or shown as confirmed album editions. Track and album totals include only uniquely matched catalog entries.
- Public pages have no editing tools, pending-edition controls, or outbound Spotify listening redirects.

## Main application

- `index.html` and `src.js` provide the React application shell and routes.
- `/` contains account access, the public ARMY directory, and daily country totals.
- `/analytics` contains the public community statistics dashboard.
- `/tracks.html` contains the Musicat song catalog and confirmed album views, with period filters and listening-history detail.
- `/profile.html` is the separate personal profile. Public profile URLs use `/profile.html?u=<handle>`.
- `site/` contains the legacy compatibility pages.
- `api/analytics.py` and `api/catalog.py` provide the Python endpoints used by Vercel.

## Musicat background sync

The GitHub Actions workflow `.github/workflows/sync-musicat.yml` runs every 10 minutes. It also supports manual dispatch and runs on pushes to `main`.

The worker:

1. Reads only consented Musicat participants from Supabase.
2. Automatically validates pending public Musicat profiles.
3. Uses Playwright to read visible public Musicat history; it does not rely on undocumented Musicat internal APIs.
4. Starts counting at the participant's integration time, so older plays are not added retroactively.
5. Uses a saved history cursor for large backfills and resumes safely on the next run.
6. Deduplicates each play by Musicat track ID and exact play timestamp.
7. Writes verified events to `public.stream_events`; database triggers maintain public daily country totals.
8. Keeps the cursor unchanged if a history scan is incomplete so the next run can retry.

The workflow requires a protected GitHub Actions repository secret named `SUPABASE_SECRET_KEY`. Never place this secret in browser code, commit it, or send it in chat.

## Private Spotify history

Spotify connection is optional and is available only in the signed-in owner's profile.

- OAuth is handled by the Supabase Edge Function `spotify-oauth`.
- Access and refresh tokens are encrypted before being stored.
- `spotify-sync` refreshes tokens and imports recent listening events.
- Monthly song, artist, and account summaries are stored in the existing `spotify_monthly_track_stats`, `spotify_monthly_artist_stats`, and `spotify_monthly_stats` tables.
- The scheduled database rollup refresh runs daily at 03:15 UTC.
- Disconnecting Spotify revokes the stored connection and clears the encrypted tokens.

The private Spotify tables have RLS enabled and are accessed through authenticated functions or protected server-side sync. They are not used as a public community source.

## Catalog and metadata

The `tracks-catalog` Supabase Edge Function reads the verified Musicat catalog and enriches matched tracks with Spotify metadata such as artwork, release title, album type, track number, and duration. The public catalog displays only confirmed matches and never attributes plays to ambiguous candidate releases.

The provided draft `schema.sql.txt` was not applied as a second set of scrobble tables because the production database already contains the equivalent private Spotify event and monthly-rollup tables. The draft `spotify-refresh` function was not deployed because the active OAuth/sync functions already implement authentication, encrypted token storage, and server-side token refresh.

## Validation and tests

- `npm test` runs the browser-page and integration tests.
- `npm run check` validates the public Musicat profile and visible history.
- The scheduled workflow runs Python tests, Node tests, syntax checks, and a browser-based Musicat sync.
- Public profile history is explicitly restricted to Musicat events. Private Spotify and scrobble events are excluded from `get_public_profile`.

## Privacy and attribution

GLOBAL STREAMVERSE is an independent fan project and is not affiliated with BTS, HYBE, Musicat, Spotify, or Apple Music. Country is self-declared. The platform does not use visitors' location to assign a country.
