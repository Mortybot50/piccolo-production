import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PinPad } from "@/components/PinPad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import type { PublicUser } from "@/types/app";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // /login is anon. Direct SELECT on `users` is blocked by RLS
      // (authenticated-only). Use the SECURITY DEFINER RPC that returns
      // only id, display_name, must_change_pin for active users.
      const { data, error } = await supabase.rpc("list_active_users");
      if (cancelled) return;
      if (error || !data) {
        setUsers([]);
        return;
      }
      const rows = data as unknown as PublicUser[];
      setUsers(rows);
      if (rows.length === 1) setSelectedUserId(rows[0].id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const lockedSecsLeft = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil.getTime() - now) / 1000))
    : 0;
  const isLocked = lockedSecsLeft > 0;

  useEffect(() => {
    if (pin.length === 4 && selectedUserId && !busy && !isLocked) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submit() {
    if (!selectedUserId) {
      setErrorMsg("Pick a user first.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    const r = await login(selectedUserId, pin);
    setBusy(false);
    if (r.ok) {
      toast.success("Welcome");
      navigate("/today", { replace: true });
      return;
    }
    setPin("");
    if (r.locked_until) {
      setLockedUntil(new Date(r.locked_until));
      setErrorMsg(`Account locked. Try again in a few minutes.`);
    } else {
      setErrorMsg(r.reason);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--color-brand-600)]">
            Piccolo
          </p>
          <CardTitle className="font-display text-3xl">Piccolo Production</CardTitle>
          <CardDescription>Enter your PIN to continue</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {users.length > 1 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {users.map((u) => (
                <Button
                  key={u.id}
                  type="button"
                  variant={selectedUserId === u.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedUserId(u.id);
                    setPin("");
                    setErrorMsg(null);
                  }}
                >
                  {u.display_name}
                </Button>
              ))}
            </div>
          ) : users.length === 1 ? (
            <p className="text-center text-sm text-stone-500">
              Signed in as <span className="font-medium text-stone-800">{users[0].display_name}</span>
            </p>
          ) : (
            <p className="text-center text-sm text-stone-500">No active users yet.</p>
          )}

          <PinPad value={pin} onChange={setPin} disabled={busy || isLocked} />

          {isLocked ? (
            <p className="text-center text-sm font-medium text-[var(--color-bad)]">
              Locked for {lockedSecsLeft}s
            </p>
          ) : errorMsg ? (
            <p
              role="alert"
              className="text-center text-sm font-medium text-[var(--color-bad)]"
            >
              {errorMsg}
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            onClick={() => void submit()}
            disabled={busy || isLocked || pin.length !== 4 || !selectedUserId}
          >
            {busy ? "Checking…" : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
