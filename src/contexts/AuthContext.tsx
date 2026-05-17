import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, PIN_LOGIN_URL, PIN_CHANGE_URL } from "@/lib/supabase";
import type { PublicUser } from "@/types/app";

interface LoginOk {
  ok: true;
}
interface LoginFail {
  ok: false;
  reason: string;
  locked_until?: string;
  retry_after_seconds?: number;
}
type LoginResult = LoginOk | LoginFail;

interface AuthCtx {
  user: PublicUser | null;
  isLoading: boolean;
  login: (userId: string, pin: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  changePin: (oldPin: string, newPin: string) => Promise<LoginResult>;
}

const Ctx = createContext<AuthCtx | null>(null);

const AUTH_STORAGE_KEY = "sb-piccolo-prod-auth-token";

function clearAuthStorage() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    // Defensive: also clear any sb-* keys that might be left over.
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

async function fetchSelf(): Promise<PublicUser | null> {
  // Read app_user_id from the JWT user_metadata (set by pin-login edge fn).
  // Falls back to first row when only one user exists (Phase A seed state).
  const { data: sessData } = await supabase.auth.getSession();
  const appUserId = sessData.session?.user.user_metadata?.app_user_id as
    | string
    | undefined;
  let query = supabase.from("users").select("id, display_name, must_change_pin");
  if (appUserId) query = query.eq("id", appUserId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[auth] fetchSelf error", error);
    return null;
  }
  return data ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let booted = false; // flips true once we know the session state

    // Non-destructive boot guard: if getSession() hasn't returned in 5s,
    // just mark loading=false and let onAuthStateChange catch up later.
    // DO NOT clear storage here — that races with a concurrent login()
    // call and wipes the token we just minted (real bug seen 17/05/2026).
    const bootGuard = setTimeout(() => {
      if (cancelled || booted) return;
      // eslint-disable-next-line no-console
      console.warn("[auth] getSession slow (>5s). Continuing; auth events will catch up.");
      setIsLoading(false);
    }, 5000);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        booted = true;
        clearTimeout(bootGuard);
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[auth] getSession error", error);
          // Defensive clear only if the stored token is actively bad.
          clearAuthStorage();
          setUser(null);
        } else if (!data.session) {
          setUser(null);
        } else {
          const me = await fetchSelf();
          setUser(me);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] boot error", err);
        setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (cancelled) return;
      if (!session) {
        setUser(null);
      } else {
        const me = await fetchSelf();
        setUser(me);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(bootGuard);
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = async (userId: string, pin: string): Promise<LoginResult> => {
    const res = await fetch(PIN_LOGIN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ user_id: userId, pin }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        reason: body.reason ?? `Login failed (${res.status})`,
        locked_until: body.locked_until,
        retry_after_seconds: body.retry_after_seconds,
      };
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      must_change_pin?: boolean;
      user?: { id: string; display_name: string };
    };
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    if (error) {
      return { ok: false, reason: `Session error: ${error.message}` };
    }
    // Set user state from the edge function's response — don't call
    // fetchSelf here because the onAuthStateChange listener will ALSO
    // call fetchSelf for the same setSession event, causing a duplicate
    // round-trip and (under iOS Safari) a race / hang. The listener wins.
    if (body.user) {
      setUser({
        id: body.user.id,
        display_name: body.user.display_name,
        must_change_pin: body.must_change_pin ?? false,
      });
    }
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clearAuthStorage();
    setUser(null);
  };

  const changePin = async (oldPin: string, newPin: string): Promise<LoginResult> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { ok: false, reason: "Not authenticated" };
    const res = await fetch(PIN_CHANGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ old_pin: oldPin, new_pin: newPin }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: body.reason ?? `Change PIN failed (${res.status})` };
    }
    const me = await fetchSelf();
    setUser(me);
    return { ok: true };
  };

  const value = useMemo(
    () => ({ user, isLoading, login, logout, changePin }),
    [user, isLoading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
