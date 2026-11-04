import time
from datetime import datetime, timezone

import pandas as pd
import requests
import streamlit as st

st.set_page_config(
    page_title="Streamverse Control",
    page_icon="✦",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
:root { --ink:#211b35; --muted:#80788f; --lav:#8065c9; --line:#eeeaf5; }
html, body, [class*="css"] { font-family:'DM Sans',sans-serif; color:var(--ink); }
.stApp { background: radial-gradient(circle at 85% 0%,#f0eaff 0,transparent 30%),#faf9fc; }
h1,h2,h3 { font-family:'Manrope',sans-serif !important; letter-spacing:-.035em; }
.block-container { max-width:1420px; padding-top:2rem; padding-bottom:3rem; }
[data-testid="stSidebar"] { background:#211b35; }
[data-testid="stSidebar"] * { color:#f5f1ff !important; }
[data-testid="stMetric"] { background:#fff; border:1px solid var(--line); padding:18px 20px; border-radius:18px; box-shadow:0 8px 24px #30204b0a; }
[data-testid="stMetricLabel"] { color:#817990 !important; }
[data-testid="stMetricValue"] { color:#241d38 !important; font-family:'Manrope',sans-serif; }
.stButton>button { border-radius:12px; border:1px solid #ded5f3; background:#8065c9; color:white; font-weight:700; min-height:42px; }
.stButton>button:hover { background:#6c51b5; border-color:#6c51b5; color:white; }
.stTextInput input,.stSelectbox div[data-baseweb="select"] { border-radius:11px; }
div[data-testid="stVerticalBlockBorderWrapper"] { border-radius:18px; border-color:var(--line); background:#fff; }
.small-muted { color:#817990; font-size:.88rem; }
.brand { font-family:'Manrope',sans-serif; font-weight:800; letter-spacing:-.05em; font-size:1.25rem; }
.pill { display:inline-block; border-radius:999px; padding:5px 10px; background:#f0ebfb; color:#6449a6; font-size:.78rem; font-weight:700; }
.login-wrap { max-width:480px; margin:8vh auto 0; padding:2rem; background:#fff; border:1px solid var(--line); border-radius:24px; box-shadow:0 24px 80px #33204b12; }
</style>
""", unsafe_allow_html=True)

def get_config():
    try:
        return str(st.secrets["SUPABASE_URL"]).rstrip("/"), str(st.secrets["SUPABASE_ANON_KEY"])
    except Exception:
        st.error("Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en Streamlit → Settings → Secrets.")
        st.code('SUPABASE_URL = "https://TU-PROYECTO.supabase.co"\nSUPABASE_ANON_KEY = "TU_CLAVE_PUBLICA_ANON"')
        st.stop()

SUPABASE_URL, SUPABASE_ANON_KEY = get_config()

def auth_headers(token):
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

def sign_in(email, password):
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    data = response.json()
    if not response.ok:
        raise RuntimeError(data.get("msg") or data.get("message") or "No se pudo iniciar sesión.")
    st.session_state["session"] = {
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": time.time() + int(data.get("expires_in", 3600)),
        "email": email,
    }

def current_token():
    session = st.session_state.get("session")
    if not session:
        return None
    if session["expires_at"] < time.time() + 90:
        response = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            json={"refresh_token": session["refresh_token"]},
            timeout=20,
        )
        data = response.json()
        if not response.ok:
            st.session_state.pop("session", None)
            st.error("Tu sesión expiró. Inicia sesión nuevamente.")
            st.stop()
        session.update({
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": time.time() + int(data.get("expires_in", 3600)),
        })
        st.session_state["session"] = session
    return session["access_token"]

def rpc(name, payload=None):
    token = current_token()
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers=auth_headers(token),
        json=payload or {},
        timeout=30,
    )
    try:
        data = response.json()
    except Exception:
        data = {}
    if not response.ok:
        message = data.get("message") or data.get("details") or "No se pudo completar la operación."
        if response.status_code in (401, 403) or "not_authorized" in str(message):
            raise PermissionError("Esta cuenta no tiene permisos de administración.")
        raise RuntimeError(message)
    return data

def fmt(value):
    try:
        return f"{int(value or 0):,}"
    except (TypeError, ValueError):
        return "0"

def show_login():
    st.markdown('<div class="login-wrap">', unsafe_allow_html=True)
    st.markdown('<div class="brand">✦ GLOBAL STREAMVERSE</div><div class="small-muted">CONTROL CENTER</div>', unsafe_allow_html=True)
    st.title("Bienvenida")
    st.write("Inicia sesión con tu cuenta de Streamverse.")
    with st.form("login_form"):
        email = st.text_input("Correo electrónico", placeholder="tu-correo@ejemplo.com")
        password = st.text_input("Contraseña", type="password")
        submitted = st.form_submit_button("Entrar al panel", use_container_width=True)
    if submitted:
        try:
            sign_in(email.strip(), password)
            st.rerun()
        except Exception as exc:
            st.error(str(exc))
    st.markdown("</div>", unsafe_allow_html=True)

if not st.session_state.get("session"):
    show_login()
    st.stop()

session = st.session_state["session"]
with st.sidebar:
    st.markdown('<div class="brand">✦ STREAMVERSE</div>', unsafe_allow_html=True)
    st.caption("CONTROL CENTER")
    st.divider()
    st.write(f"Sesión: {session.get('email','')}")
    page = st.radio("Panel", ["Resumen", "Versiones", "Participantes", "Sincronizaciones"], label_visibility="collapsed")
    st.divider()
    if st.button("Cerrar sesión", use_container_width=True):
        st.session_state.pop("session", None)
        st.rerun()

st.markdown('<span class="pill">ADMINISTRACIÓN PRIVADA</span>', unsafe_allow_html=True)
st.title("Streamverse Control")
st.caption("Datos en vivo desde Supabase · Zona horaria de métricas: UTC")

try:
    stats = rpc("admin_dashboard_stats")
except Exception as exc:
    st.error(str(exc))
    st.stop()

if page == "Resumen":
    st.subheader("Vista general")
    cols = st.columns(4)
    metrics = [
        ("Reproducciones", stats.get("streams_total")),
        ("Hoy · UTC", stats.get("streams_today")),
        ("Participantes", stats.get("participants_total")),
        ("Canciones", stats.get("tracks_total")),
    ]
    for col, (label, value) in zip(cols, metrics):
        col.metric(label, fmt(value))
    cols = st.columns(4)
    for col, label, value in zip(
        cols,
        ["Participantes activos", "Versiones por confirmar", "Coincidencias listas", "Fallos de sync · 24 h"],
        [stats.get("participants_approved"), stats.get("tracks_ambiguous", 0) + stats.get("tracks_pending", 0), stats.get("tracks_matched"), stats.get("sync_failures_24h")],
    ):
        col.metric(label, fmt(value))
    st.divider()
    left, right = st.columns([1.4, 1])
    with left:
        st.subheader("Actividad · últimos 14 días")
        daily = pd.DataFrame(stats.get("daily_streams") or [])
        if not daily.empty:
            daily["day"] = pd.to_datetime(daily["day"])
            st.bar_chart(daily.set_index("day")[["streams"]], height=280)
        else:
            st.info("Todavía no hay actividad para mostrar.")
    with right:
        st.subheader("Catálogo")
        st.progress(
            min(1.0, (stats.get("tracks_matched") or 0) / max(1, stats.get("tracks_total") or 0)),
            text=f"{fmt(stats.get('tracks_matched'))} de {fmt(stats.get('tracks_total'))} canciones identificadas",
        )
        st.caption(f"{fmt(stats.get('tracks_ambiguous'))} versiones ambiguas · {fmt(stats.get('tracks_pending'))} pendientes")
        st.subheader("Estado de sincronización")
        st.metric("Ejecuciones en 24 h", fmt(stats.get("sync_runs_24h")))
        st.metric("Con errores", fmt(stats.get("sync_failures_24h")))
    st.divider()
    st.subheader("Actividad reciente")
    recent = pd.DataFrame(stats.get("latest_syncs") or [])
    if not recent.empty:
        st.dataframe(recent, use_container_width=True, hide_index=True)
    else:
        st.info("Aún no hay ejecuciones registradas.")
    failures = pd.DataFrame(stats.get("recent_failures") or [])
    if not failures.empty:
        st.subheader("Alertas · últimas 24 horas")
        st.warning("Hay sincronizaciones que necesitan revisión.")
        st.dataframe(failures, use_container_width=True, hide_index=True)

elif page == "Versiones":
    st.subheader("Versiones por confirmar")
    st.caption("Elige la edición correcta. La confirmación solo actualiza los metadatos del catálogo; no modifica reproducciones.")
    try:
        pending = rpc("admin_list_pending_versions")
    except Exception as exc:
        st.error(str(exc))
        pending = []
    if not pending:
        st.success("No hay versiones pendientes.")
    for item in pending:
        candidates = item.get("spotify_candidates") or []
        with st.container(border=True):
            st.markdown(f"**{item.get('track_name','')}**  ·  {item.get('artist_name','')}")
            st.caption(f"Estado: {item.get('match_status','')}")
            if not candidates:
                st.warning("No hay coincidencias candidatas. Esta canción necesita una nueva búsqueda de catálogo.")
                continue
            labels = []
            for idx, candidate in enumerate(candidates):
                labels.append(
                    f"{candidate.get('album_name','Álbum desconocido')} · {candidate.get('album_type','')} · "
                    f"{candidate.get('album_release_date','Sin fecha')} · pista {candidate.get('track_number','?')} · "
                    f"ISRC {candidate.get('isrc','—')}"
                )
            selected = st.selectbox(
                "Edición encontrada",
                range(len(candidates)),
                format_func=lambda i, labels=labels: labels[i],
                key=f"candidate_{item['musicat_track_id']}",
            )
            candidate = candidates[selected]
            c1, c2 = st.columns([1, 3])
            with c1:
                if candidate.get("album_image_url"):
                    st.image(candidate["album_image_url"], width=120)
            with c2:
                st.write(f"**{candidate.get('album_name','')}**")
                st.caption(f"{candidate.get('album_release_date','')} · {candidate.get('album_total_tracks','?')} canciones · disco {candidate.get('disc_number','?')}")
                if candidate.get("spotify_track_url"):
                    st.link_button("Abrir en Spotify", candidate["spotify_track_url"])
                if candidate.get("duration_ms"):
                    st.caption(f"Duración: {int(candidate['duration_ms']) // 60000}:{(int(candidate['duration_ms']) // 1000) % 60:02d}")
            if st.button("Confirmar esta versión", key=f"confirm_{item['musicat_track_id']}", type="primary"):
                try:
                    rpc("admin_confirm_track_version", {
                        "p_musicat_track_id": item["musicat_track_id"],
                        "p_candidate_index": selected + 1,
                    })
                    st.success("Versión confirmada.")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))

elif page == "Participantes":
    st.subheader("Participantes")
    st.caption("Administra el estado de cada perfil. Pausar o rechazar no borra su historial.")
    try:
        people = rpc("admin_list_participants")
    except Exception as exc:
        st.error(str(exc))
        people = []
    if people:
        df = pd.DataFrame(people)
        st.dataframe(df, use_container_width=True, hide_index=True)
        for person in people:
            with st.container(border=True):
                c1, c2, c3 = st.columns([2, 1, 1])
                c1.markdown(f"**{person['display_name']}**")
                c1.caption(f"{person['country_code']} · {person['provider']} · {fmt(person['stream_count'])} reproducciones")
                options = ["pending", "approved", "paused", "rejected"]
                current = person.get("status", "pending")
                new_status = c2.selectbox(
                    "Estado", options, index=options.index(current) if current in options else 0,
                    key=f"status_{person['id']}", label_visibility="collapsed"
                )
                if c3.button("Guardar", key=f"save_status_{person['id']}"):
                    try:
                        rpc("admin_set_participant_status", {
                            "p_participant_id": person["id"], "p_status": new_status
                        })
                        st.success("Estado actualizado.")
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))
    else:
        st.info("No hay participantes registrados.")

elif page == "Sincronizaciones":
    st.subheader("Sincronizaciones")
    runs = pd.DataFrame(stats.get("latest_syncs") or [])
    if not runs.empty:
        st.dataframe(runs, use_container_width=True, hide_index=True)
    else:
        st.info("No hay ejecuciones registradas.")
    recent_failures = pd.DataFrame(stats.get("recent_failures") or [])
    if not recent_failures.empty:
        st.warning("Hay ejecuciones con error durante las últimas 24 horas.")
        st.dataframe(recent_failures, use_container_width=True, hide_index=True)
    else:
        st.success("No se registran fallos en las últimas 24 horas.")

st.divider()
st.caption("GLOBAL STREAMVERSE · Panel privado. Las acciones administrativas se validan en Supabase; la clave service_role nunca se expone en Streamlit.")
