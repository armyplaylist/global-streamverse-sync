export function parseMusicatProfileUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The Musicat profile URL is invalid.");
  }
  if (url.protocol !== "https:" || url.hostname !== "musicat.fm") {
    throw new Error("Only https://musicat.fm profiles are allowed.");
  }
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

export function normalizeMusicatRows(rows) {
  const normalized = [];
  for (const row of rows) {
    const trackId = String(row?.trackId || "").trim();
    const title = String(row?.title || "").trim();
    const artist = String(row?.artist || "").trim();
    const playedAt = String(row?.playedAt || "").trim();
    const source = String(row?.source || "").trim();
    const timestamp = Date.parse(playedAt);
    if (!trackId || !title || !artist || !source || !Number.isFinite(timestamp)) continue;
    normalized.push({
      trackId,
      title,
      artist,
      playedAt: new Date(timestamp).toISOString(),
      source
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
  return `musicat:${row.trackId}:${timestamp.toISOString()}`;
}

export function filterMusicatRowsSince(rows, since) {
  const cutoff = new Date(since).getTime();
  if (!Number.isFinite(cutoff)) throw new Error("The sync cutoff timestamp is invalid.");
  return rows.filter(row => Date.parse(row.playedAt) >= cutoff);
}
