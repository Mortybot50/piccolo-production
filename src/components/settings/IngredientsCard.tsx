import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { useIngredients, useSuppliers, qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { centsToDollars } from "@/lib/format";

type IngredientRow = {
  id: string;
  code: string;
  name: string;
  supplier_id: string | null;
  pack_desc: string | null;
  cost_per_pack_cents: number | null;
  pack_qty: number | null;
  pack_unit: string | null;
  cost_per_unit_cents: number | null;
  last_cost_update_at: string | null;
};

function isStale(iso: string | null): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return Date.now() - t > 60 * 24 * 3600 * 1000; // 60 days
}

export function IngredientsCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();

  const update = useMutation({
    mutationFn: async (patch: Partial<IngredientRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const updateBody = {
        ...rest,
        last_cost_update_at:
          rest.cost_per_pack_cents !== undefined ? new Date().toISOString() : undefined,
      };
      const { error } = await supabase.from("ingredients").update(updateBody).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ingredients }),
  });

  const emptyCostCount = (data as unknown as IngredientRow[]).filter(
    (i) => i.cost_per_pack_cents == null
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingredients</CardTitle>
        <CardDescription>
          Empty-cost rows are highlighted — these block accurate COGS until filled.
          {emptyCostCount > 0 ? (
            <Badge variant="warn" className="ml-2">
              {emptyCostCount} missing
            </Badge>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {(data as unknown as IngredientRow[]).map((row) => (
          <IngredientRowEdit
            key={row.id}
            row={row}
            suppliers={suppliers as { id: string; code: string }[]}
            onSave={(patch) => {
              update
                .mutateAsync({ id: row.id, ...patch })
                .then(() => toast.success(`${row.name} saved`))
                .catch((e: Error) => toast.error(e.message));
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function IngredientRowEdit({
  row,
  suppliers,
  onSave,
}: {
  row: IngredientRow;
  suppliers: { id: string; code: string }[];
  onSave: (p: Partial<IngredientRow>) => void;
}) {
  const [supplier, setSupplier] = useState(row.supplier_id ?? "");
  const [packDesc, setPackDesc] = useState(row.pack_desc ?? "");
  const [costStr, setCostStr] = useState(
    row.cost_per_pack_cents == null ? "" : (row.cost_per_pack_cents / 100).toFixed(2)
  );
  const [packQty, setPackQty] = useState(row.pack_qty == null ? "" : String(row.pack_qty));
  const [packUnit, setPackUnit] = useState(row.pack_unit ?? "");

  const empty = row.cost_per_pack_cents == null;
  const stale = !empty && isStale(row.last_cost_update_at);

  return (
    <div
      className={
        "space-y-2 rounded-md border p-3 " +
        (empty ? "border-yellow-300 bg-yellow-50" : "border-[var(--color-border)] bg-white")
      }
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{row.name}</span>
        <span className="font-mono text-xs text-stone-500">{row.code}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div>
          <label className="text-xs text-stone-500">Supplier</label>
          <select
            className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">—</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-stone-500">Pack desc</label>
          <Input value={packDesc} onChange={(e) => setPackDesc(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-stone-500">$ /pack</label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">Pack qty</label>
          <Input
            type="number"
            inputMode="decimal"
            value={packQty}
            onChange={(e) => setPackQty(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">Unit</label>
          <Input value={packUnit} onChange={(e) => setPackUnit(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500">
          Cost/unit:{" "}
          {row.cost_per_unit_cents != null
            ? `${centsToDollars(row.cost_per_unit_cents)} per ${row.pack_unit}`
            : "—"}
          {empty ? (
            <Badge variant="warn" className="ml-2">
              empty
            </Badge>
          ) : stale ? (
            <Badge variant="warn" className="ml-2">
              stale &gt;60d
            </Badge>
          ) : null}
        </span>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              supplier_id: supplier || null,
              pack_desc: packDesc || null,
              cost_per_pack_cents: costStr ? Math.round(parseFloat(costStr) * 100) : null,
              pack_qty: packQty ? parseFloat(packQty) : null,
              pack_unit: packUnit || null,
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
