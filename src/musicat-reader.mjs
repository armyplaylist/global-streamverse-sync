export function parseMusicatProfileUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The Musicat profile URL is invalid.");
  }
  if (url.protocol !== "https:" || !["musicat.fm", "www.musicat.fm"].includes(url.hostname)) {
    throw new Error("Only https://musicat.fm public profiles are allowed.");
  }
  url.hostname = "musicat.fm";
  if (url.pathname === "/" || url.pathname.split("/").filter(Boolean).length !== 1) {
    throw new Error("Use a public Musicat profile URL, such as https://musicat.fm/username.");
  }
  return url;
}

export function extractMusicatUserId(hrefs) {
  for (const href of hrefs) {
    const match = String(href).match(/^\/users\/([0-9a-f-]{36})(?:\/|$)/i);
    if (match) return match[1];
  }
  return null;
}

export async function waitForMusicatUserId(page, timeoutMs = 15000) {
  const timeout = Number.isInteger(timeoutMs)
    ? Math.max(1000, Math.min(timeoutMs, 30000))
    : 15000;

  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll("a[href]")].some(link => {
        const href = link.getAttribute("href") || "";
        try {
          const url = new URL(href, location.origin);
          return url.origin === location.origin
            && /^\/users\/[0-9a-f-]{36}(?:\/|$)/i.test(url.pathname);
        } catch {
          return false;
        }
      }),
      null,
      { timeout }
    );
  } catch {
    // Keep going so callers can distinguish a delayed link from an empty profile.
  }

  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map(link => {
    try {
      const url = new URL(link.getAttribute("href") || "", location.origin);
      return url.origin === location.origin ? url.pathname : "";
    } catch {
      return "";
    }
  }));
  return extractMusicatUserId(hrefs);
}

export function normalizeMusicatRows(rows) {
  const normalized = [];
  for (const row of rows) {
    const trackId = String(row?.trackId || "").trim();
    const title = String(row?.title || "").trim();
    const artist = String(row?.artist || "").trim();
    const playedAt = String(row?.playedAt || "").trim();
    const source = String(row?.source || "").trim();
    const album = String(row?.album || "").trim();
    const timestamp = Date.parse(playedAt);
    if (!trackId || !title || !artist || !source || !Number.isFinite(timestamp)) continue;
    normalized.push({
      trackId,
      title,
      artist,
      playedAt: new Date(timestamp).toISOString(),
      source,
      album: album || null
    });
  }
  return normalized;
}

export function musicatDedupeKey(row) {
  if (!row?.trackId || !row?.playedAt) {
    throw new Error("A stable Musicat track ID and timestamp are required for deduplication.");
  }
  const timestamp = new Date(row.playedAt);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("The Musicat play timestamp is invalid.");
  }
  return "musicat:" + row.trackId + ":" + timestamp.toISOString();
}

export function filterMusicatRowsSince(rows, since) {
  const cutoff = new Date(since).getTime();
  if (!Number.isFinite(cutoff)) throw new Error("The sync cutoff timestamp is invalid.");
  return rows.filter(row => Date.parse(row.playedAt) >= cutoff);
}

export function musicatInitialBackfillCutoff(createdAt, cursor = null) {
  const signupTime = new Date(createdAt).getTime();
  if (!Number.isFinite(signupTime)) {
    throw new Error("The participant integration timestamp is invalid.");
  }
  if (cursor === null || cursor === undefined || cursor === "") {
    return new Date(signupTime).toISOString();
  }
  const cursorTime = new Date(cursor).getTime();
  if (!Number.isFinite(cursorTime)) {
    throw new Error("The initial Musicat history cursor is invalid.");
  }
  return new Date(Math.max(signupTime, cursorTime - 1)).toISOString();
}

export function hasReachedMusicatIntegrationCutoff(oldestLoaded, createdAt, endOfHistory = false) {
  if (endOfHistory) return true;
  const oldestTime = new Date(oldestLoaded).getTime();
  const signupTime = new Date(createdAt).getTime();
  if (!Number.isFinite(oldestTime) || !Number.isFinite(signupTime)) {
    throw new Error("Cannot verify the Musicat integration cutoff.");
  }
  return oldestTime <= signupTime;
}

export async function collectMusicatHistorySince(page, since, options = {}) {
  const cutoff = new Date(since).getTime();
  if (!Number.isFinite(cutoff)) throw new Error("The sync cutoff timestamp is invalid.");

  const maxScrollBatches = Number.isInteger(options.maxScrollBatches)
    ? Math.max(0, options.maxScrollBatches)
    : 100;
  const waitForRowsMs = Number.isInteger(options.waitForRowsMs)
    ? Math.max(1000, options.waitForRowsMs)
    : 12000;

  await page.waitForSelector("time[datetime]", { timeout: 20000 });
  await page.waitForTimeout(1200);

  const readRows = () => page.evaluate(() => {
    return [...document.querySelectorAll('time[datetime]')].map(time => {
      const row = time.closest('div[class*="PlayedMusic_row"]');
      if (!row) return null;

      const titleLink = row.querySelector('a[class*="PlayedMusic_title"]');
      const artistNode = row.querySelector('[class*="PlayedMusic_artists"]');
      const sourceNode = row.querySelector('[class*="PlayedMusic_played"]');
      // Musicat's public history may expose album metadata through a link,
      // a labelled element, or accessible/data attributes depending on the row variant.
      const albumLink = [...row.querySelectorAll("a[href]")].find(link => {
        try { return /\/albums?\//i.test(new URL(link.href, location.origin).pathname); }
        catch { return false; }
      });
      const albumNode = row.querySelector(
        '[class*="PlayedMusic_album"], [class*="album" i], [data-testid*="album" i], [data-album-name], [data-album-title]'
      );
      const albumLabelNode = row.querySelector('[aria-label*="album" i], [title*="album" i]');
      const albumImage = [...row.querySelectorAll("img[alt]")].find(img => {
        const alt = (img.getAttribute("alt") || "").trim();
        return alt && !/^(album|album art|album cover|cover|artwork)$/i.test(alt);
      });
      const album = [
        albumLink?.innerText?.trim(),
        albumLink?.getAttribute("aria-label")?.trim(),
        albumNode?.getAttribute("data-album-name")?.trim(),
        albumNode?.getAttribute("data-album-title")?.trim(),
        albumNode?.getAttribute("aria-label")?.trim(),
        albumNode?.getAttribute("title")?.trim(),
        albumNode?.innerText?.trim(),
        albumLabelNode?.getAttribute("aria-label")?.trim(),
        albumLabelNode?.getAttribute("title")?.trim(),
        albumImage?.getAttribute("alt")?.trim()
      ].find(value => value && !/^(album|album art|album cover|cover|artwork)$/i.test(value)) || "";
      const trackHref = titleLink?.getAttribute("href")
        || row.querySelector('a[href^="/tracks/"]')?.getAttribute("href")
        || "";
      const trackId = trackHref.match(/^\/tracks\/([^/?#]+)/)?.[1] || null;

      return {
        trackId,
        title: titleLink?.innerText?.trim() || "",
        artist: artistNode?.innerText?.trim() || "",
        playedAt: time.getAttribute("datetime") || "",
        source: sourceNode?.innerText?.trim() || "",
        album
      };
    }).filter(Boolean);
  });

  const unique = new Map();
  let scrollBatches = 0;
  let reachedCutoff = false;
  let oldestLoaded = null;
  let latestLoaded = null;
  let noGrowthAttempts = 0;
  let endOfHistory = false;

  while (true) {
    const rawRows = await readRows();
    const rows = normalizeMusicatRows(rawRows);
    if (rows.length === 0) {
      throw new Error("Musicat history rendered no complete rows with a track, artist and timestamp.");
    }
    if (rows.length !== rawRows.length) {
      throw new Error("At least one visible Musicat history row was incomplete; sync stopped to avoid silent omissions.");
    }

    const timestamps = rows.map(row => Date.parse(row.playedAt));
    for (let index = 1; index < timestamps.length; index += 1) {
      if (timestamps[index] > timestamps[index - 1]) {
        throw new Error("Musicat history is not ordered newest-first; sync stopped to avoid missing events.");
      }
    }

    oldestLoaded = new Date(Math.min(...timestamps)).toISOString();
    latestLoaded = new Date(Math.max(...timestamps)).toISOString();

    for (const row of rows) unique.set(musicatDedupeKey(row), row);

    if (Date.parse(oldestLoaded) <= cutoff) {
      reachedCutoff = true;
      break;
    }
    if (scrollBatches >= maxScrollBatches) break;

    const previousCount = await page.locator("time[datetime]").count();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    try {
      await page.waitForFunction(
        previous => document.querySelectorAll("time[datetime]").length > previous,
        previousCount,
        { timeout: waitForRowsMs }
      );
      scrollBatches += 1;
      noGrowthAttempts = 0;
    } catch {
      noGrowthAttempts += 1;
      if (noGrowthAttempts >= 2) {
        endOfHistory = true;
        break;
      }
    }
  }

  const events = filterMusicatRowsSince([...unique.values()], since);
  return {
    events,
    visibleUniqueRows: unique.size,
    scrollBatches,
    reachedCutoff,
    endOfHistory,
    oldestLoaded,
    latestLoaded
  };
}
