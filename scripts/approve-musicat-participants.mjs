import { chromium } from "playwright";
import { supabaseApiHeaders } from "./supabase-api.mjs";
import { parseMusicatProfileUrl, waitForMusicatUserId } from "../src/musicat-reader.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://ylybwiwemlnekclrwwjq.supabase.co").replace(/\/$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const MAX_PENDING = Number.parseInt(process.env.MAX_PENDING_PER_RUN || "25", 10);

if (!SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_SECRET_KEY.");
  process.exit(2);
}
if (!Number.isInteger(MAX_PENDING) || MAX_PENDING < 1 || MAX_PENDING > 100) {
  console.error("MAX_PENDING_PER_RUN must be between 1 and 100.");
  process.exit(2);
}

async function db(path, options = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: supabaseApiHeaders(SUPABASE_SECRET_KEY, options.prefer ? { Prefer: options.prefer } : {}),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Supabase REST " + response.status + ": " + body.slice(0, 300));
  return body ? JSON.parse(body) : null;
}

async function readVisibleHistory(page) {
  await page.waitForSelector("time[datetime]", { timeout: 15000 });
  return await page.evaluate(() => [...document.querySelectorAll("time[datetime]")].map(time => {
    const row = time.closest('div[class*="PlayedMusic_row"]');
    if (!row) return null;
    const title = row.querySelector('a[class*="PlayedMusic_title"]');
    const artist = row.querySelector('[class*="PlayedMusic_artists"]');
    const source = row.querySelector('[class*="PlayedMusic_played"]');
    const href = title?.getAttribute("href") || row.querySelector('a[href^="/tracks/"]')?.getAttribute("href") || "";
    return {
      trackId: href.match(/^\/tracks\/([^/?#]+)/)?.[1] || "",
      title: title?.innerText?.trim() || "",
      artist: artist?.innerText?.trim() || "",
      source: source?.innerText?.trim() || "",
      playedAt: time.getAttribute("datetime") || ""
    };
  }).filter(Boolean));
}

async function validatePublicProfile(browser, rawUrl) {
  const profile = parseMusicatProfileUrl(rawUrl);
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  try {
    const profileResponse = await page.goto(profile.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!profileResponse) throw new Error("Musicat no respondió al abrir el perfil.");
    if (profileResponse.status() === 404) return { valid: false, permanent: true, reason: "El perfil de Musicat no existe (404)." };
    if (profileResponse.status() >= 500 || profileResponse.status() === 429) {
      return { valid: false, permanent: false, reason: "Musicat está temporalmente indisponible; se volverá a intentar." };
    }
    if (!profileResponse.ok()) return { valid: false, permanent: true, reason: "Musicat no permite abrir este perfil públicamente (HTTP " + profileResponse.status() + ")." };

    await page.waitForTimeout(500);
    const profileText = await page.evaluate(() => document.body?.innerText || "");
    if (!profileText.trim()) {
      return { valid: false, permanent: false, reason: "El perfil no terminó de cargar; se volverá a intentar." };
    }
    const userId = await waitForMusicatUserId(page, 15000);
    if (!userId) {
      return { valid: false, permanent: false, reason: "Musicat aún no ha terminado de cargar el enlace del historial; se volverá a intentar." };
    }

    const historyUrl = new URL("/users/" + userId + "/history", "https://musicat.fm");
    const historyResponse = await page.goto(historyUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!historyResponse) throw new Error("Musicat no respondió al abrir el historial.");
    if (historyResponse.status() === 404 || historyResponse.status() === 401 || historyResponse.status() === 403) {
      return { valid: false, permanent: true, reason: "El historial de esta cuenta no está disponible públicamente." };
    }
    if (historyResponse.status() >= 500 || historyResponse.status() === 429) {
      return { valid: false, permanent: false, reason: "El historial de Musicat está temporalmente indisponible; se volverá a intentar." };
    }
    if (!historyResponse.ok()) return { valid: false, permanent: false, reason: "Musicat devolvió HTTP " + historyResponse.status() + "; se volverá a intentar." };

    let rows;
    try {
      rows = await readVisibleHistory(page);
    } catch {
      const text = await page.locator("body").innerText().catch(() => "");
      if (/please log in|log in again|sign in/i.test(text)) {
        return { valid: false, permanent: true, reason: "El historial de Musicat no es público. Activa su visibilidad y vuelve a registrarte." };
      }
      return { valid: false, permanent: false, reason: "No se pudo cargar el historial todavía; se volverá a intentar." };
    }
    const validRows = rows.filter(row =>
      row.trackId && row.title && row.artist && row.source && Number.isFinite(Date.parse(row.playedAt))
    );
    if (validRows.length === 0 || validRows.length !== rows.length) {
      return { valid: false, permanent: true, reason: "El historial no contiene reproducciones públicas completas para verificar la cuenta." };
    }
    return { valid: true, userId, visibleRows: validRows.length };
  } catch (error) {
    return { valid: false, permanent: false, reason: String(error?.message || "Error temporal de validación.").slice(0, 300) };
  } finally {
    await page.close().catch(() => {});
  }
}

const pending = await db(
  "participants?select=id,public_profile_url&provider=eq.musicat&status=eq.pending&consent=eq.true&order=created_at.asc&limit=" + MAX_PENDING
) || [];
if (pending.length === 0) {
  console.log(JSON.stringify({ status: "idle", message: "No hay solicitudes pendientes de validar." }));
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const participant of pending) {
    const result = await validatePublicProfile(browser, participant.public_profile_url);
    if (result.valid) {
      await db("participants?id=eq." + encodeURIComponent(participant.id) + "&status=eq.pending", {
        method: "PATCH",
        prefer: "return=minimal",
        body: { status: "approved", last_error: null }
      });
      results.push({ id: participant.id, status: "approved", visibleRows: result.visibleRows });
    } else if (result.permanent) {
      await db("participants?id=eq." + encodeURIComponent(participant.id) + "&status=eq.pending", {
        method: "PATCH",
        prefer: "return=minimal",
        body: { status: "rejected", last_error: result.reason }
      });
      results.push({ id: participant.id, status: "rejected", reason: result.reason });
    } else {
      await db("participants?id=eq." + encodeURIComponent(participant.id) + "&status=eq.pending", {
        method: "PATCH",
        prefer: "return=minimal",
        body: { last_error: result.reason }
      });
      results.push({ id: participant.id, status: "retry", reason: result.reason });
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({
  status: "completed",
  checked: results.length,
  approved: results.filter(r => r.status === "approved").length,
  rejected: results.filter(r => r.status === "rejected").length,
  retry: results.filter(r => r.status === "retry").length,
  results
}, null, 2));
