import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useSuppliers, qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  schedule_jsonb: unknown;
}

export function SuppliersCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useSuppliers();

  const update = useMutation({
    mutationFn: async (patch: { id: string; name: string }) => {
      const { error } = await supabase
        .from("suppliers")
        .update({ name: patch.name })
        .eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.suppliers }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suppliers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {data.map((s) => (
          <SupplierItem
            key={s.id}
            row={s as SupplierRow}
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

function SupplierItem({
  row,
  onSave,
}: {
  row: SupplierRow;
  onSave: (p: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(row.name);
  const schedule = row.schedule_jsonb as Record<string, unknown> | null;
  const kind = (schedule?.kind as string) ?? "as_needed";
  const dirty = name !== row.name;
  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-stone-500">{row.code}</span>
        <Badge variant="outline">{kind}</Badge>
      </div>
      <div className="flex items-end gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => onSave({ id: row.id, name })}
        >
          Save
        </Button>
      </div>
      <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-[10px] text-stone-600">
        {JSON.stringify(schedule, null, 2)}
      </pre>
    </div>
  );
}
