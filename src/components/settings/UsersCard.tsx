import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useUsersList, qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

export function UsersCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useUsersList();

  const updateActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("users").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });

  const resetPin = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      const { error } = await supabase.rpc("set_pin", { p_user_id: id, p_pin: pin });
      if (error) throw error;
      // Also flag must_change_pin = true so the user has to change it on next login.
      await supabase.from("users").update({ must_change_pin: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });

  const createUser = useMutation({
    mutationFn: async ({ name, pin }: { name: string; pin: string }) => {
      // Insert with a temporary placeholder pin_hash; we'll replace via set_pin RPC.
      const { data, error } = await supabase
        .from("users")
        .insert({
          display_name: name,
          pin_hash: "$2a$10$placeholder.placeholder.placeholder.placeholder.placeholder",
          must_change_pin: true,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: pinErr } = await supabase.rpc("set_pin", {
        p_user_id: data.id,
        p_pin: pin,
      });
      if (pinErr) throw pinErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          New users get a temporary PIN; they must change it on first login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NewUserForm
          onSubmit={(name, pin) =>
            createUser
              .mutateAsync({ name, pin })
              .then(() => toast.success(`Added ${name}`))
              .catch((e: Error) => toast.error(e.message))
          }
        />

        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {data.map((u) => (
          <UserRow
            key={u.id}
            row={u}
            onToggleActive={(active) =>
              updateActive
                .mutateAsync({ id: u.id, active })
                .then(() => toast.success("Saved"))
                .catch((e: Error) => toast.error(e.message))
            }
            onResetPin={(pin) =>
              resetPin
                .mutateAsync({ id: u.id, pin })
                .then(() => toast.success(`PIN reset — must change on next login`))
                .catch((e: Error) => toast.error(e.message))
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

function NewUserForm({
  onSubmit,
}: {
  onSubmit: (name: string, pin: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const valid = name.trim().length >= 2 && /^[0-9]{4}$/.test(pin);
  return (
    <div className="space-y-2 rounded-md border border-dashed border-stone-300 p-3">
      <Label>Add user</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_auto]">
        <Input
          placeholder="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="4-digit PIN"
          value={pin}
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]{4}"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
        <Button
          disabled={!valid}
          onClick={() => {
            void onSubmit(name.trim(), pin).then(() => {
              setName("");
              setPin("");
            });
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

interface UserRowData {
  id: string;
  display_name: string;
  active: boolean;
  must_change_pin: boolean;
  last_login: string | null;
  locked_until: string | null;
}

function UserRow({
  row,
  onToggleActive,
  onResetPin,
}: {
  row: UserRowData;
  onToggleActive: (active: boolean) => Promise<unknown>;
  onResetPin: (pin: string) => Promise<unknown>;
}) {
  const [newPin, setNewPin] = useState("");
  const locked =
    row.locked_until != null && new Date(row.locked_until).getTime() > Date.now();
  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{row.display_name}</span>
          {!row.active ? (
            <Badge variant="secondary" className="ml-2">
              Deactivated
            </Badge>
          ) : null}
          {row.must_change_pin ? (
            <Badge variant="warn" className="ml-2">
              Must change PIN
            </Badge>
          ) : null}
          {locked ? (
            <Badge variant="bad" className="ml-2">
              Locked
            </Badge>
          ) : null}
        </div>
        <Button
          variant={row.active ? "outline" : "default"}
          size="sm"
          onClick={() => void onToggleActive(!row.active)}
        >
          {row.active ? "Deactivate" : "Activate"}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">Reset PIN to (4 digits)</Label>
          <Input
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!/^[0-9]{4}$/.test(newPin)}
          onClick={() => {
            void onResetPin(newPin).then(() => setNewPin(""));
          }}
        >
          Reset
        </Button>
      </div>
      {row.last_login ? (
        <p className="text-xs text-stone-500">
          Last login: {new Date(row.last_login).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
