import { chromium } from "playwright";

const profileUrl = process.env.MUSICAT_PROFILE_URL;
if (!profileUrl) {
  console.error("Missing MUSICAT_PROFILE_URL.");
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(profileUrl);
} catch {
  console.error("MUSICAT_PROFILE_URL is not a valid URL.");
  process.exit(2);
}
if (!["musicat.fm", "www.musicat.fm"].includes(parsed.hostname) || parsed.protocol !== "https:") {
  console.error("Only https://musicat.fm public profile URLs are allowed.");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const profileResponse = await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForTimeout(2500);

  if (!profileResponse?.ok()) {
    throw new Error(`Public profile returned HTTP ${profileResponse?.status() ?? "no response"}`);
  }

  const profile = await page.evaluate(() => ({
    title: document.title,
    visibleText: document.body?.innerText || "",
    userLinks: [...document.querySelectorAll('a[href^="/users/"]')]
      .map(link => link.getAttribute("href") || "")
  }));
  if (!profile.visibleText.trim()) {
    throw new Error("Public profile rendered no visible text.");
  }

  const uuid = profile.userLinks
    .map(href => href.match(/^\/users\/([0-9a-f-]{36})(?:\/|$)/i)?.[1])
    .find(Boolean);
  if (!uuid) {
    throw new Error("Could not identify the public user history route from profile links.");
  }

  const historyUrl = new URL(`/users/${uuid}/history`, "https://musicat.fm");
  const historyResponse = await page.goto(historyUrl.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  if (!historyResponse?.ok()) {
    throw new Error(`History returned HTTP ${historyResponse?.status() ?? "no response"}`);
  }

  await page.waitForSelector("time[datetime]", { timeout: 20000 });

  const readVisibleRows = () => page.evaluate(() => {
    return [...document.querySelectorAll("time[datetime]")].map(time => {
      const row = time.closest('div[class*="PlayedMusic_row"]');
      if (!row) return null;

      const titleLink = row.querySelector('a[class*="PlayedMusic_title"]');
      const artistNode = row.querySelector('[class*="PlayedMusic_artists"]');
      const sourceNode = row.querySelector('[class*="PlayedMusic_played"]');
      const trackHref = titleLink?.getAttribute("href")
        || row.querySelector('a[href^="/tracks/"]')?.getAttribute("href")
        || "";
      const trackId = trackHref.match(/^\/tracks\/([^/?#]+)/)?.[1] || null;

      return {
        trackId,
        title: titleLink?.innerText?.trim() || "",
        artist: artistNode?.innerText?.trim() || "",
        playedAt: time.getAttribute("datetime") || "",
        source: sourceNode?.innerText?.trim() || ""
      };
    }).filter(Boolean);
  });

  let rows = await readVisibleRows();
  let scrollBatches = 0;
  // Musicat progressively reveals 50 more visible history rows near the bottom.
  // This validation loads a few pages only; it never stores or counts streams.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previousCount = rows.length;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    try {
      await page.waitForFunction(
        previous => document.querySelectorAll("time[datetime]").length > previous,
        previousCount,
        { timeout: 12000 }
      );
      scrollBatches += 1;
      rows = await readVisibleRows();
    } catch {
      break;
    }
  }

  const validRows = rows.filter(row =>
    row.trackId &&
    row.title &&
    row.artist &&
    row.source &&
    Number.isFinite(Date.parse(row.playedAt))
  );
  const uniqueKeys = new Set(validRows.map(row => `${row.trackId}|${row.playedAt}`));
  const dates = validRows.map(row => Date.parse(row.playedAt)).sort((a, b) => a - b);
  const sessionNoticeVisible = /state of your account has changed|please log in again/i
    .test(await page.locator("body").innerText());

  if (validRows.length === 0) {
    throw new Error("History opened, but no complete visible rows with title, artist and timestamp were detected.");
  }
  if (validRows.length !== rows.length) {
    throw new Error(`Some visible history rows were incomplete: ${validRows.length}/${rows.length} valid.`);
  }

  console.log(JSON.stringify({
    status: "validated",
    profile: parsed.pathname,
    historyTitle: await page.title(),
    visibleTimestampedRows: rows.length,
    validRows: validRows.length,
    uniqueEvents: uniqueKeys.size,
    scrollBatches,
    earliestVisiblePlay: new Date(dates[0]).toISOString(),
    latestVisiblePlay: new Date(dates.at(-1)).toISOString(),
    sessionNoticeVisible,
    note: "Validation only. No listening data was stored or counted."
  }, null, 2));
} finally {
  await browser.close();
}
