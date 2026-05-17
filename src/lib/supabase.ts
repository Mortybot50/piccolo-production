import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Logged before throw so the error overlay surfaces the real cause.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing env vars. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required."
  );
  throw new Error("Supabase env vars missing. Check Vercel project env config.");
}

export const supabase = createClient<Database>(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "sb-piccolo-prod-auth-token",
  },
});

export const PIN_LOGIN_URL = `${url}/functions/v1/pin-login`;
export const PIN_CHANGE_URL = `${url}/functions/v1/pin-change`;
