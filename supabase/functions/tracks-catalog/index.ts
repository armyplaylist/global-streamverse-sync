import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

let cachedToken = "";
let tokenExpiresAt = 0;

function normalize(value: string) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function spotifyToken(clientId: string, clientSecret: string) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const credentials = btoa(clientId + ":" + clientSecret);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + credentials,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Spotify authentication failed (" + response.status + ")");
  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

function adminHeaders(key: string) {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  return headers;
}

function candidatePayload(track: any) {
  const album = track.album || {};
  return {
    spotify_track_id: track.id || null,
    spotify_track_url: track.external_urls?.spotify || null,
    track_name: track.name || "",
    artist_name: (track.artists || []).map((a: any) => a.name).join(", "),
    album_name: album.name || null,
    album_type: album.album_type || null,
    album_release_date: album.release_date || null,
    album_image_url: album.images?.[0]?.url || null,
    album_total_tracks: Number.isInteger(album.total_tracks) ? album.total_tracks : null,
    album_uri: album.external_urls?.spotify || (album.uri ? "https://open.spotify.com/album/" + album.id : null),
    track_number: Number.isInteger(track.track_number) ? track.track_number : null,
    disc_number: Number.isInteger(track.disc_number) ? track.disc_number : null,
    duration_ms: Number.isInteger(track.duration_ms) ? track.duration_ms : null,
    isrc: track.external_ids?.isrc || null,
    explicit: typeof track.explicit === "boolean" ? track.explicit : null,
  };
}

async function saveMatch(baseUrl: string, serviceKey: string, row: any, status: string, candidate?: any, candidates: any[] = []) {
  const payload = {
    musicat_track_id: row.musicat_track_id,
    track_name: row.track_name,
    artist_name: row.artist_name,
    match_status: status,
    spotify_candidates: candidates,
    ...(candidate || {}),
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(baseUrl + "/rest/v1/track_catalog?on_conflict=musicat_track_id", {
    method: "POST",
    headers: {
      ...adminHeaders(serviceKey),
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Could not save Spotify metadata (" + response.status + ")");
}


async function fetchAllEvents(baseUrl: string, serviceKey: string, filter: string) {
  const events: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const url = baseUrl + "/rest/v1/stream_events?select=dedupe_key,track,artist,played_at&provider=eq.musicat&" + filter + "&order=played_at.asc&limit=1000&offset=" + offset;
    const response = await fetch(url, { headers: adminHeaders(serviceKey) });
    if (!response.ok) throw new Error("Could not load listening history (" + response.status + ")");
    const batch = await response.json();
    events.push(...batch);
    if (batch.length < 1000) break;
  }
  return events;
}

function historySummary(events: any[]) {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const counts = new Map<string, number>();
  for (const event of events) {
    const date = new Date(event.played_at);
    if (!Number.isFinite(date.getTime())) continue;
    const day = date.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  const daily = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(utcToday - i * 86400000).toISOString().slice(0, 10);
    daily.push({ date, streams: counts.get(date) || 0 });
  }
  const todayKey = new Date(utcToday).toISOString().slice(0, 10);
  const last7 = daily.slice(-7).reduce((sum, item) => sum + item.streams, 0);
  const last30 = daily.slice(-30).reduce((sum, item) => sum + item.streams, 0);
  const last365 = daily.reduce((sum, item) => sum + item.streams, 0);
  return {
    total_streams: events.length,
    today_streams: counts.get(todayKey) || 0,
    streams_7d: last7,
    streams_30d: last30,
    streams_365d: last365,
    daily,
    methodology: "Historial global Musicat guardado en Streamverse. Los totales incluyen todos los eventos recuperados; la gráfica muestra los últimos 365 días UTC."
  };
}

async function loadHistoryDetail(baseUrl: string, serviceKey: string, params: URLSearchParams) {
  const kind = params.get("detail");
  if (kind === "track") {
    const id = params.get("musicat_track_id") || "";
    if (!id || id.length > 200 || !/^[a-zA-Z0-9._-]+$/.test(id)) {
      return json({ error: "Invalid Musicat track id" }, 400);
    }
    const events = await fetchAllEvents(baseUrl, serviceKey, "dedupe_key=like." + encodeURIComponent("musicat:" + id + ":*"));
    return json({ type: "track", musicat_track_id: id, ...historySummary(events) });
  }
  if (kind === "album") {
    const uri = params.get("album_uri") || "";
    if (!uri.startsWith("https://open.spotify.com/album/") || uri.length > 300) {
      return json({ error: "Invalid album reference" }, 400);
    }
    const catalogUrl = baseUrl + "/rest/v1/track_catalog?select=musicat_track_id,track_name,artist_name&album_uri=eq." + encodeURIComponent(uri);
    const catalogResponse = await fetch(catalogUrl, { headers: adminHeaders(serviceKey) });
    if (!catalogResponse.ok) return json({ error: "Could not load album tracks" }, 502);
    const tracks = await catalogResponse.json();
    const ids = [...new Set(tracks.map((row: any) => row.musicat_track_id).filter(Boolean))];
    const events: any[] = [];
    for (let i = 0; i < ids.length; i += 25) {
      const filters = ids.slice(i, i + 25).map((id: string) => "dedupe_key.like.musicat:" + id + ":*").join(",");
      if (filters) events.push(...await fetchAllEvents(baseUrl, serviceKey, "or=(" + encodeURIComponent(filters) + ")"));
    }
    const summary = historySummary(events);
    const perTrack = new Map<string, number>();
    for (const event of events) {
      const match = String(event.dedupe_key || "").match(/^musicat:([^:]+):/);
      if (match) perTrack.set(match[1], (perTrack.get(match[1]) || 0) + 1);
    }
    return json({
      type: "album", album_uri: uri, ...summary,
      tracks: tracks.map((track: any) => ({
        musicat_track_id: track.musicat_track_id,
        track_name: track.track_name,
        artist_name: track.artist_name,
        total_streams: perTrack.get(track.musicat_track_id) || 0
      })).sort((a: any, b: any) => b.total_streams - a.total_streams)
    });
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID") || "e50bcadfe7fa4e71b1fa83eafffa3cb8";
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!baseUrl || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);

  const requestUrl = new URL(req.url);
  if (requestUrl.searchParams.has("detail")) {
    try {
      const detail = await loadHistoryDetail(baseUrl, serviceKey, requestUrl.searchParams);
      return detail || json({ error: "Unknown detail type" }, 400);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Could not load history" }, 502);
    }
  }

  const requestedLimit = Number(new URL(req.url).searchParams.get("limit") || 150);
  const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 150));
  const totalsResponse = await fetch(
    baseUrl + "/rest/v1/track_stream_totals?select=*&order=total_streams.desc&limit=" + limit,
    { headers: adminHeaders(serviceKey) },
  );
  if (!totalsResponse.ok) return json({ error: "Could not load global song totals" }, 502);
  let rows = await totalsResponse.json();

  let spotifyConfigured = Boolean(clientId && clientSecret);
  let enriched = 0;
  let spotifyError: string | null = null;

  if (spotifyConfigured) {
    try {
      const token = await spotifyToken(clientId!, clientSecret!);
      for (const row of rows) {
        if (row.match_status !== "pending" || enriched >= 12) continue;
        enriched++;
        const query = "track:" + row.track_name + " artist:" + row.artist_name;
        const url = "https://api.spotify.com/v1/search?type=track&limit=8&market=MX&q=" + encodeURIComponent(query);
        const response = await fetch(url, { headers: { "Authorization": "Bearer " + token } });
        if (!response.ok) {
          if (response.status === 429) {
            spotifyError = "Spotify rate limit reached; try again later.";
            break;
          }
          await saveMatch(baseUrl, serviceKey, row, "error");
          spotifyError = "Spotify search returned " + response.status;
          continue;
        }
        const data = await response.json();
        const items = data.tracks?.items || [];
        const targetTrack = normalize(row.track_name);
        const targetArtist = normalize(row.artist_name);
        const targetArtistParts = targetArtist.split(/[,/&]+/).map(normalize).filter(Boolean);
        const exact = items.filter((item: any) => {
          if (normalize(item.name) !== targetTrack) return false;
          const candidateArtists = (item.artists || []).map((artist: any) => normalize(artist.name)).filter(Boolean);
          return candidateArtists.some((candidateArtist: string) =>
            candidateArtist === targetArtist ||
            targetArtistParts.some((part: string) => part === candidateArtist || part.includes(candidateArtist) || candidateArtist.includes(part))
          );
        }).sort((a: any, b: any) => String(b.album?.release_date || "").localeCompare(String(a.album?.release_date || "")));
        if (exact.length === 1) {
          const details = candidatePayload(exact[0]);
          await saveMatch(baseUrl, serviceKey, row, "matched", details);
        } else if (exact.length > 1) {
          await saveMatch(baseUrl, serviceKey, row, "ambiguous", undefined, exact.slice(0, 8).map(candidatePayload));
        } else {
          await saveMatch(baseUrl, serviceKey, row, "not_found");
        }
      }
      if (enriched) {
        const refreshed = await fetch(
          baseUrl + "/rest/v1/track_stream_totals?select=*&order=total_streams.desc&limit=" + limit,
          { headers: adminHeaders(serviceKey) },
        );
        if (refreshed.ok) rows = await refreshed.json();
      }
    } catch (error) {
      spotifyError = error instanceof Error ? error.message : "Spotify connection failed";
    }
  }

  return json({
    rows,
    spotify_configured: spotifyConfigured,
    spotify_client_id_configured: Boolean(clientId),
    spotify_client_secret_configured: Boolean(clientSecret),
    enriched_this_request: enriched,
    spotify_error: spotifyError,
    attribution: "Music metadata and artwork provided by Spotify.",
    generated_at: new Date().toISOString(),
  });
});