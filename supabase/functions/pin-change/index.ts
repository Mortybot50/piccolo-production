// Piccolo Production — pin-change Edge Function
// Authenticated: reads the JWT, finds the app user, verifies old PIN,
// stores a new bcrypt hash.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ reason: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ reason: "Missing bearer token" }, 401);
  }
  const token = authHeader.slice("Bearer ".length);

  let body: { old_pin?: string; new_pin?: string };
  try {
    body = await req.json();
  } catch {
    return json({ reason: "Invalid JSON body" }, 400);
  }
  const { old_pin, new_pin } = body;
  if (!old_pin || !new_pin || !/^\d{4}$/.test(old_pin) || !/^\d{4}$/.test(new_pin)) {
    return json({ reason: "Old and new PIN must each be 4 digits" }, 400);
  }
  if (old_pin === new_pin) {
    return json({ reason: "New PIN must differ from old PIN" }, 400);
  }

  // Resolve caller via JWT. The supabase-js auth client doesn't reliably pick
  // up the global.headers token for /auth/v1/user — hit the endpoint directly.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
  });
  if (!userRes.ok) {
    const txt = await userRes.text().catch(() => "");
    console.error("getUser failed", userRes.status, txt);
    return json({ reason: "Invalid session" }, 401);
  }
  const userRow = await userRes.json().catch(() => null) as
    | { user_metadata?: { app_user_id?: string } }
    | null;
  const appUserId = userRow?.user_metadata?.app_user_id;
  if (!appUserId) {
    return json({ reason: "Session missing app user link" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify old PIN.
  const { data: ok, error: vErr } = await admin.rpc("verify_pin", {
    p_user_id: appUserId,
    p_pin: old_pin,
  });
  if (vErr) {
    console.error("verify_pin rpc error", vErr);
    return json({ reason: "Server error" }, 500);
  }
  if (ok !== true) {
    return json({ reason: "Old PIN incorrect" }, 401);
  }

  // Update to new hash via RPC.
  const { error: updErr } = await admin.rpc("set_pin", {
    p_user_id: appUserId,
    p_pin: new_pin,
  });
  if (updErr) {
    console.error("set_pin rpc error", updErr);
    return json({ reason: "Server error" }, 500);
  }

  console.log(`[audit] pin changed for user ${appUserId} at ${new Date().toISOString()}`);
  return json({ ok: true });
});
