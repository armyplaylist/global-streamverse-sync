import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
const profile = readFileSync(new URL("../site/profile.html", import.meta.url), "utf8");

test("provides username/password registration and login without email", () => {
  assert.match(html, /id="loginForm"/);
  assert.match(html, /id="signupForm"/);
  assert.match(html, /id="newUsername"/);
  assert.match(html, /id="newPassword"/);
  assert.match(html, /id="loginUsername"/);
  assert.match(html, /id="loginPassword"/);
  assert.match(html, /accounts\.global-streamverse\.invalid/);
});

test("registration collects nickname, country, Musicat profile and consent", () => {
  assert.match(html, /id="displayName"/);
  assert.match(html, /id="country"/);
  assert.match(html, /id="profile"/);
  assert.match(html, /id="consent"[^>]*required/);
  assert.match(html, /functions\/v1\/register-participant/);
});

test("shows public nickname and country flag directory, not account credentials", () => {
  assert.match(html, /id="memberDirectory"/);
  assert.match(html, /countryFlag\(m\.country_code\)/);
  assert.match(html, /get_public_profiles/);
  assert.match(html, /m\.display_name/);
  assert.match(html, /m\.handle/);
  assert.doesNotMatch(html, /participant_directory\?select=[^"`]*\b(?:login_username|password|provider_username|public_profile_url)\b/i);
  assert.match(html, /name\.textContent=m\.display_name/);
  assert.match(html, /country\.textContent=\(COUNTRY_NAMES\[m\.country_code\]\|\|m\.country_code\)/);
});

test("shows the professional country ranking dashboard with live stream data", () => {
  assert.match(html, /id="countryTotals"/);
  assert.match(html, /id="countryChart"/);
  assert.match(html, /id="globalStreams"/);
  assert.match(html, /id="activeCountries"/);
  assert.match(html, /id="leadingCountry"/);
  assert.match(html, /loadCountryTotals\(\)/);
  assert.match(html, /order=total_streams\.desc/);
  assert.match(html, /Ranking global de streams BTS/);
});

test("uses the public Supabase key only as an apikey header", () => {
  assert.match(html, /apikey:SUPABASE_KEY/);
  assert.doesNotMatch(html, /Authorization:\s*["']Bearer\s*["']\s*\+\s*SUPABASE_KEY/);
});


test("profile hides editing and manual refresh controls while keeping Musicat statistics", () => {
  assert.match(profile, /\.twitter-buttons,#profileEditor\{display:none!important\}/);
  assert.match(profile, /musicat_sync_requests/);
  assert.match(profile, /last_capture_at/);
  assert.match(profile, /last_played_at/);
  assert.match(profile, /last_recorded_at/);
  assert.match(profile, /data-history-days="365"/);
  assert.match(profile, /id="historyTopTracks"/);
  assert.match(profile, /id="historyTopArtists"/);
  assert.match(profile, /renderProfileHistory\(d\.history\)/);
  const match = profile.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "profile script should exist");
  assert.doesNotThrow(() => new Script(match[1]), "profile JavaScript should parse");
});

test("React profile keeps private auth and Musicat-only read-only statistics", () => {
  const app = readFileSync(new URL("../src.js", import.meta.url), "utf8");
  assert.match(app, /function Profile\(\)/);
  assert.match(app, /identity\(\{\.\.\.person,\.\.\.mine\}\)/);
  assert.match(app, /window\.location\.href="\/#access"/);
  assert.doesNotMatch(app, /Editar perfil|Actualizar Musicat|Conectar con Spotify|Conectar ListenBrainz|Conectar Last\.fm/);
  assert.match(app, /const spotifySection=!publicView\?/);
  assert.match(app, /spotify-oauth/);
  assert.match(app, /get_my_spotify_monthly_stats/);
  assert.match(app, /spotifySection,/);
});

test("tracks page exposes individual song and album listening history without attributing candidate editions", () => {
  const tracks = readFileSync(new URL("../site/tracks.html", import.meta.url), "utf8");
  assert.match(tracks, /id="trackDetail"/);
  assert.match(tracks, /data-track-id/);
  assert.match(tracks, /openTrackHistory/);
  assert.match(tracks, /loadAlbumHistory/);
  assert.match(tracks, /detail:"track"/);
  assert.match(tracks, /detail:"album"/);
  assert.match(tracks, /album\.candidate\?null/);
  const scriptStart = tracks.indexOf("<script>") + "<script>".length;
  const scriptEnd = tracks.indexOf("</script>", scriptStart);
  assert.ok(scriptStart >= 8 && scriptEnd > scriptStart, "tracks script should exist");
  assert.doesNotThrow(() => new Script(tracks.slice(scriptStart, scriptEnd)), "tracks JavaScript should parse");
});

test("tracks catalog edge function validates identifiers and limits history to Musicat aggregates", () => {
  const edge = readFileSync(new URL("../supabase/functions/tracks-catalog/index.ts", import.meta.url), "utf8");
  assert.match(edge, /loadHistoryDetail/);
  assert.match(edge, /provider=eq\.musicat/);
  assert.match(edge, /Invalid Musicat track id/);
  assert.match(edge, /Invalid album reference/);
  assert.match(edge, /streams_365d/);
});

test("artists verse provides exact-credit rankings, individual history and daily evolution", () => {
  const tracks = readFileSync(new URL("../site/tracks.html", import.meta.url), "utf8");
  const edge = readFileSync(new URL("../supabase/functions/tracks-catalog/index.ts", import.meta.url), "utf8");
  assert.match(tracks, /data-view="artists"/);
  assert.match(tracks, /id="artistList"/);
  assert.match(tracks, /openArtistHistory/);
  assert.match(tracks, /detail:"artists"/);
  assert.match(tracks, /detail:"artist"/);
  assert.match(edge, /kind === "artists"/);
  assert.match(edge, /kind === "artist"/);
  assert.match(edge, /Invalid artist name/);
  assert.match(edge, /artist=eq\./);
  assert.match(edge, /exactArtist/);
  assert.match(edge, /Los créditos colaborativos se mantienen juntos/);
  const scriptStart = tracks.indexOf("<script>") + "<script>".length;
  const scriptEnd = tracks.indexOf("</script>", scriptStart);
  assert.doesNotThrow(() => new Script(tracks.slice(scriptStart, scriptEnd)), "artists JavaScript should parse");
});


test("public profile statistics never expose private Spotify or scrobble history", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261104150000_keep_spotify_history_private.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.get_public_profile/);
  assert.match(migration, /where e\.provider = 'musicat'/);
  assert.doesNotMatch(migration, /spotify_listening_events|scrobble_events/);
  assert.match(migration, /Public profile history contains Musicat records only/);
});

test("statistics and catalog pages are read-only without outbound Spotify redirects or pending editions", () => {
  const app = readFileSync(new URL("../src.js", import.meta.url), "utf8");
  const tracks = readFileSync(new URL("../site/tracks.html", import.meta.url), "utf8");
  assert.doesNotMatch(app, /Versiones por confirmar|Versión por confirmar|candidate_albums/);
  const publicApp = app.slice(0, app.indexOf("function Profile()"));
  assert.doesNotMatch(publicApp, /Abrir en Spotify|spotify-link|spotify-oauth|scrobble_connections/);
  assert.doesNotMatch(tracks, /Versiones por confirmar|candidateAlbums|candidateCount|spotify-link|Escuchar en Spotify/);
  assert.doesNotMatch(tracks, /href="https:\/\/open\.spotify\.com/);
  assert.match(tracks, /Registro Musicat/);
  const scriptStart = tracks.indexOf("<script>") + "<script>".length;
  const scriptEnd = tracks.indexOf("</script>", scriptStart);
  assert.doesNotThrow(() => new Script(tracks.slice(scriptStart, scriptEnd)), "clean tracks JavaScript should parse");
});
