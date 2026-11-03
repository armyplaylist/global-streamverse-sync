import { chromium } from "playwright";

const profileUrl = process.env.MUSICAT_PROFILE_URL;
if (!profileUrl) {
  console.error("Missing MUSICAT_PROFILE_URL.");
  process.exit(2);
}

let parsed;
try { parsed = new URL(profileUrl); } catch {
  console.error("MUSICAT_PROFILE_URL is not a valid URL.");
  process.exit(2);
}
if (parsed.hostname !== "musicat.fm" || parsed.protocol !== "https:") {
  console.error("Only https://musicat.fm public profile URLs are allowed.");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const response = await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const profile = await page.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText || "",
    html: document.documentElement?.outerHTML || ""
  }));
  if (!response?.ok()) throw new Error(`Public profile returned HTTP ${response?.status() ?? "no response"}`);
  if (!profile.text.trim()) throw new Error("Public profile rendered no visible text.");
  if (/please log in|log in again|account has changed|state of your account has changed/i.test(profile.text)) {
    throw new Error("Musicat requires an account session; public history validation stopped.");
  }

  // Profile visibility alone is not enough: history must be visibly accessible.
  // Resolve the user's public history route only from a UUID present in rendered page markup.
  const uuid = await page.evaluate(() => {
    const href = [...document.querySelectorAll('a[href^="/users/"]')]
      .map(a => a.getAttribute("href") || "")
      .find(href => /^\\/users\\/[0-9a-f-]{36}(?:\\/|$)/i.test(href));
    return href?.match(/^\\/users\\/([0-9a-f-]{36})/i)?.[1] || null;
  });
  if (!uuid) throw new Error("Could not identify a public history route from rendered profile markup.");
  const historyUrl = new URL(`/users/${uuid}/history`, "https://musicat.fm");
  await page.goto(historyUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  const history = await page.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText || "",
    rows: [...document.querySelectorAll("time")].map(el => ({
      text: el.parentElement?.parentElement?.innerText || el.parentElement?.innerText || "",
      datetime: el.getAttribute("datetime")
    })).filter(x => x.text && x.datetime)
  }));
  if (/please log in|log in again|account has changed|state of your account has changed/i.test(history.text)) {
    throw new Error("Musicat history is gated by a login/session message.");
  }
  if (!history.rows.length) {
    throw new Error("No timestamped visible history rows were detected; no data was collected.");
  }
  console.log(JSON.stringify({
    status: "validated",
    profile: parsed.pathname,
    historyTitle: history.title,
    visibleTimestampedRows: history.rows.length,
    note: "Validation only. No listening data was stored or counted."
  }, null, 2));
} finally {
  await browser.close();
}
