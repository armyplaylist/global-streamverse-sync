import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from threading import Lock

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://ylybwiwemlnekclrwwjq.supabase.co").rstrip("/")
# Publishable key only: this is intentionally not a service-role credential.
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_CLbbu_GKYbH5sRB9R-EsSg_r3-jL9BN")

app = FastAPI(title="GLOBAL STREAMVERSE Analytics", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://global-streamverse.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

_cache = {"created": 0.0, "data": None}
_cache_lock = Lock()
CACHE_SECONDS = 60


def rpc(name, payload=None):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json=payload or {},
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError(f"Supabase RPC {name} returned HTTP {response.status_code}")
    return response.json()


def load_public_profile(handle):
    profile = rpc("get_public_profile", {"p_handle": handle})
    return profile if isinstance(profile, dict) else None


def build_analytics(profiles):
    today = datetime.now(timezone.utc).date().isoformat()
    public_streams = 0
    streams_today = 0
    track_sample = Counter()
    country_stats = {}
    members = []
    latest_play = None
    sampled_events = 0

    for profile in profiles:
        if not profile:
            continue
        total = int(profile.get("total_streams") or 0)
        today_count = int(profile.get("today_streams") or 0)
        public_streams += total
        streams_today += today_count

        country = (profile.get("country_code") or "XX").upper()
        bucket = country_stats.setdefault(country, {"country_code": country, "members": 0, "streams": 0})
        bucket["members"] += 1
        bucket["streams"] += total

        members.append({
            "handle": profile.get("handle") or "",
            "display_name": profile.get("display_name") or profile.get("handle") or "ARMY",
            "country_code": country,
            "total_streams": total,
            "today_streams": today_count,
            "unique_tracks": int(profile.get("unique_tracks") or 0),
            "last_played_at": profile.get("last_played_at"),
        })

        last_played = profile.get("last_played_at")
        if last_played and (latest_play is None or last_played > latest_play):
            latest_play = last_played

        # Public profile RPC intentionally returns only the latest 50 events.
        # These are labelled as a recent sample, never as an all-time track chart.
        for event in profile.get("recent_events") or []:
            track = (event.get("track") or "").strip()
            artist = (event.get("artist") or "").strip()
            if not track:
                continue
            key = (track.casefold(), artist.casefold())
            item = track_sample.setdefault(key, {
                "track": track,
                "artist": artist,
                "recent_plays_sampled": 0,
                "last_played_at": None,
            })
            item["recent_plays_sampled"] += 1
            played_at = event.get("played_at")
            if played_at and (item["last_played_at"] is None or played_at > item["last_played_at"]):
                item["last_played_at"] = played_at
            sampled_events += 1

    members.sort(key=lambda row: (row["total_streams"], row["today_streams"]), reverse=True)
    countries = sorted(country_stats.values(), key=lambda row: row["streams"], reverse=True)
    recent_tracks = sorted(
        track_sample.values(),
        key=lambda row: (row["recent_plays_sampled"], row["last_played_at"] or ""),
        reverse=True,
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "methodology": {
            "scope": "Perfiles públicos aprobados con consentimiento activo",
            "stream_totals": "Suma de las estadísticas agregadas de los perfiles públicos; no representa cuentas privadas.",
            "track_chart": "Muestra de hasta las últimas 50 escuchas por perfil público; no es un ranking histórico completo.",
            "timezone": "UTC",
        },
        "summary": {
            "public_profiles": len(members),
            "public_profile_streams": public_streams,
            "public_profile_streams_today_utc": streams_today,
            "recent_events_sampled": sampled_events,
            "countries_represented": len(countries),
            "last_played_at": latest_play,
        },
        "top_members": members[:10],
        "top_countries": countries[:10],
        "recent_tracks_sample": recent_tracks[:10],
    }


def refresh_analytics():
    directory = rpc("get_public_profiles")
    if not isinstance(directory, list):
        raise RuntimeError("Public profile directory returned an unexpected response.")
    handles = [row.get("handle") for row in directory if isinstance(row, dict) and row.get("handle")]
    profiles = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(load_public_profile, handle) for handle in handles[:100]]
        for future in as_completed(futures):
            profile = future.result()
            if profile:
                profiles.append(profile)
    return build_analytics(profiles)


@app.get("/api/analytics")
def analytics():
    now = time.time()
    with _cache_lock:
        cached = _cache["data"]
        if cached is not None and now - _cache["created"] < CACHE_SECONDS:
            return JSONResponse(cached, headers={"Cache-Control": "public, max-age=60"})
    try:
        data = refresh_analytics()
    except Exception:
        raise HTTPException(status_code=502, detail="No se pudieron cargar las estadísticas públicas. Intenta de nuevo en un momento.")
    with _cache_lock:
        _cache.update({"created": time.time(), "data": data})
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=60"})


@app.get("/api/health")
def health():
    return {"ok": True, "service": "GLOBAL STREAMVERSE Python Analytics", "version": app.version}
