import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, PinAuth, PIN_LOGIN_URL, PIN_CHANGE_URL } from "@/lib/supabase";
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

async function fetchSelf(): Promise<PublicUser | null> {
  const jwt = PinAuth.getJwt();
  if (!jwt) return null;
  const payload = PinAuth.parsePayload(jwt);
  const appUserId = payload?.user_metadata?.app_user_id;
  if (!appUserId) {
    // eslint-disable-next-line no-console
    console.warn("[auth] fetchSelf: jwt missing app_user_id claim");
    return null;
  }
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name, must_change_pin")
    .eq("id", appUserId)
    .maybeSingle();
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
    (async () => {
      try {
        const jwt = PinAuth.getJwt();
        if (!jwt || PinAuth.isExpired(jwt)) {
          if (jwt) PinAuth.clear();
          if (!cancelled) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }
        const me = await fetchSelf();
        if (cancelled) return;
        setUser(me);
        if (!me) {
          // JWT present but DB says no such user — clear and bail.
          PinAuth.clear();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] boot error", err);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
    if (!body.access_token) {
      return { ok: false, reason: "Server returned no access token" };
    }
    PinAuth.setJwt(body.access_token, body.refresh_token);
    if (body.user) {
      setUser({
        id: body.user.id,
        display_name: body.user.display_name,
        must_change_pin: body.must_change_pin ?? false,
      });
    } else {
      const me = await fetchSelf();
      setUser(me);
    }
    return { ok: true };
  };

  const logout = async () => {
    PinAuth.clear();
    setUser(null);
  };

  const changePin = async (oldPin: string, newPin: string): Promise<LoginResult> => {
    const jwt = PinAuth.getJwt();
    if (!jwt) return { ok: false, reason: "Not authenticated" };
    const res = await fetch(PIN_CHANGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt}`,
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
