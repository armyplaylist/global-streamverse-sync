import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEY = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_ORIGIN = "https://global-streamverse.vercel.app";

const responseHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}
function apiHeaders() {
  const headers: Record<string, string> = { apikey: SECRET_KEY, "Content-Type": "application/json" };
  if (!SECRET_KEY.startsWith("sb_secret_")) headers.Authorization = `Bearer ${SECRET_KEY}`;
  return headers;
}
function normalizeMusicatUrl(raw: unknown) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" ||
        !["musicat.fm", "www.musicat.fm"].includes(url.hostname.toLowerCase()) ||
        segments.length !== 1) return null;
    return `https://musicat.fm/${segments[0]}`;
  } catch { return null; }
}
function validCountry(code: unknown) {
  return typeof code === "string" && /^[A-Z]{2}$/.test(code);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && req.headers.get("origin") !== SITE_ORIGIN) {
      return new Response("Forbidden origin", { status: 403 });
    }
    return new Response("ok", { headers: responseHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") && req.headers.get("origin") !== SITE_ORIGIN) {
    return json({ error: "Origin not allowed" }, 403);
  }
  if (!SUPABASE_URL || !SECRET_KEY) return json({ error: "Server auth is not configured" }, 503);

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const displayName = typeof input.display_name === "string" ? input.display_name.trim() : "";
  const countryCode = input.country_code;
  const profileUrl = normalizeMusicatUrl(input.public_profile_url);
  const providerUsername = typeof input.provider_username === "string" ? input.provider_username.trim().slice(0, 100) : "";

  if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(username)) {
    return json({ error: "El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo." }, 400);
  }
  if (password.length < 8 || password.length > 72) {
    return json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
  }
  if (displayName.length < 2 || displayName.length > 40) return json({ error: "El nickname debe tener entre 2 y 40 caracteres." }, 400);
  if (!validCountry(countryCode)) return json({ error: "Selecciona un país válido." }, 400);
  if (!profileUrl) return json({ error: "Introduce el enlace público de un perfil de Musicat válido." }, 400);
  if (input.consent !== true) return json({ error: "Debes aceptar el consentimiento para participar." }, 400);

  const email = `${username}@accounts.global-streamverse.invalid`;
  const headers = apiHeaders();

  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/participants?select=id&login_username=eq.${encodeURIComponent(username)}&limit=1`,
    { headers: { apikey: SECRET_KEY, ...(SECRET_KEY.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${SECRET_KEY}` }) } },
  );
  if (!existing.ok) return json({ error: "No pudimos comprobar el nombre de usuario. Inténtalo de nuevo." }, 503);
  if ((await existing.json()).length) return json({ error: "Ese nombre de usuario ya está ocupado. Elige otro." }, 409);

  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
      app_metadata: { login_method: "username_password" },
    }),
  });
  const createdBody = await created.json().catch(() => ({}));
  if (!created.ok || !createdBody.id) {
    const message = String(createdBody.msg || createdBody.message || createdBody.error_description || "");
    if (created.status === 422 || /already|registered|exists/i.test(message)) {
      return json({ error: "Ese nombre de usuario ya está ocupado. Elige otro." }, 409);
    }
    return json({ error: "No se pudo crear la cuenta. Comprueba los datos e inténtalo de nuevo." }, 400);
  }

  const participant = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      auth_user_id: createdBody.id,
      login_username: username,
      display_name: displayName,
      country_code: countryCode,
      provider: "musicat",
      public_profile_url: profileUrl,
      provider_username: providerUsername || null,
      consent: true,
      status: "pending",
    }),
  });
  const participantRows = await participant.json().catch(() => []);
  if (!participant.ok || !Array.isArray(participantRows) || !participantRows[0]?.id) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createdBody.id}`, { method: "DELETE", headers });
    if (participant.status === 409 || participant.status === 23505) {
      return json({ error: "Ese nombre de usuario ya está ocupado. Elige otro." }, 409);
    }
    return json({ error: "La cuenta se creó, pero no pudimos guardar el perfil. Inténtalo de nuevo." }, 500);
  }

  const directory = await fetch(`${SUPABASE_URL}/rest/v1/participant_directory`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      participant_id: participantRows[0].id,
      display_name: displayName,
      country_code: countryCode,
      is_active: false,
    }),
  });
  if (!directory.ok) {
    await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${participantRows[0].id}`, { method: "DELETE", headers });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createdBody.id}`, { method: "DELETE", headers });
    return json({ error: "No pudimos completar el perfil. Inténtalo de nuevo." }, 500);
  }

  return json({ success: true, username, message: "Cuenta creada. Puedes iniciar sesión mientras Musicat valida tu perfil automáticamente." }, 201);
});