import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");

test("keeps the participant registration form and explicit consent", () => {
  assert.match(html, /id="participantForm"/);
  assert.match(html, /id="consent"[^>]*required/);
  assert.match(html, /id="profile"[^>]*required/);
  assert.match(html, /id="country"[^>]*required/);
});

test("shows country totals only and contains no ranking or leaderboard UI", () => {
  assert.match(html, /id="countryTotals"/);
  assert.match(html, /loadCountryTotals\(\)/);
  assert.doesNotMatch(html, /ranking|rankings|leaderboard|top contributors|cuadro de honor/i);
});

test("uses the public Supabase key as an apikey header only", () => {
  assert.match(html, /const headers=\{apikey:SUPABASE_KEY\};/);
  assert.doesNotMatch(html, /Authorization:\s*["']Bearer\s*["']\s*\+\s*SUPABASE_KEY/);
});

test("accepts only the public Musicat profile route shape", () => {
  assert.match(html, /pathname\.split\(["']\/["']\)\.filter\(Boolean\)\.length===1/);
});
