// /store-order/:store — café manager order flow (v2).
// Uses store_order_recommendation(store_id, for_date) returning the
// {calculated_qty, override_qty, effective_qty} triple. Inline override
// inputs persist per (store, for_date, prep_item_id) to store_order_overrides.
// Submit creates store_orders + store_order_lines from effective_qty.

import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
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
  useStoreOrderOverrides,
  useUpsertStoreOrderOverride,
} from "@/lib/queries";
import {
  fmtQty,
  addDaysISO,
  todayISO,
  weekdayOf,
  WEEKDAYS,
  type Weekday,
} from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";

interface PrepItemLite {
  id: string;
  code: string;
  name: string;
  unit: string;
  batch_size: number | null;
  batch_unit: string | null;
  active: boolean;
}

interface RecRow {
  prep_item_id: string;
  forecast: number;
  with_buffer: number;
  on_hand: number;
  calculated_qty: number;
  override_qty: number | null;
  effective_qty: number;
}

interface OverrideRow {
  prep_item_id: string;
  override_qty: number | null;
}

// `?day=tue` → resolves to the next-occurring ISO from today (today first).
// Defaults to tomorrow if no day param, since you order for "tomorrow's pull".
function isoForStoreOrderDay(dayParam: string | null): string {
  const today = todayISO();
  if (!dayParam) return addDaysISO(today, 1);
  const wanted = dayParam.toLowerCase();
  const map: Record<string, Weekday> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const target = map[wanted];
  if (!target) return addDaysISO(today, 1);
  for (let i = 0; i < 7; i++) {
    const candidate = addDaysISO(today, i);
    if (weekdayOf(candidate) === target) return candidate;
  }
  return addDaysISO(today, 1);
}

function paramFor(day: Weekday): string {
  return day.toLowerCase();
}

const MORNING_CODES = new Set([
  "COTOLETTA",
  "TOMATOES_CUT",
  "TOMATO_CUT",
  "TOMATOES",
]);

export default function StoreOrderPage() {
  const { store } = useParams<{ store: string }>();
  const code = (store ?? "HAW").toUpperCase();
  if (code !== "HAW" && code !== "SY")
    return <Navigate to="/store-order/HAW" replace />;

  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: stores = [] } = useStores();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);

  const storeRow = stores.find((s) => s.code === code);
  const storeId = storeRow?.id ?? null;

  const [searchParams, setSearchParams] = useSearchParams();
  const dayParam = searchParams.get("day");
  const forDate = isoForStoreOrderDay(dayParam);
  const activeWeekday = weekdayOf(forDate);

  const { data: recRaw = [], isLoading } = useStoreOrderRecommendation(
    storeId,
    forDate
  );
  const { data: overridesRaw = [] } = useStoreOrderOverrides(storeId, forDate);

  const rec = recRaw as RecRow[];
  const overrides = overridesRaw as OverrideRow[];

  const recByItem = useMemo(() => {
    const m = new Map<string, RecRow>();
    for (const r of rec) {
      m.set(r.prep_item_id, {
        ...r,
        forecast: Number(r.forecast ?? 0),
        with_buffer: Number(r.with_buffer ?? 0),
        on_hand: Number(r.on_hand ?? 0),
        calculated_qty: Number(r.calculated_qty ?? 0),
        override_qty:
          r.override_qty == null ? null : Number(r.override_qty),
        effective_qty: Number(r.effective_qty ?? 0),
      });
    }
    return m;
  }, [rec]);

  const overrideByItem = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const o of overrides) m.set(o.prep_item_id, o.override_qty);
    return m;
  }, [overrides]);

  // Split: morning (fresh-daily / cotoletta / tomatoes) vs batch.
  const morningItems = prepItems.filter(
    (p) => MORNING_CODES.has(p.code) || p.batch_size == null
  );
  const batchItems = prepItems.filter(
    (p) => !MORNING_CODES.has(p.code) && p.batch_size != null
  );

  const setDayParam = (day: Weekday) => {
    const next = new URLSearchParams(searchParams);
    next.set("day", paramFor(day));
    setSearchParams(next, { replace: true });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!storeId) throw new Error("Store not loaded");
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

      const { error: delErr } = await supabase
        .from("store_order_lines")
        .delete()
        .eq("store_order_id", orderRow.id);
      if (delErr) throw delErr;

      const lines = prepItems
        .map((p) => {
          const r = recByItem.get(p.id);
          const qty = Number(r?.effective_qty ?? 0);
          return {
            store_order_id: orderRow.id,
            prep_item_id: p.id,
            qty_ordered: isFinite(qty) ? qty : 0,
            qty_on_hand_at_order: r?.on_hand ?? null,
          };
        })
        .filter((l) => l.qty_ordered > 0);
      if (lines.length === 0) return;
      const { error: linesErr } = await supabase
        .from("store_order_lines")
        .insert(lines);
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
      prepItems.filter((p) => {
        const r = recByItem.get(p.id);
        return r != null && Number(r.effective_qty ?? 0) > 0;
      }).length,
    [prepItems, recByItem]
  );

  return (
    <AppShell title={`Store order — ${code}`}>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>
            <span className="mr-2">{code}</span>
            <Badge variant="outline">{storeRow?.name ?? "—"}</Badge>
          </CardTitle>
          <CardDescription>
            Ordering for {activeWeekday} ({forDate}). Effective = override if
            set, otherwise calculated = forecast × buffer − on hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === activeWeekday ? "default" : "outline"}
                onClick={() => setDayParam(d)}
                className="h-8 px-2 text-xs"
              >
                {d}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500">
              {totalLines} line{totalLines === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!storeId || submit.isPending}
              onClick={() => void submit.mutateAsync()}
            >
              {submit.isPending ? "Placing…" : "Place order"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Morning prep (fresh daily)</CardTitle>
          <CardDescription>
            Cotoletta + tomatoes — must be cut/cooked the morning of service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : null}
          {morningItems.length === 0 ? (
            <p className="text-sm text-stone-500">No morning items.</p>
          ) : null}
          {morningItems.map((p) => (
            <OrderRow
              key={p.id}
              item={p}
              rec={recByItem.get(p.id)}
              localOverride={overrideByItem.get(p.id) ?? null}
              storeId={storeId}
              forDate={forDate}
              userId={user?.id ?? null}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch items</CardTitle>
          <CardDescription>
            Marinated chicken, pickled onions, salsa verde, salad mix, mayo,
            dressing, roasted peppers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {batchItems.length === 0 ? (
            <p className="text-sm text-stone-500">No batch items.</p>
          ) : null}
          {batchItems.map((p) => (
            <OrderRow
              key={p.id}
              item={p}
              rec={recByItem.get(p.id)}
              localOverride={overrideByItem.get(p.id) ?? null}
              storeId={storeId}
              forDate={forDate}
              userId={user?.id ?? null}
            />
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function OrderRow({
  item,
  rec,
  localOverride,
  storeId,
  forDate,
  userId,
}: {
  item: PrepItemLite;
  rec: RecRow | undefined;
  localOverride: number | null;
  storeId: string | null;
  forDate: string;
  userId: string | null;
}) {
  const upsert = useUpsertStoreOrderOverride();
  const initial =
    localOverride == null ? "" : String(localOverride);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(localOverride == null ? "" : String(localOverride));
  }, [localOverride]);

  const commit = async () => {
    if (!storeId) return;
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && !isFinite(parsed)) return;
    if ((parsed ?? null) === (localOverride ?? null)) return;
    try {
      await upsert.mutateAsync({
        storeId,
        date: forDate,
        prepItemId: item.id,
        override_qty: parsed,
        userId,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const calc = rec?.calculated_qty ?? 0;
  const eff = rec?.effective_qty ?? 0;
  const onHand = rec?.on_hand ?? null;
  const overridden = localOverride != null;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-[var(--color-border)] py-2 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{item.name}</div>
        <div className="font-mono text-[11px] text-stone-500">
          on hand {fmtQty(onHand)} {item.unit} · calc {fmtQty(calc)}
        </div>
      </div>
      <div
        className={`text-right font-mono text-xs ${
          overridden ? "text-amber-700" : "text-stone-500"
        }`}
      >
        {overridden ? "override" : "use"} {fmtQty(eff)} {item.unit}
      </div>
      <Input
        inputMode="decimal"
        placeholder="—"
        className="h-9 w-20 text-center text-sm"
        value={value}
        onChange={(e) =>
          setValue(e.target.value.replace(/[^0-9.]/g, ""))
        }
        onBlur={() => void commit()}
      />
      <span className="text-xs text-stone-500">{item.unit}</span>
    </div>
  );
}
