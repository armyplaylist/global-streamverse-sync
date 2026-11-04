import os
import time
from datetime import datetime, timezone

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://ylybwiwemlnekclrwwjq.supabase.co").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_CLbbu_GKYbH5sRB9R-EsSg_r3-jL9BN")
app = FastAPI(title="GLOBAL STREAMVERSE Catalog Analytics", version="1.0.0")
_cache = {"created": 0.0, "data": None}
CACHE_SECONDS = 45


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
            key = row["album_uri"]
            item = albums.setdefault(key, {
                "album_uri": key, "album_name": row.get("album_name"),
                "album_type": row.get("album_type"), "album_release_date": row.get("album_release_date"),
                "album_image_url": row.get("album_image_url"), "total_streams": 0,
                "track_count": 0, "_track_ids": set(),
            })
            track_id = row.get("musicat_track_id") or row.get("track_id") or row.get("track_name")
            if track_id not in item["_track_ids"]:
                item["_track_ids"].add(track_id)
                item["track_count"] += 1
                item["total_streams"] += total
        if row.get("match_status") == "ambiguous":
            for candidate in row.get("spotify_candidates") or []:
                uri, name = candidate.get("album_uri"), candidate.get("album_name")
                if not uri or not name or uri in albums:
                    continue
                item = candidates.setdefault(uri, {
                    "album_uri": uri, "album_name": name, "album_type": candidate.get("album_type"),
                    "album_release_date": candidate.get("album_release_date"),
                    "album_image_url": candidate.get("album_image_url"), "tracks": [],
                })
                track_name = row.get("track_name") or ""
                if track_name not in item["tracks"]:
                    item["tracks"].append(track_name)

    confirmed = sorted(albums.values(), key=lambda item: item["total_streams"], reverse=True)
    possible = sorted(candidates.values(), key=lambda item: item["album_name"].casefold())
    for item in confirmed:
        item.pop("_track_ids", None)

    payload["python_analytics"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_streams": total_streams, "tracks": len(rows),
            "matched_tracks": sum(1 for row in rows if row.get("match_status") == "matched"),
            "pending_tracks": sum(1 for row in rows if row.get("match_status") in ("ambiguous", "not_found", "error")),
            "confirmed_albums": len(confirmed), "candidate_albums": len(possible),
        },
        "top_tracks": sorted(rows, key=lambda row: int(row.get("total_streams") or 0), reverse=True)[:10],
        "top_albums": confirmed[:10],
        "candidate_albums": possible[:10],
        "methodology": "Los álbumes confirmados suman streams de canciones con coincidencia única en Spotify. Las versiones candidatas no reciben streams.",
    }
    return payload


@app.get("/api/catalog")
def catalog():
    now = time.time()
    if _cache["data"] is not None and now - _cache["created"] < CACHE_SECONDS:
        return JSONResponse(_cache["data"], headers={"Cache-Control": "public, max-age=45"})
    try:
        data = load_catalog()
    except Exception:
        raise HTTPException(status_code=502, detail="No se pudo cargar el catálogo global. Intenta de nuevo en un momento.")
    _cache.update({"created": time.time(), "data": data})
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=45"})
