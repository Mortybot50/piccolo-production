import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  usePrepItems,
  useProductionPnl,
  qk,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { centsToDollars, fmtQty, fmtPct } from "@/lib/format";

function thirtyDaysAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface PrepItemRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  portion_g: number;
  shelf_life_days: number;
  batch_size: number | null;
  batch_unit: string | null;
  frequency_label: string | null;
  transfer_price_cents: number | null;
  active: boolean;
}

export function PrepItemsCard() {
  const qc = useQueryClient();
  const { data = [], isLoading } = usePrepItems();
  const { data: pnl = [] } = useProductionPnl(thirtyDaysAgoISO(), todayISO());

  // Map prep_item_id → margin metrics for the loss-alert chip.
  const pnlByItem = new Map<string, { cogs: number; margin: number; pct: number | null }>();
  for (const row of pnl) {
    pnlByItem.set(row.prep_item_id, {
      cogs: Number(row.computed_cogs_per_unit_cents ?? 0),
      margin: Number(row.margin_per_unit_cents ?? 0),
      pct: row.margin_pct == null ? null : Number(row.margin_pct),
    });
  }

  const update = useMutation({
    mutationFn: async (patch: Partial<PrepItemRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("prep_items").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.prepItems }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prep items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {(data as PrepItemRow[]).map((row) => (
          <PrepItemRowEdit
            key={row.id}
            row={row}
            margin={pnlByItem.get(row.id)}
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

function PrepItemRowEdit({
  row,
  margin,
  onSave,
}: {
  row: PrepItemRow;
  margin?: { cogs: number; margin: number; pct: number | null };
  onSave: (p: Partial<PrepItemRow>) => void;
}) {
  const [portion, setPortion] = useState(String(row.portion_g));
  const [shelf, setShelf] = useState(String(row.shelf_life_days));
  const [batch, setBatch] = useState(row.batch_size == null ? "" : String(row.batch_size));
  const [price, setPrice] = useState(
    row.transfer_price_cents == null ? "" : (row.transfer_price_cents / 100).toFixed(2)
  );

  const isLoss = (margin?.margin ?? 1) < 0 && row.transfer_price_cents != null;
  const isLowMargin = !isLoss && margin?.pct != null && margin.pct < 0.05;

  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <span className="font-mono text-xs text-stone-500">({row.unit})</span>
        </div>
        {isLoss ? (
          <Badge variant="bad">LOSS — {centsToDollars(margin?.margin ?? 0)}/u</Badge>
        ) : isLowMargin ? (
          <Badge variant="warn">Low margin {fmtPct(margin?.pct)}</Badge>
        ) : margin?.pct != null ? (
          <Badge variant="ok">Margin {fmtPct(margin?.pct)}</Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="text-xs text-stone-500">Portion (g/pc)</label>
          <Input
            type="number"
            inputMode="decimal"
            value={portion}
            onChange={(e) => setPortion(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">Shelf life (d)</label>
          <Input
            type="number"
            inputMode="numeric"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">
            Batch size ({row.batch_unit ?? row.unit})
          </label>
          <Input
            type="number"
            inputMode="decimal"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">Transfer $ /u</label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      {margin?.cogs ? (
        <p className="text-xs text-stone-500">
          Computed COGS: {centsToDollars(margin.cogs)} per unit · qty produced last 30d:{" "}
          {fmtQty(margin?.cogs)}…
        </p>
      ) : null}
      <Button
        size="sm"
        onClick={() =>
          onSave({
            portion_g: parseFloat(portion),
            shelf_life_days: parseInt(shelf, 10),
            batch_size: batch ? parseFloat(batch) : null,
            transfer_price_cents: price ? Math.round(parseFloat(price) * 100) : null,
          })
        }
      >
        Save
      </Button>
    </div>
  );
}
