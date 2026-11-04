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


test("profile exposes secure Musicat refresh and separates capture, play and record times", () => {
  assert.match(profile, /id="refresh"/);
  assert.match(profile, /Actualizar Musicat/);
  assert.match(profile, /musicat_sync_requests/);
  assert.match(profile, /last_capture_at/);
  assert.match(profile, /last_played_at/);
  assert.match(profile, /last_recorded_at/);
  const match = profile.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "profile script should exist");
  assert.doesNotThrow(() => new Script(match[1]), "profile JavaScript should parse");
});

test("React profile preserves private auth, editable identity, Spotify and scrobble connections", () => {
  const app = readFileSync(new URL("../src.js", import.meta.url), "utf8");
  assert.match(app, /function Profile\(\)/);
  assert.match(app, /identity\(\{\.\.\.person,\.\.\.mine\}\)/);
  assert.match(app, /window\.location\.href="\/#access"/);
  assert.match(app, /spotify-oauth/);
  assert.match(app, /Conectar con Spotify/);
  assert.match(app, /Conectar ListenBrainz/);
  assert.match(app, /Conectar Last\.fm/);
  assert.match(app, /musicat_sync_requests/);
});
