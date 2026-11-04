import test from "node:test";
import assert from "node:assert/strict";
import {
  extractMusicatUserId,
  filterMusicatRowsSince,
  hasReachedMusicatIntegrationCutoff,
  musicatInitialBackfillCutoff,
  musicatDedupeKey,
  normalizeMusicatRows,
  parseMusicatProfileUrl,
  waitForMusicatUserId
} from "../src/musicat-reader.mjs";

test("accepts a public Musicat profile URL", () => {
  const url = parseMusicatProfileUrl("https://musicat.fm/lightjjk");
  assert.equal(url.hostname, "musicat.fm");
  assert.equal(url.pathname, "/lightjjk");
  assert.equal(parseMusicatProfileUrl("https://www.musicat.fm/lightjjk").hostname, "musicat.fm");
});

test("rejects non-Musicat and non-HTTPS profile URLs", () => {
  assert.throws(() => parseMusicatProfileUrl("http://musicat.fm/lightjjk"));
  assert.throws(() => parseMusicatProfileUrl("https://musicat.fm.evil.example/lightjjk"));
  assert.throws(() => parseMusicatProfileUrl("https://example.com/lightjjk"));
});

test("extracts only a user UUID from a visible /users/ route", () => {
  assert.equal(
    extractMusicatUserId([
      "/tracks/0a0f177e-bd48-422f-845e-ed494da3d193",
      "/users/a26e7b80-9a8d-4dc3-b7d8-59fc7a21b672/history"
    ]),
    "a26e7b80-9a8d-4dc3-b7d8-59fc7a21b672"
  );
  assert.equal(extractMusicatUserId(["/tracks/a26e7b80-9a8d-4dc3-b7d8-59fc7a21b672"]), null);
});

test("waits for the public Musicat user history link to hydrate", async () => {
  const userId = "a26e7b80-9a8d-4dc3-b7d8-59fc7a21b672";
  let waited = false;
  const page = {
    waitForFunction: async (_predicate, _argument, options) => {
      waited = true;
      assert.equal(options.timeout, 2000);
    },
    evaluate: async () => ["/users/undefined", "/users/" + userId + "/history"]
  };

  assert.equal(await waitForMusicatUserId(page, 2000), userId);
  assert.equal(waited, true);
});

test("returns null when the public Musicat page only exposes an undefined user route", async () => {
  const page = {
    waitForFunction: async () => { throw new Error("timeout"); },
    evaluate: async () => ["/users/undefined", "/users/not-a-uuid/history"]
  };

  assert.equal(await waitForMusicatUserId(page, 2000), null);
});

test("normalizes complete visible rows and skips incomplete rows", () => {
  const rows = normalizeMusicatRows([
    {
      trackId: "track-1",
      title: " SWIM ",
      artist: " BTS ",
      playedAt: "2026-11-03T02:49:19.017Z",
      source: "Spotify",
      album: "ARIRANG"
    },
    { trackId: "track-2", title: "No artist", artist: "", playedAt: "2026-11-03T02:50:00Z", source: "Spotify" }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "SWIM");
  assert.equal(rows[0].artist, "BTS");
  assert.equal(rows[0].playedAt, "2026-11-03T02:49:19.017Z");
  assert.equal(rows[0].album, "ARIRANG");
});

test("creates a stable deduplication key from the track ID and exact timestamp", () => {
  const key = musicatDedupeKey({
    trackId: "track-1",
    playedAt: "2026-11-03T02:49:19.017Z"
  });
  assert.equal(key, "musicat:track-1:2026-11-03T02:49:19.017Z");
  assert.throws(() => musicatDedupeKey({ trackId: "track-1", playedAt: "not-a-date" }));
});

test("filters inclusively from the participant integration or previous-sync cutoff", () => {
  const rows = [
    { playedAt: "2026-11-03T02:00:00.000Z" },
    { playedAt: "2026-11-03T02:05:00.000Z" },
    { playedAt: "2026-11-03T02:10:00.000Z" }
  ];
  assert.deepEqual(
    filterMusicatRowsSince(rows, "2026-11-03T02:05:00.000Z").map(row => row.playedAt),
    ["2026-11-03T02:05:00.000Z", "2026-11-03T02:10:00.000Z"]
  );
});

test("resumes an initial backfill just before the saved timestamp", () => {
  assert.equal(
    musicatInitialBackfillCutoff(
      "2026-11-01T00:00:00.000Z",
      "2026-11-02T12:00:00.000Z"
    ),
    "2026-11-02T11:59:59.999Z"
  );
});

test("never moves the backfill cursor earlier than participant integration", () => {
  assert.equal(
    musicatInitialBackfillCutoff(
      "2026-11-02T00:00:00.000Z",
      "2026-11-01T12:00:00.000Z"
    ),
    "2026-11-02T00:00:00.000Z"
  );
});

test("recognizes the integration cutoff or a confirmed exhausted public history", () => {
  assert.equal(
    hasReachedMusicatIntegrationCutoff(
      "2026-11-02T00:00:00.000Z",
      "2026-11-02T01:00:00.000Z",
      false
    ),
    true
  );
  assert.equal(
    hasReachedMusicatIntegrationCutoff(
      "2026-11-02T02:00:00.000Z",
      "2026-11-02T01:00:00.000Z",
      true
    ),
    true
  );
  assert.equal(
    hasReachedMusicatIntegrationCutoff(
      "2026-11-02T02:00:00.000Z",
      "2026-11-02T01:00:00.000Z",
      false
    ),
    false
  );
});


test("keeps album optional when Musicat does not expose release metadata", () => {
  const rows = normalizeMusicatRows([{
    trackId: "track-3",
    title: "SWIM",
    artist: "BTS",
    playedAt: "2026-11-03T02:49:19.017Z",
    source: "Spotify"
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].album, null);
});
