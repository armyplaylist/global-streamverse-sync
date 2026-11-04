import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") || "e50bcadfe7fa4e71b1fa83eafffa3cb8";
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") || "";
const SITE_ORIGIN = "https://global-streamverse.vercel.app";
const REDIRECT_URI = "https://ylybwiwemlnekclrwwjq.supabase.co/functions/v1/spotify-oauth";
const headers = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
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
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function b64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}
async function encryptionKey() {
  if (!SPOTIFY_CLIENT_SECRET) throw new Error("Spotify credentials are not configured");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    SPOTIFY_CLIENT_SECRET + ":global-streamverse-spotify-token-v1"
  ));
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)
  );
  return b64(iv) + "." + b64(new Uint8Array(encrypted));
}
async function userFromRequest(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  return await response.json();
}
async function participantForUser(userId: string) {
  const response = await rest("participants?select=id,auth_user_id&auth_user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  if (!response.ok) throw new Error("Could not load participant");
  return (await response.json())[0] || null;
}
function trackEvents(items: any[], participantId: string, userId: string) {
  const rows = [];
  for (const item of items || []) {
    const track = item?.track;
    const playedAt = item?.played_at;
    if (!track || track.type !== "track" || !track.id || !playedAt || !Number.isFinite(Date.parse(playedAt))) continue;
    const artists = Array.isArray(track.artists) ? track.artists.map((a: any) => a?.name).filter(Boolean) : [];
    rows.push({
      participant_id: participantId, auth_user_id: userId,
      spotify_track_id: track.id, spotify_uri: track.uri || null,
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
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const response = await rest("spotify_listening_events?on_conflict=participant_id,spotify_track_id,played_at", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error("Could not save Spotify history (" + response.status + ")");
    inserted += batch.length;
  }
  return inserted;
}
async function callback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const fail = (reason: string) => Response.redirect(SITE_ORIGIN + "/profile.html?spotify=error&reason=" + encodeURIComponent(reason), 302);
  if (url.searchParams.has("error")) return fail("authorization_denied");
  if (!code || !state || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SUPABASE_KEY) return fail("callback_not_configured");
  const stateHash = await sha256(state);
  const stateResponse = await rest("spotify_oauth_states?select=state_hash,auth_user_id,participant_id,expires_at&state_hash=eq." + stateHash + "&limit=1");
  if (!stateResponse.ok) return fail("state_lookup_failed");
  const stateRow = (await stateResponse.json())[0];
  if (!stateRow || Date.parse(stateRow.expires_at) < Date.now()) return fail("state_expired");
  await rest("spotify_oauth_states?state_hash=eq." + stateHash, { method: "DELETE" });

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) return fail("token_exchange_failed");

  const initial = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=50", {
    headers: { Authorization: "Bearer " + tokens.access_token },
  });
  const initialBody = await initial.json().catch(() => ({}));
  const items = initial.ok && Array.isArray(initialBody.items) ? initialBody.items : [];
  const rows = trackEvents(items, stateRow.participant_id, stateRow.auth_user_id);
  const latest = rows.reduce((max: number, row: any) => Math.max(max, Date.parse(row.played_at)), 0);

  const connection = await rest("spotify_connections?on_conflict=participant_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      participant_id: stateRow.participant_id, auth_user_id: stateRow.auth_user_id,
      access_token_encrypted: await encrypt(tokens.access_token),
      refresh_token_encrypted: await encrypt(tokens.refresh_token),
      token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      cursor_played_at: latest ? new Date(latest).toISOString() : null,
      connected_at: new Date().toISOString(), last_synced_at: new Date().toISOString(),
      last_error: initial.ok ? null : "initial_history_http_" + initial.status,
      revoked_at: null, updated_at: new Date().toISOString(),
    }),
  });
  if (!connection.ok) return fail("connection_save_failed");
  let added = 0;
  try { added = await saveEvents(rows); } catch { /* next background sync retries */ }
  try {
    await rest("rpc/refresh_spotify_monthly_rollups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch { /* scheduled sync refreshes monthly snapshots later */ }
  return Response.redirect(SITE_ORIGIN + "/profile.html?spotify=connected&imported=" + added, 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== SITE_ORIGIN) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers });
  }
  if (req.method === "GET") return await callback(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") && req.headers.get("origin") !== SITE_ORIGIN) return json({ error: "Origin not allowed" }, 403);
  if (!SUPABASE_URL || !SUPABASE_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return json({ error: "La conexión de Spotify aún no está configurada en el servidor." }, 503);
  }
  const user = await userFromRequest(req);
  if (!user?.id) return json({ error: "Inicia sesión para vincular Spotify." }, 401);
  const participant = await participantForUser(user.id);
  if (!participant?.id) return json({ error: "Primero necesitas crear tu perfil de GLOBAL STREAMVERSE." }, 404);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body.action === "status") {
    const connectionResponse = await rest("spotify_connections?select=connected_at,last_synced_at,last_error,revoked_at&auth_user_id=eq." + encodeURIComponent(user.id) + "&limit=1");
    if (!connectionResponse.ok) return json({ error: "No pudimos consultar la conexión de Spotify." }, 503);
    const connection = (await connectionResponse.json())[0] || null;
    const profileResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/get_my_spotify_profile", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: req.headers.get("Authorization") || "", "Content-Type": "application/json" },
      body: "{}",
    });
    const profile = profileResponse.ok ? await profileResponse.json() : null;
    return json({
      connected: Boolean(connection && !connection.revoked_at),
      connected_at: connection?.connected_at || null,
      last_synced_at: connection?.last_synced_at || null,
      last_error: connection?.last_error || null,
      profile,
    });
  }
  if (body.action === "disconnect") {
    const response = await rest("spotify_connections?auth_user_id=eq." + encodeURIComponent(user.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        revoked_at: new Date().toISOString(), access_token_encrypted: "", refresh_token_encrypted: "",
        last_error: "disconnected_by_user", updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) return json({ error: "No pudimos desvincular Spotify." }, 503);
    return json({ success: true });
  }
  if (body.action !== "start") return json({ error: "Acción no válida." }, 400);

  const state = b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const stateHash = await sha256(state);
  const stateSave = await rest("spotify_oauth_states", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      state_hash: stateHash, auth_user_id: user.id, participant_id: participant.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }),
  });
  if (!stateSave.ok) return json({ error: "No pudimos iniciar la vinculación. Inténtalo de nuevo." }, 503);
  const authorize = new URL("https://accounts.spotify.com/authorize");
  authorize.search = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI,
    state, scope: "user-read-recently-played", show_dialog: "true",
  }).toString();
  return json({ authorization_url: authorize.toString() });
});
