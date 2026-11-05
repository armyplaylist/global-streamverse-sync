import os
import time
from datetime import datetime, timezone
from threading import Lock

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="GLOBAL STREAMVERSE Spotify Argentina Chart", version="1.0.0")
_cache = {"created": 0.0, "data": None}
_cache_lock = Lock()
CACHE_SECONDS = 3 * 60 * 60


def number(value):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def normalise_chart(payload, stale=False):
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected Spotify chart response.")
    rows = []
    for raw in payload:
        entry = raw.get("chartEntryData") or {}
        track = raw.get("trackMetadata") or {}
        artists = [
            artist.get("name", "")
            for artist in (track.get("artists") or [])
            if isinstance(artist, dict)
        ]
        rank = number(entry.get("currentRank"))
        streams = number((entry.get("rankingMetric") or {}).get("value"))
        if not rank or not track.get("trackName"):
            continue
        rows.append({
            "rank": rank,
            "previous_rank": number(entry.get("previousRank")),
            "peak_rank": number(entry.get("peakRank")),
            "appearances": number(entry.get("appearancesOnChart")),
            "streams": streams,
            "track": track.get("trackName") or "Unknown track",
            "artists": artists,
            "is_bts": any(name.strip().casefold() == "bts" for name in artists),
            "image": track.get("displayImageUri") or "",
            "spotify_uri": track.get("trackUri") or "",
            "entry_status": entry.get("entryStatus") or "",
        })
    rows.sort(key=lambda item: item["rank"])
    rank_200 = next((row for row in rows if row["rank"] == 200), rows[-1] if rows else None)

    for index, row in enumerate(rows):
        above = rows[index - 1] if index > 0 and rows[index - 1]["rank"] == row["rank"] - 1 else None
        below = rows[index + 1] if index + 1 < len(rows) and rows[index + 1]["rank"] == row["rank"] + 1 else None
        row["gap_to_above"] = max(0, above["streams"] - row["streams"] + 1) if above else None
        row["gap_to_below"] = max(0, row["streams"] - below["streams"]) if below else None
        row["gap_to_200"] = max(0, row["streams"] - rank_200["streams"]) if rank_200 and row["rank"] < 200 else 0

        movement = row["previous_rank"] - row["rank"] if row["previous_rank"] > 0 else 0
        row["movement"] = movement
        up_gap, down_gap = row["gap_to_above"], row["gap_to_below"]
        if up_gap is not None and down_gap is not None:
            spread = (down_gap - up_gap) / max(down_gap + up_gap, 1)
        elif up_gap is None:
            spread = 0.25
        else:
            spread = -0.25
        score = max(5, min(95, round(50 + movement * 7 + spread * 18)))
        row["up_probability"] = score
        row["down_risk"] = 100 - score

        if row["rank"] >= 195 or (
            row["rank"] >= 180 and row["gap_to_200"] <= 1500
        ) or (
            movement < 0 and down_gap is not None and down_gap <= 1000
        ):
            row["risk_label"] = "Riesgo alto"
        elif movement < 0 or (down_gap is not None and down_gap <= 5000):
            row["risk_label"] = "Vigilar"
        else:
            row["risk_label"] = "Estable"

        row["trend_label"] = "Subiendo" if movement > 0 else "Bajando" if movement < 0 else "Sin cambio"

    chart_date = next((item.get("chartDate") for item in payload if item.get("chartDate")), None)
    return {
        "country": "AR",
        "country_name": "Argentina",
        "chart_date": chart_date,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stale": bool(stale),
        "total_tracks": len(rows),
        "bts_tracks": [row for row in rows if row["is_bts"]],
        "rows": rows,
        "methodology": (
            "El índice de subida/bajada es orientativo y combina movimiento diario y gaps entre "
            "puestos; no es una predicción estadística. Los gaps se calculan con streams del mismo chart."
        ),
    }


@app.get("/api/spotify_argentina")
def spotify_argentina(request: Request):
    refresh = request.query_params.get("refresh") == "1"
    now = time.time()
    with _cache_lock:
        cached = _cache["data"]
        if not refresh and cached is not None and now - _cache["created"] < CACHE_SECONDS:
            return JSONResponse(cached, headers={"Cache-Control": "public, max-age=3600"})

    api_key = os.getenv("CHECKLEAKED_RAPIDAPI_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Falta configurar la clave privada CHECKLEAKED_RAPIDAPI_KEY en Vercel.",
        )

    # The configured secret is a RapidAPI app key, so use the RapidAPI
    # gateway (not the direct CheckLeaked portal URL).
    rapidapi_host = os.getenv("CHECKLEAKED_RAPIDAPI_HOST", "spotify81.p.rapidapi.com").strip()
    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": rapidapi_host,
    }

    try:
        response = requests.get(
            f"https://{rapidapi_host}/spotify-data/top_200_tracks",
            params={
                "period": "daily",
                "country": "ar",
                "cache": "false" if refresh else "true",
            },
            headers=headers,
            timeout=25,
        )
        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="El proveedor rechazó la clave. Revisa CHECKLEAKED_RAPIDAPI_KEY y, si usas RapidAPI, CHECKLEAKED_RAPIDAPI_HOST.",
            )
        if response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail="El proveedor alcanzó su límite temporal de consultas. Intenta más tarde.",
            )
        response.raise_for_status()
        data = normalise_chart(
            response.json(),
            response.headers.get("X-Charts-Data-Stale", "").lower() == "true",
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="No se pudo consultar el Top 200 de Spotify Argentina. Intenta más tarde.",
        )

    with _cache_lock:
        _cache.update({"created": time.time(), "data": data})
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=3600"})
