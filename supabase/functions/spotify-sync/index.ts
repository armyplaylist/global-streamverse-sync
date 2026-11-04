import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") || "e50bcadfe7fa4e71b1fa83eafffa3cb8";
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") || "";

const apiHeaders = (extra: Record<string, string> = {}) => ({
  apikey: SUPABASE_KEY,
  ...(SUPABASE_KEY.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SUPABASE_KEY }),
  ...extra,
});
async function rest(path: string, init: RequestInit = {}) {
  return await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: { ...apiHeaders(), ...((init.headers || {}) as Record<string, string>) },
  });
}
function unb64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function encryptionKey() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    SPOTIFY_CLIENT_SECRET + ":global-streamverse-spotify-token-v1"
  ));
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("Encrypted token missing");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(parts[0]) }, await encryptionKey(), unb64(parts[1])
  );
  return new TextDecoder().decode(plain);
}
function b64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    SPOTIFY_CLIENT_SECRET + ":global-streamverse-spotify-token-v1"
  ));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return b64(iv) + "." + b64(new Uint8Array(encrypted));
}
async function refreshToken(refresh: string) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error === "invalid_grant" ? "spotify_reauthorization_required" : "spotify_token_refresh_failed_" + response.status);
  }
  return {
    access: data.access_token as string,
    refresh: (data.refresh_token || refresh) as string,
    expires: Number(data.expires_in || 3600),
  };
}
function mapItems(items: any[], connection: any) {
  const rows = [];
  for (const item of items || []) {
    const track = item?.track;
    const playedAt = item?.played_at;
    if (!track || track.type !== "track" || !track.id || !playedAt || !Number.isFinite(Date.parse(playedAt))) continue;
    const artists = Array.isArray(track.artists) ? track.artists.map((a: any) => a?.name).filter(Boolean) : [];
    rows.push({
      participant_id: connection.participant_id,
      auth_user_id: connection.auth_user_id,
      spotify_track_id: track.id,
      spotify_uri: track.uri || null,
      track: String(track.name || "Unknown track").slice(0, 300),
      artist: String(artists.join(", ") || "Unknown artist").slice(0, 500),
      album: String(track.album?.name || "").slice(0, 300) || null,
      album_cover_url: track.album?.images?.[0]?.url || null,
      played_at: new Date(playedAt).toISOString(),
    });
  }
  return rows;
}
async function saveEvents(rows: any[]) {
  let added = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const response = await rest("spotify_listening_events?on_conflict=participant_id,spotify_track_id,played_at", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error("spotify_history_save_failed_" + response.status);
    added += batch.length;
  }
  return added;
}
async function syncOne(connection: any) {
  let access = await decrypt(connection.access_token_encrypted);
  let refresh = await decrypt(connection.refresh_token_encrypted);
  let expiresAt = Date.parse(connection.token_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + 90000) {
    const fresh = await refreshToken(refresh);
    access = fresh.access;
    refresh = fresh.refresh;
    expiresAt = Date.now() + fresh.expires * 1000;
  }

  const cursor = connection.cursor_played_at ? Date.parse(connection.cursor_played_at) : 0;
  let endpoint = "https://api.spotify.com/v1/me/player/recently-played?limit=50" +
    (cursor ? "&after=" + cursor : "");
  let allItems: any[] = [];
  let pageCount = 0;
  let responseStatus = 200;
  while (endpoint && pageCount < 10) {
    const url = new URL(endpoint);
    if (url.hostname !== "api.spotify.com" || !url.pathname.startsWith("/v1/me/player/recently-played")) break;
    let response = await fetch(url, { headers: { Authorization: "Bearer " + access } });
    if (response.status === 401) {
      const fresh = await refreshToken(refresh);
      access = fresh.access;
      refresh = fresh.refresh;
      expiresAt = Date.now() + fresh.expires * 1000;
      response = await fetch(url, { headers: { Authorization: "Bearer " + access } });
    }
    responseStatus = response.status;
    if (response.status === 429) {
      const wait = response.headers.get("Retry-After") || "unknown";
      throw new Error("spotify_rate_limited_retry_after_" + wait);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("spotify_recently_played_http_" + response.status);
    if (Array.isArray(data.items)) allItems.push(...data.items);
    endpoint = typeof data.next === "string" ? data.next : "";
    pageCount++;
  }

  const rows = mapItems(allItems, connection);
  const latest = rows.reduce((max: number, row: any) => Math.max(max, Date.parse(row.played_at)), cursor);
  const added = rows.length ? await saveEvents(rows) : 0;
  const patch = {
    access_token_encrypted: await encrypt(access),
    refresh_token_encrypted: await encrypt(refresh),
    token_expires_at: new Date(expiresAt).toISOString(),
    cursor_played_at: latest ? new Date(latest).toISOString() : connection.cursor_played_at,
    last_synced_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const update = await rest("spotify_connections?id=eq." + encodeURIComponent(connection.id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!update.ok) throw new Error("spotify_connection_update_failed_" + update.status);
  return { added, seen: rows.length, pages: pageCount, status: responseStatus };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SUPABASE_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return Response.json({ error: "Spotify sync is not configured" }, { status: 503 });
  }
  const supplied = req.headers.get("apikey") || req.headers.get("x-sync-key") || "";
  if (supplied !== SUPABASE_KEY) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const list = await rest(
    "spotify_connections?select=id,participant_id,auth_user_id,access_token_encrypted,refresh_token_encrypted,token_expires_at,cursor_played_at&revoked_at=is.null&order=last_synced_at.asc.nullsfirst&limit=200"
  );
  if (!list.ok) return Response.json({ error: "Could not load Spotify connections" }, { status: 503 });
  const connections = await list.json();
  let totalAdded = 0, successful = 0, failed = 0;
  const errors: string[] = [];
  for (const connection of connections) {
    try {
      const result = await syncOne(connection);
      totalAdded += result.added;
      successful++;
    } catch (error) {
      failed++;
      const message = String(error instanceof Error ? error.message : error).slice(0, 240);
      errors.push(message);
      await rest("spotify_connections?id=eq." + encodeURIComponent(connection.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ last_error: message, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
      if (message.startsWith("spotify_rate_limited")) break;
    }
  }
  const rollupResponse = await rest("rpc/refresh_spotify_monthly_rollups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const rollupError = rollupResponse.ok ? null : "spotify_monthly_rollup_http_" + rollupResponse.status;
  return Response.json({
    success: failed === 0 && !rollupError, checked: connections.length, successful, failed,
    imported_events: totalAdded, monthly_rollup_updated: !rollupError,
    monthly_rollup_error: rollupError, errors: errors.slice(0, 10), generated_at: new Date().toISOString(),
  });
});
