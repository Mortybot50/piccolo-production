import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  usePrepItems,
  useTransferPriceHistory,
  useCloseAndInsertHistory,
  qk,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { centsToDollars } from "@/lib/format";

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
  onSave,
}: {
  row: PrepItemRow;
  onSave: (p: Partial<PrepItemRow>) => void;
}) {
  const [portion, setPortion] = useState(String(row.portion_g));
  const [shelf, setShelf] = useState(String(row.shelf_life_days));
  const [batch, setBatch] = useState(row.batch_size == null ? "" : String(row.batch_size));
  const [price, setPrice] = useState(
    row.transfer_price_cents == null ? "" : (row.transfer_price_cents / 100).toFixed(2)
  );
  const [showHistory, setShowHistory] = useState(false);
  const closeAndInsert = useCloseAndInsertHistory();

  const onSavePrice = async () => {
    const cents = price ? Math.round(parseFloat(price) * 100) : null;
    if (cents == null) {
      // No history change — just patch the prep_items row.
      onSave({ transfer_price_cents: null });
      return;
    }
    if (cents === row.transfer_price_cents) {
      // No effective change — save the other fields only.
      onSave({
        portion_g: parseFloat(portion),
        shelf_life_days: parseInt(shelf, 10),
        batch_size: batch ? parseFloat(batch) : null,
      });
      return;
    }
    try {
      await closeAndInsert.mutateAsync({
        kind: "transfer",
        prepItemId: row.id,
        newPriceCents: cents,
      });
      onSave({
        portion_g: parseFloat(portion),
        shelf_life_days: parseInt(shelf, 10),
        batch_size: batch ? parseFloat(batch) : null,
        transfer_price_cents: cents,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <span className="font-mono text-xs text-stone-500">({row.unit})</span>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          Transfer {row.transfer_price_cents == null ? "—" : centsToDollars(row.transfer_price_cents)} / {row.unit}
        </Badge>
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={closeAndInsert.isPending} onClick={() => void onSavePrice()}>
          {closeAndInsert.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Hide history" : "View history"}
        </Button>
      </div>
      {showHistory ? <TransferPriceHistoryList prepItemId={row.id} /> : null}
    </div>
  );
}

function TransferPriceHistoryList({ prepItemId }: { prepItemId: string }) {
  const { data: rows = [], isLoading } = useTransferPriceHistory(prepItemId);
  const list = rows as Array<{
    id: string;
    price_cents: number;
    effective_from: string;
    effective_to: string | null;
  }>;
  if (isLoading) return <p className="text-xs text-stone-500">Loading history…</p>;
  if (list.length === 0) {
    return <p className="text-xs text-stone-500">No history rows yet.</p>;
  }
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-2 text-xs">
      <div className="mb-1 font-medium text-stone-700">Transfer price history</div>
      <ul className="space-y-0.5">
        {list.map((h) => (
          <li key={h.id} className="flex justify-between font-mono">
            <span>
              {h.effective_from} → {h.effective_to ?? "open"}
            </span>
            <span>{centsToDollars(h.price_cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
