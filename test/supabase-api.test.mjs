import test from "node:test";
import assert from "node:assert/strict";
import { detectSupabaseCredentialType, supabaseApiHeaders } from "../scripts/supabase-api.mjs";

function legacyJwt(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return "eyJhbGciOiJIUzI1NiJ9." + payload + ".signature";
}

test("new Supabase secret keys use apikey only", () => {
  const key = "sb_secret_test_value";
  assert.equal(detectSupabaseCredentialType(key), "new-secret");
  const headers = supabaseApiHeaders(key);
  assert.equal(headers.apikey, key);
  assert.equal(headers.Authorization, undefined);
});

test("legacy service_role JWT keys use apikey and Authorization", () => {
  const key = legacyJwt("service_role");
  assert.equal(detectSupabaseCredentialType(key), "legacy-service-role");
  const headers = supabaseApiHeaders(key);
  assert.equal(headers.apikey, key);
  assert.equal(headers.Authorization, "Bearer " + key);
});

test("rejects publishable keys", () => {
  assert.throws(() => detectSupabaseCredentialType("sb_publishable_example"), /publishable key/);
});

test("rejects legacy anon JWT keys", () => {
  assert.throws(() => detectSupabaseCredentialType(legacyJwt("anon")), /service_role claim/);
});

test("rejects malformed credentials", () => {
  assert.throws(() => detectSupabaseCredentialType("not-a-supabase-key"), /sb_secret_|service_role/);
});
