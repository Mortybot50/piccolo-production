// /store-order/:store — café manager order flow.
// Uses store_order_recommendation(store_id, for_date) to forecast tomorrow's pull.
// Submit creates store_orders + store_order_lines.

import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  qk,
  useStores,
  usePrepItems,
  useStoreOrderRecommendation,
} from "@/lib/queries";
import { fmtQty, addDaysISO, todayISO } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";

interface PrepItemLite {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
}

export default function StoreOrderPage() {
  const { store } = useParams<{ store: string }>();
  const code = (store ?? "HAW").toUpperCase();
  if (code !== "HAW" && code !== "SY") return <Navigate to="/store-order/HAW" replace />;

  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: stores = [] } = useStores();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);

  const storeRow = stores.find((s) => s.code === code);
  const storeId = storeRow?.id ?? null;

  const [forDate, setForDate] = useState(addDaysISO(todayISO(), 1));

  const { data: rec = [], isLoading } = useStoreOrderRecommendation(storeId, forDate);

  const recByItem = new Map<
    string,
    { forecast: number; with_buffer: number; on_hand: number; recommended_qty: number }
  >();
  for (const r of rec as Array<{
    prep_item_id: string;
    forecast: number;
    with_buffer: number;
    on_hand: number;
    recommended_qty: number;
  }>) {
    recByItem.set(r.prep_item_id, {
      forecast: Number(r.forecast ?? 0),
      with_buffer: Number(r.with_buffer ?? 0),
      on_hand: Number(r.on_hand ?? 0),
      recommended_qty: Number(r.recommended_qty ?? 0),
    });
  }

  // Local edits keyed by prep_item_id.
  const [qtys, setQtys] = useState<Record<string, string>>({});
  useEffect(() => {
    // Pre-fill once when the recommendation arrives or store/date changes.
    const next: Record<string, string> = {};
    for (const p of prepItems) {
      const r = recByItem.get(p.id);
      next[p.id] = r ? r.recommended_qty.toFixed(2) : "0";
    }
    setQtys(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, forDate, rec.length]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Store not loaded");
      // Upsert the order (one per store + for_date).
      const { data: orderRow, error: orderErr } = await supabase
        .from("store_orders")
        .upsert(
          {
            store_id: storeId,
            for_date: forDate,
            placed_by_user_id: user?.id ?? null,
            status: "placed",
          },
          { onConflict: "store_id,for_date" }
        )
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      // Clear existing lines and re-insert non-zero qtys.
      const { error: delErr } = await supabase
        .from("store_order_lines")
        .delete()
        .eq("store_order_id", orderRow.id);
      if (delErr) throw delErr;
      const lines = prepItems
        .map((p) => {
          const q = parseFloat(qtys[p.id] ?? "0");
          const onHand = recByItem.get(p.id)?.on_hand ?? null;
          return {
            store_order_id: orderRow.id,
            prep_item_id: p.id,
            qty_ordered: isFinite(q) ? q : 0,
            qty_on_hand_at_order: onHand,
          };
        })
        .filter((l) => l.qty_ordered > 0);
      if (lines.length === 0) return;
      const { error: linesErr } = await supabase.from("store_order_lines").insert(lines);
      if (linesErr) throw linesErr;
    },
    onSuccess: () => {
      toast.success(`Order placed for ${code} (${forDate})`);
      qc.invalidateQueries({ queryKey: qk.storeOrders });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalLines = useMemo(
    () =>
      Object.values(qtys).filter((v) => {
        const n = parseFloat(v);
        return isFinite(n) && n > 0;
      }).length,
    [qtys]
  );

  return (
    <AppShell title={`Store order — ${code}`}>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            <span className="mr-2">{code}</span>
            <Badge variant="outline">{storeRow?.name ?? "—"}</Badge>
          </CardTitle>
          <CardDescription>
            Pulling for service on the date below. Recommended = forecast × buffer − on hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-stone-500">For date</label>
              <Input
                type="date"
                value={forDate}
                onChange={(e) => setForDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-stone-500">
                {totalLines} line{totalLines === 1 ? "" : "s"}
              </span>
              <Button
                size="sm"
                disabled={!storeId || submit.isPending}
                onClick={() => void submit.mutateAsync()}
              >
                {submit.isPending ? "Placing…" : "Place order"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>Override the recommended qty if you know better.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {prepItems.map((p) => {
            const r = recByItem.get(p.id);
            return (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0"
              >
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="font-mono text-[11px] text-stone-500">
                    on hand {fmtQty(r?.on_hand)} {p.unit} · forecast {fmtQty(r?.forecast)}
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-stone-500">
                  rec {fmtQty(r?.recommended_qty)} {p.unit}
                </div>
                <Input
                  inputMode="decimal"
                  className="h-9 w-20 text-center text-sm"
                  value={qtys[p.id] ?? ""}
                  onChange={(e) =>
                    setQtys((q) => ({
                      ...q,
                      [p.id]: e.target.value.replace(/[^0-9.]/g, ""),
                    }))
                  }
                />
                <span className="text-xs text-stone-500">{p.unit}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}
