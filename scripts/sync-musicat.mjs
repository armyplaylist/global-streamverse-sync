import { chromium } from "playwright";
import {
  collectMusicatHistorySince,
  hasReachedMusicatIntegrationCutoff,
  musicatInitialBackfillCutoff,
  extractMusicatUserId,
  musicatDedupeKey,
  parseMusicatProfileUrl
} from "../src/musicat-reader.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ylybwiwemlnekclrwwjq.supabase.co").replace(/\/$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const MAX_PARTICIPANTS = Number.parseInt(process.env.MAX_PARTICIPANTS_PER_RUN || "20", 10);
const MAX_SCROLL_BATCHES = Number.parseInt(process.env.MUSICAT_MAX_SCROLL_BATCHES || "100", 10);
const OVERLAP_MS = Number.parseInt(process.env.MUSICAT_SYNC_OVERLAP_MS || "300000", 10);

if (!SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_SECRET_KEY. Add it as a protected GitHub Actions secret; never place it in source code.");
  process.exit(2);
}
if (!/^https:\/\/[^/]+$/.test(SUPABASE_URL)) {
  console.error("SUPABASE_URL must be an HTTPS project URL.");
  process.exit(2);
}
if (!Number.isInteger(MAX_PARTICIPANTS) || MAX_PARTICIPANTS < 1 || MAX_PARTICIPANTS > 100) {
  console.error("MAX_PARTICIPANTS_PER_RUN must be between 1 and 100.");
  process.exit(2);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error("Supabase REST request failed (" + response.status + "): " + text.slice(0, 500));
  }
  return text ? JSON.parse(text) : null;
}

async function startSyncRun(participantId) {
  const rows = await supabaseRequest("sync_runs", {
    method: "POST",
    prefer: "return=representation",
    body: [{
      participant_id: participantId,
      provider: "musicat",
      status: "running"
    }]
  });
  const id = rows?.[0]?.id;
  if (!id) throw new Error("Supabase did not return the sync run ID.");
  return id;
}

async function finishSyncRun(runId, status, importedCount, errorMessage = null) {
  await supabaseRequest("sync_runs?id=eq." + encodeURIComponent(runId), {
    method: "PATCH",
    prefer: "return=minimal",
    body: {
      status,
      imported_count: importedCount,
      error_message: errorMessage,
      finished_at: new Date().toISOString()
    }
  });
}

async function updateParticipant(participantId, patch) {
  await supabaseRequest("participants?id=eq." + encodeURIComponent(participantId), {
    method: "PATCH",
    prefer: "return=minimal",
    body: patch
  });
}

async function fetchApprovedParticipants() {
  const query = "participants?select=id,country_code,public_profile_url,created_at,last_synced_at,history_cursor_at"
    + "&provider=eq.musicat&status=eq.approved"
    + "&order=last_synced_at.asc.nullsfirst,created_at.asc"
    + "&limit=" + MAX_PARTICIPANTS;
  return await supabaseRequest(query) || [];
}

async function openMusicatHistory(browser, profileUrl) {
  const profile = parseMusicatProfileUrl(profileUrl);
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  try {
    const profileResponse = await page.goto(profile.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    if (!profileResponse?.ok()) {
      throw new Error("Musicat profile returned HTTP " + (profileResponse?.status() ?? "no response"));
    }
    await page.waitForTimeout(1500);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/users/"]')].map(link => link.getAttribute("href") || "")
    );
    const userId = extractMusicatUserId(hrefs);
    if (!userId) throw new Error("The public Musicat profile did not expose a user history link.");

    const historyUrl = new URL("/users/" + userId + "/history", "https://musicat.fm");
    const historyResponse = await page.goto(historyUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    if (!historyResponse?.ok()) {
      throw new Error("Musicat history returned HTTP " + (historyResponse?.status() ?? "no response"));
    }
    return { page, historyUrl: historyUrl.toString() };
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function importEvents(participant, events) {
  if (events.length === 0) return 0;
  const payload = events.map(event => ({
    participant_id: participant.id,
    provider: "musicat",
    dedupe_key: musicatDedupeKey(event),
    artist: event.artist,
    track: event.title,
    played_at: event.playedAt
  }));

  let totalInserted = 0;
  // Smaller batches make large first-time imports more reliable.
  for (let offset = 0; offset < payload.length; offset += 250) {
    const batch = payload.slice(offset, offset + 250);
    const inserted = await supabaseRequest("stream_events?on_conflict=participant_id%2Cdedupe_key", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: batch
    });
    totalInserted += Array.isArray(inserted) ? inserted.length : 0;
  }
  return totalInserted;
}

async function syncParticipant(browser, participant) {
  const runId = await startSyncRun(participant.id);
  let importedCount = 0;
  let page = null;
  try {
    const createdAt = Date.parse(participant.created_at);
    if (!Number.isFinite(createdAt)) throw new Error("Participant has an invalid integration timestamp.");

    const previousSync = participant.last_synced_at ? Date.parse(participant.last_synced_at) : null;
    if (participant.last_synced_at && !Number.isFinite(previousSync)) {
      throw new Error("Participant has an invalid last sync timestamp.");
    }
    const historyCursor = participant.history_cursor_at ? Date.parse(participant.history_cursor_at) : null;
    if (participant.history_cursor_at && !Number.isFinite(historyCursor)) {
      throw new Error("Participant has an invalid initial-history cursor.");
    }

    const isInitialBackfill = previousSync === null;
    const cutoff = isInitialBackfill
      ? musicatInitialBackfillCutoff(participant.created_at, participant.history_cursor_at)
      : new Date(Math.max(createdAt, previousSync - OVERLAP_MS)).toISOString();

    const opened = await openMusicatHistory(browser, participant.public_profile_url);
    page = opened.page;
    const result = await collectMusicatHistorySince(page, cutoff, {
      maxScrollBatches: MAX_SCROLL_BATCHES
    });

    // During a multi-run initial backfill, older pages can contain rows from
    // before registration. Always apply the original registration timestamp.
    const eligibleEvents = isInitialBackfill
      ? result.events.filter(event => Date.parse(event.playedAt) >= createdAt)
      : result.events;
    importedCount = await importEvents(participant, eligibleEvents);

    const reachedRegistrationCutoff = hasReachedMusicatIntegrationCutoff(
      result.oldestLoaded,
      participant.created_at,
      result.endOfHistory
    );
    if (isInitialBackfill && !reachedRegistrationCutoff) {
      const nextCursor = result.oldestLoaded;
      const message = "Initial history backfill is continuing from the saved cursor.";
      await updateParticipant(participant.id, {
        history_cursor_at: nextCursor,
        last_error: message
      });
      await finishSyncRun(runId, "partial", importedCount, message);
      return {
        participantId: participant.id,
        status: "partial",
        importedCount,
        loadedRows: result.visibleUniqueRows,
        nextCursor
      };
    }

    // If an incremental scan hits its configured safety limit, keep the
    // previous successful timestamp so the next run safely retries the range.
    if (!isInitialBackfill && !result.reachedCutoff && !result.endOfHistory) {
      const message = "Incremental history limit reached; the previous sync cursor was preserved for retry.";
      await updateParticipant(participant.id, { last_error: message });
      await finishSyncRun(runId, "partial", importedCount, message);
      return { participantId: participant.id, status: "partial", importedCount, loadedRows: result.visibleUniqueRows };
    }

    const syncedAt = new Date().toISOString();
    await updateParticipant(participant.id, {
      last_synced_at: syncedAt,
      history_cursor_at: null,
      last_error: null
    });
    await finishSyncRun(runId, "success", importedCount, null);
    return {
      participantId: participant.id,
      status: "success",
      importedCount,
      loadedRows: result.visibleUniqueRows,
      scrollBatches: result.scrollBatches
    };
  } catch (error) {
    const message = String(error?.message || "Unknown sync error").slice(0, 500);
    try {
      await updateParticipant(participant.id, { last_error: message });
    } catch {
      // Preserve the original error; sync run logging below is best-effort.
    }
    try {
      await finishSyncRun(runId, "failed", importedCount, message);
    } catch {
      // Preserve the original error if run finalization also fails.
    }
    return { participantId: participant.id, status: "failed", importedCount, error: message };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

let browser;
try {
  const participants = await fetchApprovedParticipants();
  if (participants.length === 0) {
    console.log(JSON.stringify({
      status: "idle",
      message: "No approved Musicat participants are waiting for sync."
    }, null, 2));
    process.exit(0);
  }

  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const participant of participants) {
    results.push(await syncParticipant(browser, participant));
  }

  const summary = {
    status: results.some(result => result.status === "failed") ? "partial_failure"
      : results.some(result => result.status === "partial") ? "partial" : "success",
    participantsProcessed: results.length,
    importedEvents: results.reduce((sum, result) => sum + result.importedCount, 0),
    results
  };
  console.log(JSON.stringify(summary, null, 2));
  if (results.some(result => result.status !== "success")) process.exitCode = 1;
} catch (error) {
  console.error(String(error?.message || error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
