// /supplier-orders — pick supplier + delivery date, see recommended qtys,
// edit + place order. Compose text body suitable for SMS/email export.

import { useEffect, useMemo, useState } from "react";
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
  useSupplierOrderRecommendation,
} from "@/lib/queries";
import { fmtQty, addDaysISO, todayISO } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  schedule_jsonb: { kind?: string } | null;
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

// Given a target weekday, find the next ISO date (>= today) that lands on it.
function nextDateForWeekday(target: string): string {
  const now = new Date();
  const today = now.getDay();
  const want = WEEKDAY_TO_DOW[target];
  if (want == null) return todayISO();
  let diff = want - today;
  if (diff < 0) diff += 7;
  return addDaysISO(todayISO(), diff);
}
interface IngredientRow {
  id: string;
  code: string;
  name: string;
  pack_unit: string | null;
  pack_qty: number | null;
  supplier_id: string | null;
}

export default function SupplierOrdersPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: suppliers = [] } = useSuppliers();
  const { data: ingredients = [] } = useIngredients();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  useEffect(() => {
    if (!supplierId && suppliers.length > 0) setSupplierId(suppliers[0].id);
  }, [suppliers, supplierId]);

  const [deliveryDate, setDeliveryDate] = useState(addDaysISO(todayISO(), 1));
  const { data: rec = [], isLoading } = useSupplierOrderRecommendation(
    supplierId,
    deliveryDate
  );

  const recByIng = new Map<
    string,
    { weekly_need: number; recommended_qty: number; calculation_note: string }
  >();
  for (const r of rec as Array<{
    ingredient_id: string;
    weekly_need: number;
    recommended_qty: number;
    calculation_note: string;
  }>) {
    recByIng.set(r.ingredient_id, {
      weekly_need: Number(r.weekly_need ?? 0),
      recommended_qty: Number(r.recommended_qty ?? 0),
      calculation_note: r.calculation_note,
    });
  }

  const supplier = (suppliers as SupplierRow[]).find((s) => s.id === supplierId);
  const supplierIngredients = (ingredients as unknown as IngredientRow[]).filter(
    (i) => i.supplier_id === supplierId
  );

  // Filter for the visible note (e.g. garlic excluded) — only show rows the RPC
  // actually returned, so the garlic clause naturally drops fresh garlic on non-Mon.
  const visibleIngredients = supplierIngredients.filter((i) => recByIng.has(i.id));

  const [qtys, setQtys] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const i of visibleIngredients) {
      const r = recByIng.get(i.id);
      next[i.id] = r ? r.recommended_qty.toFixed(2) : "0";
    }
    setQtys(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, deliveryDate, rec.length]);

  const place = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Pick a supplier");
      const orderDate = todayISO();
      const { data: orderRow, error: orderErr } = await supabase
        .from("supplier_orders")
        .upsert(
          {
            supplier_id: supplierId,
            order_date: orderDate,
            expected_delivery_date: deliveryDate,
            placed_by_user_id: user?.id ?? null,
            status: "placed",
          },
          { onConflict: "supplier_id,order_date" }
        )
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      const { error: delErr } = await supabase
        .from("supplier_order_lines")
        .delete()
        .eq("supplier_order_id", orderRow.id);
      if (delErr) throw delErr;
      const lines = visibleIngredients
        .map((i) => {
          const q = parseFloat(qtys[i.id] ?? "0");
          return {
            supplier_order_id: orderRow.id,
            ingredient_id: i.id,
            qty: isFinite(q) ? q : 0,
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
      toast.success("Supplier order placed");
      qc.invalidateQueries({ queryKey: qk.supplierOrders });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const note = useMemo(() => {
    // First non-empty note from the RPC.
    for (const r of recByIng.values()) {
      if (r.calculation_note) return r.calculation_note;
    }
    return "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.length]);

  const orderText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Order for ${supplier?.name ?? supplier?.code ?? ""}`);
    lines.push(`Delivery: ${deliveryDate}`);
    lines.push("");
    for (const i of visibleIngredients) {
      const q = parseFloat(qtys[i.id] ?? "0");
      if (!(q > 0)) continue;
      lines.push(`- ${i.name}: ${fmtQty(q)} ${i.pack_unit ?? ""}`.trim());
    }
    lines.push("");
    lines.push("Thanks — Piccolo");
    return lines.join("\n");
  }, [supplier, deliveryDate, visibleIngredients, qtys]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(
      `Piccolo order — delivery ${deliveryDate}`
    );
    const body = encodeURIComponent(orderText);
    return `mailto:?subject=${subject}&body=${body}`;
  }, [deliveryDate, orderText]);

  const sms = useMemo(() => {
    return `sms:?body=${encodeURIComponent(orderText)}`;
  }, [orderText]);

  return (
    <AppShell title="Supplier orders">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Supplier + delivery</CardTitle>
          <CardDescription>
            Recommended uses the supplier's schedule (daily / thrice-weekly / weekly).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-stone-500">Supplier</label>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
                value={supplierId ?? ""}
                onChange={(e) => setSupplierId(e.target.value || null)}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500">Delivery date</label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Badge variant="outline">{note || "—"}</Badge>
            </div>
          </div>
          {supplier?.schedule_jsonb?.kind === "thrice_weekly" ? (
            <div className="mt-3">
              <p className="mb-1 text-xs text-stone-500">
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
                          : "rounded border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                      }
                    >
                      {d} delivery
                      <span className="ml-1 text-[10px] opacity-70">
                        ({next.slice(5)})
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">
                Each day applies the per-ingredient split rule (Settings → Supplier
                schedule).
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>Recommended qty pre-filled in pack units.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {visibleIngredients.length === 0 && !isLoading ? (
            <p className="text-sm text-stone-500">
              Nothing recommended for this supplier on {deliveryDate}.
            </p>
          ) : null}
          {visibleIngredients.map((i) => {
            const r = recByIng.get(i.id);
            return (
              <div
                key={i.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0"
              >
                <div>
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="font-mono text-[11px] text-stone-500">
                    weekly need {fmtQty(r?.weekly_need)} {i.pack_unit ?? ""}
                  </div>
                </div>
                <Input
                  inputMode="decimal"
                  className="h-9 w-20 text-center text-sm"
                  value={qtys[i.id] ?? ""}
                  onChange={(e) =>
                    setQtys((q) => ({
                      ...q,
                      [i.id]: e.target.value.replace(/[^0-9.]/g, ""),
                    }))
                  }
                />
                <span className="text-xs text-stone-500">{i.pack_unit ?? "unit"}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Send + place</CardTitle>
          <CardDescription>Copy, text, or email the supplier — then save the order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-xs text-stone-700">
            {orderText}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              Copy text
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={sms}>SMS</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={mailto}>Email</a>
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
    </AppShell>
  );
}
