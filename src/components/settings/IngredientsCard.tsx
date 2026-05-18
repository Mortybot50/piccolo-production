import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  useIngredients,
  useSuppliers,
  useCloseAndInsertHistory,
  useIngredientCostHistory,
  qk,
} from "@/lib/queries";
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

// Derive cost_per_unit (integer cents) from cost_per_pack + pack_qty.
// This MUST match the generated-column formula on ingredients
// (cost_per_pack_cents::numeric / pack_qty), then rounded to int for history.
function deriveUnitCostCents(packCents: number | null, packQty: number | null): number | null {
  if (packCents == null || packQty == null || packQty <= 0) return null;
  return Math.round(packCents / packQty);
}

export function IngredientsCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();

  // Non-cost fields go through this simple update mutation.
  const updateMeta = useMutation({
    mutationFn: async (patch: Partial<IngredientRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("ingredients").update(rest).eq("id", id);
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
          Cost edits close the open history row and insert a new one (effective
          today) so historic COGS stays accurate.
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
            onSaveMeta={async (patch) => {
              await updateMeta.mutateAsync({ id: row.id, ...patch });
              toast.success(`${row.name} saved`);
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
  onSaveMeta,
}: {
  row: IngredientRow;
  suppliers: { id: string; code: string }[];
  onSaveMeta: (p: Partial<IngredientRow>) => Promise<void>;
}) {
  const [supplier, setSupplier] = useState(row.supplier_id ?? "");
  const [packDesc, setPackDesc] = useState(row.pack_desc ?? "");
  const [costStr, setCostStr] = useState(
    row.cost_per_pack_cents == null ? "" : (row.cost_per_pack_cents / 100).toFixed(2)
  );
  const [packQty, setPackQty] = useState(row.pack_qty == null ? "" : String(row.pack_qty));
  const [packUnit, setPackUnit] = useState(row.pack_unit ?? "");
  const [showHistory, setShowHistory] = useState(false);

  const closeAndInsert = useCloseAndInsertHistory();

  const empty = row.cost_per_pack_cents == null;
  const stale = !empty && isStale(row.last_cost_update_at);

  const onSave = async () => {
    const newPackCents = costStr ? Math.round(parseFloat(costStr) * 100) : null;
    const newPackQty = packQty ? parseFloat(packQty) : null;

    // Persist the meta fields FIRST and await — the generated cost_per_unit_cents
    // column has to recompute before we write a history row, otherwise history
    // can drift ahead of the ingredient row if the meta update fails or is slow.
    try {
      await onSaveMeta({
        supplier_id: supplier || null,
        pack_desc: packDesc || null,
        cost_per_pack_cents: newPackCents,
        pack_qty: newPackQty,
        pack_unit: packUnit || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }

    // Cost-history side-effect: only if we have a complete cost-per-unit signal.
    const newUnitCents = deriveUnitCostCents(newPackCents, newPackQty);
    const oldUnitCents = row.cost_per_unit_cents == null ? null : Math.round(row.cost_per_unit_cents);
    if (newUnitCents != null && newUnitCents !== oldUnitCents) {
      try {
        await closeAndInsert.mutateAsync({
          kind: "ingredient",
          ingredientId: row.id,
          newCostPerUnitCents: newUnitCents,
        });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  };

  return (
    <div
      className={
        "space-y-2 rounded-md border p-3 " +
        (empty
          ? "border-yellow-300 bg-yellow-50"
          : "border-[var(--color-border)] bg-white")
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-stone-500">
          Cost/unit:{" "}
          {row.cost_per_unit_cents != null
            ? `${centsToDollars(Math.round(row.cost_per_unit_cents))} per ${row.pack_unit}`
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? "Hide history" : "View history"}
          </Button>
          <Button
            size="sm"
            disabled={closeAndInsert.isPending}
            onClick={() => void onSave()}
          >
            {closeAndInsert.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {showHistory ? <IngredientCostHistoryList ingredientId={row.id} /> : null}
    </div>
  );
}

function IngredientCostHistoryList({ ingredientId }: { ingredientId: string }) {
  const { data: rows = [], isLoading } = useIngredientCostHistory(ingredientId);
  const list = rows as Array<{
    id: string;
    cost_per_unit_cents: number;
    effective_from: string;
    effective_to: string | null;
  }>;
  if (isLoading) return <p className="text-xs text-stone-500">Loading history…</p>;
  if (list.length === 0) {
    return <p className="text-xs text-stone-500">No history rows yet.</p>;
  }
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-2 text-xs">
      <div className="mb-1 font-medium text-stone-700">Cost history</div>
      <ul className="space-y-0.5">
        {list.map((h) => (
          <li key={h.id} className="flex justify-between font-mono">
            <span>
              {h.effective_from} → {h.effective_to ?? "open"}
            </span>
            <span>{centsToDollars(Math.round(h.cost_per_unit_cents))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
