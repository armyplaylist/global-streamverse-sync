import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("src.js");
const html = read("index.html");
const css = read("styles.css");

test("new application shell loads the responsive design system and React app", () => {
  assert.match(html, /styles\.css/);
  assert.match(html, /src\.js/);
  assert.match(html, /react-dom\/client/);
  assert.match(html, /lang="es"/);
  assert.match(css, /\.mobile-dock/);
  assert.match(css, /@media\(max-width:650px\)/);
});

test("Streamverse has clean independent routes for home, analytics, tracks, albums and profiles", () => {
  for (const route of ['/analytics','/tracks.html','/albums','/profile.html']) assert.ok(app.includes(route));
  assert.match(app, /function Home\(/);
  assert.match(app, /function Analytics\(/);
  assert.match(app, /function Catalog\(/);
  assert.match(app, /function Profile\(/);
  assert.doesNotMatch(app, /iframe|LEGACY/);
});

test("registration uses Musicat public profile and does not request third-party passwords", () => {
  assert.match(app, /functions\/v1\/register-participant/);
  assert.match(app, /public_profile_url:musicat\.trim\(\)/);
  assert.match(app, /password/);
  assert.match(app, /musicat\.fm/);
  assert.doesNotMatch(app, /musicat_password|spotify_password|lastfm_password/i);
});

test("public and private listening data stay separated", () => {
  assert.match(app, /get_public_profile/);
  assert.match(app, /get_my_stream_profile/);
  assert.match(app, /get_my_spotify_monthly_stats/);
  assert.match(app, /spotify-oauth/);
  assert.match(app, /No se mezcla con las estadísticas públicas/);
});

test("catalog groups confirmed Musicat tracks into separate album views", () => {
  assert.match(app, /match_status==="matched"/);
  assert.match(app, /album_uri/);
  assert.match(app, /function Catalog/);
  assert.match(app, /view==="detail"/);
  assert.match(app, /selectedAlbum\.tracks/);
  assert.match(app, /today_streams/);
  assert.match(app, /week_streams/);
  assert.match(app, /month_streams/);
  assert.match(app, /total_streams/);
  assert.doesNotMatch(app, /candidate_albums|Versiones por confirmar/);
});

test("public statistics label recent track rankings as a sample", () => {
  assert.match(app, /recent_tracks_sample/);
  assert.match(app, /muestra limitada del historial disponible/);
  assert.match(app, /get_public_profiles/);
});

test("browser code uses only the Supabase publishable key for public requests", () => {
  assert.match(app, /const SB_KEY="sb_publishable_/);
  assert.doesNotMatch(app, /sb_secret_|service_role/i);
});

test("private profile editing is owner-authenticated", () => {
  assert.match(app, /currentSession\(\)/);
  assert.match(app, /user_profiles\?id=eq\./);
  assert.match(app, /method:"PATCH"/);
  assert.match(app, /isPublic/);
});

test("public profile RPC excludes private Spotify history", () => {
  const migration = read("supabase/migrations/20261104150000_keep_spotify_history_private.sql");
  assert.match(migration, /create or replace function public\.get_public_profile/);
  assert.match(migration, /where e\.provider = 'musicat'/);
  assert.doesNotMatch(migration, /spotify_listening_events|scrobble_events/);
});

test("Vercel serves the React application without a legacy iframe rewrite", () => {
  const config = read("vercel.json");
  assert.match(config, /"destination": "\/index\.html"/);
});

test("Musicat sync runs every ten minutes and private Spotify sync is a separate step", () => {
  const workflow = read(".github/workflows/sync-musicat.yml");
  assert.match(workflow, /cron:\s*["']\*\/10 \* \* \* \*["']/);
  assert.match(workflow, /functions\/v1\/spotify-sync/);
  assert.doesNotMatch(workflow, /scrobble-sync|ListenBrainz|Last\.fm/);
});

test("Python analytics and catalog endpoints remain available", () => {
  assert.match(read("api/analytics.py"), /@app\.get\("\/api\/analytics"\)/);
  assert.match(read("api/catalog.py"), /@app\.get\("\/api\/catalog"\)/);
});

test("Musicat reader and sync scripts remain syntax-safe source modules", () => {
  assert.match(read("src/musicat-reader.mjs"), /waitForMusicatUserId/);
  assert.match(read("scripts/sync-musicat.mjs"), /sync/);
});
