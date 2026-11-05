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


def load_catalog():
    response = requests.get(
        f"{SUPABASE_URL}/functions/v1/tracks-catalog",
        params={"limit": 250},
        headers={"apikey": SUPABASE_KEY},
        timeout=25,
    )
    if not response.ok:
        raise RuntimeError(f"Track catalog returned HTTP {response.status_code}")
    payload = response.json()
    rows = payload.get("rows") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("Track catalog returned an unexpected response.")

    albums = {}
    candidates = {}
    total_streams = 0
    for row in rows:
        total = int(row.get("total_streams") or 0)
        total_streams += total
        if row.get("match_status") == "matched" and row.get("album_name") and row.get("album_uri"):
            key = row.get("album_uri")
            item = albums.setdefault(key, {
                "album_uri": key,
                "album_name": row.get("album_name"),
                "album_type": row.get("album_type"),
                "album_release_date": row.get("album_release_date"),
                "album_image_url": row.get("album_image_url"),
                "total_streams": 0,
                "track_count": 0,
                "tracks": [],
            })
            track_id = row.get("musicat_track_id") or row.get("track_id") or row.get("track_name")
            if track_id not in item["tracks"]:
                item["tracks"].append(track_id)
                item["track_count"] += 1
                item["total_streams"] += total
        if row.get("match_status") == "ambiguous":
            for candidate in row.get("spotify_candidates") or []:
                uri = candidate.get("album_uri")
                name = candidate.get("album_name")
                if not uri or not name or uri in albums:
                    continue
                item = candidates.setdefault(uri, {
                    "album_uri": uri,
                    "album_name": name,
                    "album_type": candidate.get("album_type"),
                    "album_release_date": candidate.get("album_release_date"),
                    "album_image_url": candidate.get("album_image_url"),
                    "tracks": [],
                })
                track_name = row.get("track_name") or ""
                if track_name not in item["tracks"]:
                    item["tracks"].append(track_name)

    confirmed = sorted(albums.values(), key=lambda item: item["total_streams"], reverse=True)
    possible = sorted(candidates.values(), key=lambda item: item["album_name"].casefold())
    payload["python_analytics"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_streams": total_streams,
            "tracks": len(rows),
            "matched_tracks": sum(1 for row in rows if row.get("match_status") == "matched"),
            "pending_tracks": sum(1 for row in rows if row.get("match_status") in ("ambiguous", "not_found", "error")),
            "confirmed_albums": len(confirmed),
            "candidate_albums": len(possible),
        },
        "top_tracks": sorted(rows, key=lambda row: int(row.get("total_streams") or 0), reverse=True)[:10],
        "top_albums": confirmed[:10],
        "candidate_albums": possible[:10],
        "methodology": "Los álbumes confirmados suman streams de canciones con coincidencia única en Spotify. Las versiones candidatas no reciben streams.",
    }
    return payload


_catalog_cache = {"created": 0.0, "data": None}
_catalog_lock = Lock()


@app.get("/api/catalog")
def catalog():
    now = time.time()
    with _catalog_lock:
        cached = _catalog_cache["data"]
        if cached is not None and now - _catalog_cache["created"] < 45:
            return JSONResponse(cached, headers={"Cache-Control": "public, max-age=45"})
    try:
        data = load_catalog()
    except Exception:
        raise HTTPException(status_code=502, detail="No se pudo cargar el catálogo global. Intenta de nuevo en un momento.")
    with _catalog_lock:
        _catalog_cache.update({"created": time.time(), "data": data})
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=45"})


_spotify_ar_cache = {"created": 0.0, "data": None}
_spotify_ar_lock = Lock()
SPOTIFY_AR_CACHE_SECONDS = 3 * 60 * 60


def _chart_number(value):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _normalise_spotify_ar_chart(payload, stale_header=False):
    if not isinstance(payload, list):
        raise RuntimeError("Spotify Argentina returned an unexpected chart format.")
    rows = []
    for raw in payload:
        entry = raw.get("chartEntryData") or {}
        track = raw.get("trackMetadata") or {}
        artists = [artist.get("name", "") for artist in (track.get("artists") or []) if isinstance(artist, dict)]
        rank = _chart_number(entry.get("currentRank"))
        streams = _chart_number((entry.get("rankingMetric") or {}).get("value"))
        if not rank or not track.get("trackName"):
            continue
        rows.append({
            "rank": rank,
            "previous_rank": _chart_number(entry.get("previousRank")),
            "peak_rank": _chart_number(entry.get("peakRank")),
            "appearances": _chart_number(entry.get("appearancesOnChart")),
            "streams": streams,
            "track": track.get("trackName") or "Unknown track",
            "artists": artists,
            "is_bts": any(name.strip().casefold() == "bts" for name in artists),
            "image": track.get("displayImageUri") or "",
            "spotify_uri": track.get("trackUri") or "",
            "entry_status": entry.get("entryStatus") or "",
        })
    rows.sort(key=lambda item: item["rank"])
    for index, row in enumerate(rows):
        above = rows[index - 1] if index > 0 and rows[index - 1]["rank"] == row["rank"] - 1 else None
        below = rows[index + 1] if index + 1 < len(rows) and rows[index + 1]["rank"] == row["rank"] + 1 else None
        row["gap_to_above"] = max(0, above["streams"] - row["streams"] + 1) if above else None
        row["gap_to_below"] = max(0, row["streams"] - below["streams"]) if below else None
        last = rows[-1] if rows else None
        row["gap_to_200"] = max(0, row["streams"] - last["streams"]) if last and row["rank"] < 200 else 0
        movement = row["previous_rank"] - row["rank"] if row["previous_rank"] > 0 else 0
        row["movement"] = movement
        # A transparent directional indicator, not a trained statistical forecast.
        up_gap = row["gap_to_above"]
        down_gap = row["gap_to_below"]
        if up_gap is not None and down_gap is not None:
            spread = (down_gap - up_gap) / max(down_gap + up_gap, 1)
        elif up_gap is None:
            spread = 0.25
        else:
            spread = -0.25
        score = max(5, min(95, round(50 + movement * 7 + spread * 18)))
        row["up_probability"] = score
        row["down_risk"] = 100 - score
        if row["rank"] >= 195 or (row["rank"] >= 180 and row["gap_to_200"] <= 1500) or (movement < 0 and row["gap_to_below"] is not None and row["gap_to_below"] <= 1000):
            row["risk_label"] = "Riesgo alto"
        elif movement < 0 or (row["gap_to_below"] is not None and row["gap_to_below"] <= 5000):
            row["risk_label"] = "Vigilar"
        else:
            row["risk_label"] = "Estable"
        if movement > 0:
            row["trend_label"] = "Subiendo"
        elif movement < 0:
            row["trend_label"] = "Bajando"
        else:
            row["trend_label"] = "Sin cambio"
    chart_date = next((item.get("chartDate") for item in payload if item.get("chartDate")), None)
    return {
        "country": "AR",
        "country_name": "Argentina",
        "chart_date": chart_date,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stale": bool(stale_header),
        "total_tracks": len(rows),
        "bts_tracks": [row for row in rows if row["is_bts"]],
        "rows": rows,
        "methodology": "La probabilidad es un índice orientativo basado en movimiento diario y gaps entre puestos; no es una predicción estadística. Los gaps se calculan con streams del mismo chart.",
    }


@app.get("/api/spotify-argentina")
def spotify_argentina():
    now = time.time()
    with _spotify_ar_lock:
        cached = _spotify_ar_cache["data"]
        if cached is not None and now - _spotify_ar_cache["created"] < SPOTIFY_AR_CACHE_SECONDS:
            return JSONResponse(cached, headers={"Cache-Control": "public, max-age=3600"})
    api_key = os.getenv("CHECKLEAKED_RAPIDAPI_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="El chart de Spotify Argentina está pendiente de configurar. Falta la clave privada CHECKLEAKED_RAPIDAPI_KEY en Vercel.")
    headers = {"x-rapidapi-key": api_key}
    rapidapi_host = os.getenv("CHECKLEAKED_RAPIDAPI_HOST", "").strip()
    if rapidapi_host:
        headers["x-rapidapi-host"] = rapidapi_host
    try:
        response = requests.get(
            "https://spotify-proxy.checkleaked.cc/spotify-data/top_200_tracks",
            params={"period": "daily", "country": "ar", "cache": "false" if refresh else "true"},
            headers=headers,
            timeout=25,
        )
        if not response.ok:
            if response.status_code in (401, 403):
                raise HTTPException(status_code=502, detail="La clave del proveedor fue rechazada. Revisa CHECKLEAKED_RAPIDAPI_KEY y, si usas RapidAPI, CHECKLEAKED_RAPIDAPI_HOST.")
            if response.status_code == 429:
                raise HTTPException(status_code=503, detail="El proveedor alcanzó su límite temporal de consultas. Intenta más tarde.")
            raise RuntimeError(f"Spotify charts provider returned HTTP {response.status_code}")
        data = _normalise_spotify_ar_chart(response.json(), response.headers.get("X-Charts-Data-Stale", "").lower() == "true")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="No se pudo consultar el Top 200 de Spotify Argentina. Intenta de nuevo más tarde.")
    with _spotify_ar_lock:
        _spotify_ar_cache.update({"created": time.time(), "data": data})
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})
