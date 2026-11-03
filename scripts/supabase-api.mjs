export function detectSupabaseCredentialType(key) {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Missing SUPABASE_SECRET_KEY.");
  }
  if (key.startsWith("sb_secret_")) return "new-secret";
  if (key.startsWith("sb_publishable_")) {
    throw new Error("A publishable key was supplied. Use the secret key, not sb_publishable_.");
  }

  const parts = key.split(".");
  if (parts.length === 3 && parts[1]) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (claims.role === "service_role") return "legacy-service-role";
      throw new Error("The legacy JWT does not have the service_role claim. Do not use the anon key.");
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("SUPABASE_SECRET_KEY is not a recognized Supabase secret credential.");
      }
      throw error;
    }
  }

  throw new Error("Use a Supabase sb_secret_ key or the legacy service_role key.");
}

export function supabaseApiHeaders(key, extra = {}) {
  const type = detectSupabaseCredentialType(key);
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    ...extra
  };

  // New sb_secret_ keys are opaque, not JWTs: send them on apikey only.
  // Legacy service_role keys are JWTs and need the Authorization header too.
  if (type === "legacy-service-role") {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}
