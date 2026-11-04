# GLOBAL STREAMVERSE · Streamlit Control Center

Panel privado para administración del catálogo, participantes y sincronizaciones.

## Deploy

1. Abre https://share.streamlit.io/ e inicia sesión con GitHub.
2. Selecciona el repositorio `armyplaylist/global-streamverse-sync`.
3. Main file path: `admin/streamlit_app.py`.
4. En **Advanced settings → Secrets**, añade:

```toml
SUPABASE_URL = "https://ylybwiwemlnekclrwwjq.supabase.co"
SUPABASE_ANON_KEY = "TU_CLAVE_PUBLICA_ANON"
```

5. Deploy.

La clave anon/publicable es la única clave de Supabase que se configura aquí. **No pegues la service_role ni una secret key**.

## Seguridad

- Inicio de sesión con Supabase Auth.
- Cada acción llama RPCs protegidas por el rol de administrador en Postgres.
- La cuenta propietaria del perfil actual `@romi_a0038` quedó autorizada como administradora.
- No se guarda la contraseña; el token de sesión vive en la sesión de Streamlit.
- Las confirmaciones actualizan metadatos de catálogo, no los eventos de reproducción.
