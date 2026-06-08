// /stocktake/:supplier — count + order combined for one supplier.
//
// Top section: walk the shelf, count each ingredient. Saves land in
// ingredient_stock_counts.
// Bottom section: recommended order qty per ingredient (auto-subtracts
// the count from the weekly need via the supplier_order_recommendation
// RPC), editable, send via SMS/email/copy text or save as placed.
//
// For thrice_weekly suppliers (DOM, MORABITO), there's a Mon/Wed/Fri
// quick-pick row that snaps the delivery date.

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
  useSuppliers,
  useIngredients,
  useLatestIngredientStockCounts,
  useUpsertIngredientStockCount,
  useSupplierOrderRecommendation,
} from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";
import { addDaysISO, fmtQty, todayISO } from "@/lib/format";
import { CountRow } from "@/components/stocktake/CountRow";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  schedule_jsonb: { kind?: string } | null;
}
interface IngRow {
  id: string;
  code: string;
  name: string;
  pack_unit: string | null;
  par_qty: number | null;
  supplier_id: string | null;
}

const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nextDateForWeekday(target: string): string {
  const today = new Date();
  const want = WEEKDAY_TO_DOW[target];
  if (want == null) return todayISO();
  let diff = want - today.getDay();
  if (diff < 0) diff += 7;
  return addDaysISO(todayISO(), diff);
}

export default function StocktakeSupplierPage() {
  const { supplier: code } = useParams<{ supplier: string }>();
  const today = todayISO();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: suppliers = [] } = useSuppliers();
  const supplier = useMemo(
    () =>
      (suppliers as SupplierRow[]).find(
        (s) => s.code.toLowerCase() === code?.toLowerCase(),
      ),
    [suppliers, code],
  );

  const { data: ingredients = [] } = useIngredients();
  const supplierIngredients = useMemo(() => {
    return (ingredients as IngRow[])
      .filter((i) => i.supplier_id === supplier?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, supplier?.id]);

  const { data: latest } = useLatestIngredientStockCounts();
  const upsertCount = useUpsertIngredientStockCount();

  const [deliveryDate, setDeliveryDate] = useState(
    addDaysISO(today, 1),
  );
  const [stage, setStage] = useState<"count" | "order">("count");

  const isTriceWeekly = supplier?.schedule_jsonb?.kind === "thrice_weekly";

  const recQ = useSupplierOrderRecommendation(supplier?.id ?? null, deliveryDate);
  const recByIng = useMemo(() => {
    const m = new Map<
      string,
      { weekly_need: number; recommended_qty: number; on_hand: number; calculation_note: string }
    >();
    for (const r of (recQ.data ?? []) as Array<{
      ingredient_id: string;
      weekly_need: number;
      recommended_qty: number;
      on_hand: number;
      calculation_note: string;
    }>) {
      m.set(r.ingredient_id, {
        weekly_need: Number(r.weekly_need ?? 0),
        recommended_qty: Number(r.recommended_qty ?? 0),
        on_hand: Number(r.on_hand ?? 0),
        calculation_note: r.calculation_note ?? "",
      });
    }
    return m;
  }, [recQ.data]);

  const [orderQty, setOrderQty] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const i of supplierIngredients) {
      const r = recByIng.get(i.id);
      next[i.id] = r ? r.recommended_qty.toFixed(2) : "0";
    }
    setOrderQty(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id, deliveryDate, recQ.data?.length]);

  async function saveCount(payload: {
    itemId: string;
    count_date: string;
    qty_on_hand: number;
    input_qty: number;
    input_unit: string;
    par_qty_snapshot: number | null;
  }) {
    try {
      await upsertCount.mutateAsync({
        ingredient_id: payload.itemId,
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

  const place = useMutation({
    mutationFn: async () => {
      if (!supplier) throw new Error("No supplier");
      const orderDate = todayISO();
      const { data: orderRow, error: orderErr } = await supabase
        .from("supplier_orders")
        .upsert(
          {
            supplier_id: supplier.id,
            order_date: orderDate,
            expected_delivery_date: deliveryDate,
            placed_by_user_id: user?.id ?? null,
            status: "placed",
          },
          { onConflict: "supplier_id,order_date" },
        )
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      const { error: delErr } = await supabase
        .from("supplier_order_lines")
        .delete()
        .eq("supplier_order_id", orderRow.id);
      if (delErr) throw delErr;
      const lines = supplierIngredients
        .map((i) => {
          const q = parseFloat(orderQty[i.id] ?? "0");
          return {
            supplier_order_id: orderRow.id,
            ingredient_id: i.id,
            qty: Number.isFinite(q) ? q : 0,
            qty_unit: i.pack_unit ?? "unit",
          };
        })
        .filter((l) => l.qty > 0);
      if (lines.length === 0) return;
      const { error: linesErr } = await supabase
        .from("supplier_order_lines")
        .insert(lines);
      if (linesErr) throw linesErr;
    },
    onSuccess: () => {
      toast.success("Order placed");
      qc.invalidateQueries({ queryKey: qk.supplierOrders });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orderText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Order for ${supplier?.name ?? ""}`);
    lines.push(`Delivery: ${deliveryDate}`);
    lines.push("");
    for (const i of supplierIngredients) {
      const q = parseFloat(orderQty[i.id] ?? "0");
      if (!(q > 0)) continue;
      lines.push(`- ${i.name}: ${fmtQty(q)} ${i.pack_unit ?? ""}`.trim());
    }
    lines.push("");
    lines.push("Thanks — Piccolo");
    return lines.join("\n");
  }, [supplier, deliveryDate, supplierIngredients, orderQty]);

  if (!supplier && suppliers.length > 0) {
    // Bad URL param → bounce to landing.
    return <Navigate to="/stocktake" replace />;
  }

  if (!supplier) {
    return (
      <AppShell title="Stocktake">
        <p className="text-sm text-[var(--color-fg-muted)]">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={supplier.name} subtitle={supplier.code} showBack>
      {/* Stage segmented control */}
      <Card className="mb-3">
        <CardContent className="py-3">
          <div className="flex gap-1 rounded-md bg-[var(--color-bg-subtle)] p-1">
            <button
              type="button"
              onClick={() => setStage("count")}
              className={
                stage === "count"
                  ? "flex-1 rounded bg-[var(--color-brand-600)] py-2 text-sm font-medium text-white"
                  : "flex-1 rounded py-2 text-sm font-medium text-[var(--color-fg-muted)]"
              }
            >
              1. Count
            </button>
            <button
              type="button"
              onClick={() => setStage("order")}
              className={
                stage === "order"
                  ? "flex-1 rounded bg-[var(--color-brand-600)] py-2 text-sm font-medium text-white"
                  : "flex-1 rounded py-2 text-sm font-medium text-[var(--color-fg-muted)]"
              }
            >
              2. Order
            </button>
          </div>
        </CardContent>
      </Card>

      {stage === "count" ? (
        <Card>
          <CardHeader>
            <CardTitle>Walk the {supplier.name} shelf</CardTitle>
            <CardDescription>
              Count each ingredient. The order page subtracts what's on hand
              from what's needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {supplierIngredients.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                No ingredients linked to this supplier yet.
              </p>
            ) : null}
            {supplierIngredients.map((i) => (
              <CountRow
                key={i.id}
                item={{
                  id: i.id,
                  name: i.name,
                  unit: i.pack_unit ?? "ea",
                  par_qty: i.par_qty,
                }}
                date={today}
                latest={latest?.get(i.id)}
                onSave={saveCount}
                saving={upsertCount.isPending}
              />
            ))}
            <div className="pt-2">
              <Button
                size="lg"
                className="w-full"
                onClick={() => setStage("order")}
              >
                Done counting → Review order
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-3">
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>
                Pick when this order will arrive. The recommended qty subtracts
                today's count from what production needs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="max-w-44"
              />
              {isTriceWeekly ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-[var(--color-fg-muted)]">
                    Jump to a delivery day
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(["Mon", "Wed", "Fri"] as const).map((d) => {
                      const next = nextDateForWeekday(d);
                      const active = deliveryDate === next;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDeliveryDate(next)}
                          className={
                            active
                              ? "rounded bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white"
                              : "rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-bg-subtle)]"
                          }
                        >
                          {d} ({next.slice(5)})
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mb-3">
            <CardHeader>
              <CardTitle>Suggested order</CardTitle>
              <CardDescription>
                Recommended = weekly need minus what you counted. Tweak any row
                before placing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {recQ.isLoading ? (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  Computing…
                </p>
              ) : null}
              {!recQ.isLoading && supplierIngredients.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  No ingredients for this supplier.
                </p>
              ) : null}
              {supplierIngredients.map((i) => {
                const r = recByIng.get(i.id);
                const recHasNeed = r && r.recommended_qty > 0;
                return (
                  <div
                    key={i.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="text-[11px] text-[var(--color-fg-soft)]">
                        on hand {fmtQty(r?.on_hand)} {i.pack_unit ?? ""} ·
                        weekly need {fmtQty(r?.weekly_need)}
                      </p>
                    </div>
                    <Input
                      inputMode="decimal"
                      className="h-9 w-20 text-center text-sm"
                      value={orderQty[i.id] ?? ""}
                      onChange={(e) =>
                        setOrderQty((q) => ({
                          ...q,
                          [i.id]: e.target.value.replace(/[^0-9.]/g, ""),
                        }))
                      }
                    />
                    <span className="text-xs text-[var(--color-fg-soft)]">
                      {i.pack_unit ?? "unit"}
                    </span>
                    {recHasNeed ? (
                      <Badge variant="warn" className="col-span-3 w-fit">
                        Suggested {r.recommended_qty.toFixed(2)} {i.pack_unit ?? ""}
                      </Badge>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="mb-3">
            <CardHeader>
              <CardTitle>Send + place</CardTitle>
              <CardDescription>
                Copy, text, or email the supplier, then save the order.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <pre className="max-h-44 overflow-auto rounded bg-[var(--color-bg-subtle)] p-2 text-xs">
                {orderText}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(orderText)
                      .then(() => toast.success("Copied"));
                  }}
                >
                  Copy text
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`sms:?body=${encodeURIComponent(orderText)}`}>SMS</a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(
                      `Piccolo order — delivery ${deliveryDate}`,
                    )}&body=${encodeURIComponent(orderText)}`}
                  >
                    Email
                  </a>
                </Button>
                <Button
                  size="sm"
                  disabled={place.isPending}
                  onClick={() => void place.mutateAsync()}
                >
                  {place.isPending ? "Saving…" : "Save as placed"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
