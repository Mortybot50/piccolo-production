import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useStores, qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function StoresCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useStores();

  const update = useMutation({
    mutationFn: async (patch: { id: string; name: string; address: string | null }) => {
      const { error } = await supabase
        .from("stores")
        .update({ name: patch.name, address: patch.address })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stores }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {data.map((s) => (
          <StoreRow
            key={s.id}
            initial={{ id: s.id, code: s.code, name: s.name, address: s.address }}
            onSave={(patch) => {
              update
                .mutateAsync(patch)
                .then(() => toast.success(`${patch.name} saved`))
                .catch((e: Error) => toast.error(e.message));
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function StoreRow({
  initial,
  onSave,
}: {
  initial: { id: string; code: string; name: string; address: string | null };
  onSave: (p: { id: string; name: string; address: string | null }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address ?? "");
  const dirty = name !== initial.name || (initial.address ?? "") !== address;
  return (
    <div className="grid grid-cols-[64px_1fr_auto] items-end gap-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="font-mono text-sm text-stone-500">{initial.code}</div>
      <div className="space-y-1">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={!dirty}
        onClick={() => onSave({ id: initial.id, name, address: address || null })}
      >
        Save
      </Button>
    </div>
  );
}
