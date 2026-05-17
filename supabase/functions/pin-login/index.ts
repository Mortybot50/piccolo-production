// Piccolo Production — pin-login Edge Function
// Verifies a PIN against the `users` table and mints a Supabase session
// (using the GoTrue admin API on the service-role key, since PIN-only flows
// don't go through the standard email/password path).
//
// Rate-limit: best-effort 10 req/min per source IP, in-memory.
// Lockout: 5 failed attempts -> 15 minute lock.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

// Simple in-memory IP bucket. Per-instance, best-effort.
const ipHits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function rateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - arr[0])) / 1000);
    ipHits.set(ip, arr);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  ipHits.set(ip, arr);
  return { ok: true, retryAfter: 0 };
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders, ...extraHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ reason: "Method not allowed" }, 405);
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const rl = rateLimit(ip);
  if (!rl.ok) {
    return json(
      { reason: "Too many attempts. Slow down.", retry_after_seconds: rl.retryAfter },
      429,
      { "retry-after": String(rl.retryAfter) }
    );
  }

  let body: { user_id?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return json({ reason: "Invalid JSON body" }, 400);
  }
  const { user_id, pin } = body;
  if (!user_id || typeof user_id !== "string" || !pin || typeof pin !== "string") {
    return json({ reason: "user_id and pin are required" }, 400);
  }
  if (!/^\d{4}$/.test(pin)) {
    return json({ reason: "PIN must be 4 digits" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch the user. Use a single SQL round-trip via RPC-style select.
  const { data: u, error: uErr } = await admin
    .from("users")
    .select("id, display_name, pin_hash, active, failed_attempts, locked_until, must_change_pin")
    .eq("id", user_id)
    .maybeSingle();

  if (uErr || !u) {
    return json({ reason: "Invalid credentials" }, 401);
  }
  if (!u.active) {
    return json({ reason: "Account inactive" }, 403);
  }
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    return json(
      { reason: "Account locked", locked_until: u.locked_until },
      401
    );
  }

  // bcrypt verify via Postgres `crypt()` — keeps the hash + verify in one place.
  const { data: matchData, error: matchErr } = await admin.rpc("verify_pin", {
    p_user_id: user_id,
    p_pin: pin,
  });

  if (matchErr) {
    console.error("verify_pin rpc error", matchErr);
    return json({ reason: "Server error" }, 500);
  }

  const matched = matchData === true;

  if (!matched) {
    const nextAttempts = (u.failed_attempts ?? 0) + 1;
    if (nextAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60_000).toISOString();
      await admin
        .from("users")
        .update({ failed_attempts: 0, locked_until: lockUntil })
        .eq("id", user_id);
      return json(
        { reason: "Account locked", locked_until: lockUntil },
        401
      );
    }
    await admin
      .from("users")
      .update({ failed_attempts: nextAttempts })
      .eq("id", user_id);
    return json(
      {
        reason: "Invalid credentials",
        attempts_left: 5 - nextAttempts,
      },
      401
    );
  }

  // PIN matched -> reset counters, set last_login.
  await admin
    .from("users")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString(),
    })
    .eq("id", user_id);

  // Mint a session via the auth admin API. We use the user's UUID as the
  // auth user id by creating-or-fetching a passwordless auth record.
  // Simplest path: create an auth user with email piccolo+<id>@local and
  // generate a magic link sign-in, then exchange. To avoid that round-trip,
  // we use `auth.admin.generateLink` with type "magiclink" and parse the
  // returned tokens.
  const fakeEmail = `pin+${user_id}@piccolo-production.local`;

  // Ensure auth user exists (idempotent).
  // List by email to find existing entry.
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let authUserId = existing?.users?.find((x) => x.email === fakeEmail)?.id;
  if (!authUserId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: fakeEmail,
      email_confirm: true,
      user_metadata: { display_name: u.display_name, app_user_id: u.id },
    });
    if (createErr || !created.user) {
      console.error("createUser failed", createErr);
      return json({ reason: "Failed to mint session" }, 500);
    }
    authUserId = created.user.id;
  }

  // Issue a session via generateLink + the recovery flow tokens.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: fakeEmail,
  });
  if (linkErr || !link.properties) {
    console.error("generateLink failed", linkErr);
    return json({ reason: "Failed to mint session" }, 500);
  }
  const hashed = link.properties.hashed_token;
  if (!hashed) {
    return json({ reason: "Failed to mint session" }, 500);
  }

  // Exchange the hashed magic-link token for a real session via verifyOtp.
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    token_hash: hashed,
    type: "magiclink",
  });
  if (vErr || !verified.session) {
    console.error("verifyOtp failed", vErr);
    return json({ reason: "Failed to mint session" }, 500);
  }

  return json({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    must_change_pin: u.must_change_pin,
    user: { id: u.id, display_name: u.display_name },
  });
});
