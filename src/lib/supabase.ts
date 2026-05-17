import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing env vars. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required."
  );
  throw new Error("Supabase env vars missing. Check Vercel project env config.");
}

// PIN-auth design (17/05/2026 fix):
// We do NOT use Supabase's email/password Auth session storage. The PIN
// login edge function returns a JWT minted via the magic-link OTP flow,
// and `supabase.auth.setSession()` was hanging for 10s+ trying to verify
// it against /auth/v1/user. Instead we manage the JWT ourselves:
//   - Store in localStorage under `piccolo:jwt`.
//   - Inject it as the Authorization header on every PostgREST + Edge Fn
//     call via a custom fetch wrapper.
//   - Skip Supabase's auth state machine entirely.
// This means: no refresh-token rotation built-in. If the JWT expires
// (default 1h), the user re-logs in. For an internal tool that's fine.

const JWT_STORAGE_KEY = "piccolo:jwt";
const REFRESH_STORAGE_KEY = "piccolo:refresh";

export const PinAuth = {
  getJwt(): string | null {
    try {
      return localStorage.getItem(JWT_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  setJwt(jwt: string, refresh?: string): void {
    try {
      localStorage.setItem(JWT_STORAGE_KEY, jwt);
      if (refresh) localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    } catch {
      // ignore
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(JWT_STORAGE_KEY);
      localStorage.removeItem(REFRESH_STORAGE_KEY);
      // Defensive: also clear legacy Supabase auth keys.
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
  parsePayload(jwt: string): {
    sub?: string;
    exp?: number;
    user_metadata?: { app_user_id?: string; display_name?: string };
  } | null {
    try {
      const parts = jwt.split(".");
      if (parts.length !== 3) return null;
      const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded =
        payloadB64 + "===".slice(0, (4 - (payloadB64.length % 4)) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  },
  isExpired(jwt: string): boolean {
    const p = PinAuth.parsePayload(jwt);
    if (!p?.exp) return true;
    return p.exp * 1000 < Date.now();
  },
};

// Custom fetch wrapper: attaches the PIN-auth JWT (when present) as the
// Authorization header for all supabase-js requests.
const pinAuthFetch: typeof fetch = (input, init = {}) => {
  const jwt = PinAuth.getJwt();
  const headers = new Headers(init.headers);
  if (jwt && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${jwt}`);
  }
  return fetch(input, { ...init, headers });
};

export const supabase = createClient<Database>(url, anon, {
  auth: {
    // Disable supabase-js's own auth state machine. We manage tokens.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: pinAuthFetch,
  },
});

export const PIN_LOGIN_URL = `${url}/functions/v1/pin-login`;
export const PIN_CHANGE_URL = `${url}/functions/v1/pin-change`;
