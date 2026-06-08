// /stocktake/prep — count in-house prep items (cotoletta, salsa verde,
// pickled onions, etc.). No "place order" step here — production makes
// these themselves, they're not ordered from suppliers.

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePrepItems,
  useLatestStockCountsByPrepItem,
  useUpsertStockCount,
} from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { CountRow } from "@/components/stocktake/CountRow";

interface PrepRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  par_qty: number | null;
  active?: boolean;
}

export default function StocktakePrepPage() {
  const today = todayISO();
  const { user } = useAuth();
  const [date, setDate] = useState(today);

  const { data: prepItems = [] } = usePrepItems();
  const { data: latest } = useLatestStockCountsByPrepItem();
  const upsert = useUpsertStockCount();

  const items = useMemo(() => {
    const active = (prepItems as PrepRow[]).filter((p) => p.active !== false);
    return active.sort((a, b) => a.name.localeCompare(b.name));
  }, [prepItems]);

  async function save(payload: {
    itemId: string;
    count_date: string;
    qty_on_hand: number;
    input_qty: number;
    input_unit: string;
    par_qty_snapshot: number | null;
  }) {
    try {
      await upsert.mutateAsync({
        prep_item_id: payload.itemId,
        count_date: payload.count_date,
        qty_on_hand: payload.qty_on_hand,
        input_qty: payload.input_qty,
        input_unit: payload.input_unit,
        par_qty_snapshot: payload.par_qty_snapshot,
        counted_by_user_id: user?.id ?? null,
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
      throw e;
    }
  }

  return (
    <AppShell title="In-house prep" subtitle="Count what production has on hand">
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Counting for</CardTitle>
          <CardDescription>
            Defaults to today. Change the date to backfill.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-44"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Walk the coolroom</CardTitle>
          <CardDescription>
            Per row: type the qty, pick the unit, tap Save. Below-par rows
            are flagged red.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--color-fg-muted)]">
              No active prep items configured.
            </p>
          ) : null}
          {items.map((p) => (
            <CountRow
              key={p.id}
              item={{
                id: p.id,
                name: p.name,
                unit: p.unit,
                par_qty: p.par_qty,
              }}
              date={date}
              latest={latest?.get(p.id)}
              onSave={save}
              saving={upsert.isPending}
            />
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
