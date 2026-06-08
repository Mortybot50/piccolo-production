// Today / Prep / Tracker — F1 morning flow (v2).
//
// Per workbook brief §4.5 + §4.6:
//   * Day-of-week selector (URL ?day=tue) drives the date for the whole page.
//   * Catering decorator strip — 6 panini, editable qty cascades into prep calc.
//   * Morning prep block (fresh daily, no batching) — Cotoletta + Tomatoes Cut.
//     Calculated total/HAW/SY with override inputs (G2).
//   * Batch prep block (Marinated Chicken, Pickled Onions, Salsa Verde, Salad
//     Mix, Mayo, Dressing, Roasted Peppers) — large stoplight chip per row
//     (≥48px, kitchen-readable). Stock-on-hand → 🔴/🟡/🟢/⬜.
//   * Log Prep Run modal per row → writes prep_log with HAW/SY/kept splits.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  qk,
  usePrepItems,
  useMenuItems,
  useDailyPrepPlan,
  usePrepGap,
  useStockCounts,
  usePrepLog,
  useWasteEntries,
  useCateringForDate,
  useUpsertCateringQty,
  useUpsertPrepPlanOverride,
} from "@/lib/queries";
import {
  fmtQty,
  todayISO,
  WEEKDAYS,
  weekdayOf,
  addDaysISO,
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

interface MenuItemLite {
  id: string;
  code: string;
  name: string;
}

interface PlanRow {
  prep_item_id: string;
  panini_avg: number;
  addon_avg: number;
  catering_qty: number;
  calculated_total: number;
  calculated_haw: number;
  calculated_sy: number;
  override_total: number | null;
  override_haw: number | null;
  override_sy: number | null;
  effective_total: number;
  effective_haw: number;
  effective_sy: number;
  unit: string;
}

interface GapRow {
  prep_item_id: string;
  today_demand: number;
  rest_of_week_demand: number;
  total_needed: number;
  stock_on_hand: number;
  prep_gap: number;
  batches_to_make: number | null;
  status: string;
}

// Maps `?day=tue` → resolves to the next-occurring ISO date matching that weekday
// from today. So clicking "Mon" while it's Tuesday lands on next Monday.
function isoForDayParam(dayParam: string | null): string {
  const today = todayISO();
  if (!dayParam) return today;
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
  if (!target) return today;
  // Walk up to 7 days forward looking for the matching weekday (today first).
  for (let i = 0; i < 7; i++) {
    const candidate = addDaysISO(today, i);
    if (weekdayOf(candidate) === target) return candidate;
  }
  return today;
}

function paramFor(day: Weekday): string {
  return day.toLowerCase();
}

export default function TodayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dayParam = searchParams.get("day");
  const date = isoForDayParam(dayParam);
  const activeWeekday = weekdayOf(date);

  const { data: prepItemsRaw = [] } = usePrepItems();
  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);
  const { data: menuItemsRaw = [] } = useMenuItems();
  const menuItems = menuItemsRaw as MenuItemLite[];

  const { data: plan = [], isLoading: planLoading } = useDailyPrepPlan(date);
  const { data: gap = [], isLoading: gapLoading } = usePrepGap(date);
  const { data: stockCounts = [] } = useStockCounts(date);
  const { data: prepLog = [] } = usePrepLog(date);

  const planByItem = useMemo(() => {
    const m = new Map<string, PlanRow>();
    for (const r of plan as PlanRow[]) m.set(r.prep_item_id, r);
    return m;
  }, [plan]);

  const gapByItem = useMemo(() => {
    const m = new Map<string, GapRow>();
    for (const r of gap as GapRow[]) m.set(r.prep_item_id, r);
    return m;
  }, [gap]);

  const stockByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stockCounts as Array<{ prep_item_id: string; qty_on_hand: number }>) {
      if (!m.has(r.prep_item_id)) m.set(r.prep_item_id, Number(r.qty_on_hand));
    }
    return m;
  }, [stockCounts]);

  const logByItem = useMemo(() => {
    const m = new Map<
      string,
      { qty_prepped: number; qty_sent_haw: number; qty_sent_sy: number; qty_kept: number }
    >();
    for (const r of prepLog as Array<{
      prep_item_id: string;
      qty_prepped: number;
      qty_sent_haw: number;
      qty_sent_sy: number;
      qty_kept: number;
    }>) {
      m.set(r.prep_item_id, {
        qty_prepped: Number(r.qty_prepped),
        qty_sent_haw: Number(r.qty_sent_haw),
        qty_sent_sy: Number(r.qty_sent_sy),
        qty_kept: Number(r.qty_kept),
      });
    }
    return m;
  }, [prepLog]);

  // Brief §4.5: Cotoletta + Tomatoes Cut are fresh-daily (no batching).
  // Heuristic: items with batch_size null OR explicit code match → morning group.
  const morningCodes = new Set(["COTOLETTA", "TOMATOES_CUT", "TOMATO_CUT", "TOMATOES"]);
  const morningItems = prepItems.filter(
    (p) => morningCodes.has(p.code) || p.batch_size == null
  );
  const batchItems = prepItems.filter((p) => !morningItems.includes(p));

  const selectDay = (d: Weekday) => {
    const next = new URLSearchParams(searchParams);
    next.set("day", paramFor(d));
    setSearchParams(next, { replace: true });
  };

  return (
    <AppShell title="Today">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            {new Date(date).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </CardTitle>
          <CardDescription>
            Pick the production day. Catering edits cascade into the prep plan below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => (
              <Button
                key={d}
                variant={activeWeekday === d ? "default" : "outline"}
                size="sm"
                onClick={() => selectDay(d)}
                aria-pressed={activeWeekday === d}
              >
                {d}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <CateringStrip date={date} menuItems={menuItems} />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Morning prep (fresh daily)</CardTitle>
          <CardDescription>
            Cotoletta + Tomatoes Cut. Calculated shown alongside override inputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {planLoading || gapLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : null}
          {morningItems.length === 0 && !planLoading ? (
            <p className="text-sm text-stone-500">
              No morning-prep items configured.
            </p>
          ) : null}
          {morningItems.map((p) => (
            <MorningPrepRow
              key={p.id}
              item={p}
              plan={planByItem.get(p.id)}
              gap={gapByItem.get(p.id)}
              stockOnHand={stockByItem.get(p.id) ?? null}
              logged={logByItem.get(p.id)}
              date={date}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Batch prep</CardTitle>
              <CardDescription>
                Stoplight tells you what to make.{" "}
                <Link
                  to="/stocktake"
                  className="font-medium text-[var(--color-brand-700)] underline-offset-2 hover:underline"
                >
                  Count stock →
                </Link>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {batchItems.map((p) => (
            <BatchPrepRow
              key={p.id}
              item={p}
              plan={planByItem.get(p.id)}
              gap={gapByItem.get(p.id)}
              stockOnHand={stockByItem.get(p.id) ?? null}
              logged={logByItem.get(p.id)}
              date={date}
            />
          ))}
        </CardContent>
      </Card>

      <WasteCard date={date} prepItems={prepItems} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Catering decorator strip — 6 panini × qty inputs
// ---------------------------------------------------------------------------

function CateringStrip({
  date,
  menuItems,
}: {
  date: string;
  menuItems: MenuItemLite[];
}) {
  const { data: orders = [] } = useCateringForDate(date);
  const { user } = useAuth();
  const upsert = useUpsertCateringQty();

  // Sum qty per menu_item_id across all catering orders on that date.
  const qtyByMenuItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders as unknown as Array<{
      catering_order_lines: Array<{ menu_item_id: string; qty: number }> | null;
    }>) {
      const lines = o.catering_order_lines ?? [];
      for (const l of lines) {
        m.set(l.menu_item_id, (m.get(l.menu_item_id) ?? 0) + Number(l.qty));
      }
    }
    return m;
  }, [orders]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const mi of menuItems) {
      seed[mi.id] = String(qtyByMenuItem.get(mi.id) ?? 0);
    }
    setDrafts(seed);
  }, [menuItems, qtyByMenuItem]);

  const commit = (mi: MenuItemLite, raw: string) => {
    const n = parseFloat(raw);
    if (!isFinite(n) || n < 0) {
      toast.error("Catering qty must be ≥ 0");
      return;
    }
    upsert.mutate(
      {
        date,
        menuItemId: mi.id,
        qty: n,
        userId: user?.id ?? null,
      },
      {
        onSuccess: () => toast.success(`${mi.name}: ${n}`),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Today's catering</CardTitle>
        <CardDescription>
          Add qty per panini. Saved values cascade into the prep plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {menuItems.map((mi) => (
            <div
              key={mi.id}
              className="flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-white p-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{mi.name}</div>
                <div className="font-mono text-[10px] text-stone-500">{mi.code}</div>
              </div>
              <Input
                inputMode="decimal"
                aria-label={`${mi.name} catering qty`}
                className="h-9 w-16 text-center text-sm"
                value={drafts[mi.id] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [mi.id]: e.target.value.replace(/[^0-9.]/g, ""),
                  }))
                }
                onBlur={() => {
                  const cur = drafts[mi.id] ?? "";
                  if (cur !== String(qtyByMenuItem.get(mi.id) ?? 0)) {
                    commit(mi, cur);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Morning prep row — calc + override inputs for total / HAW / SY
// ---------------------------------------------------------------------------

function MorningPrepRow({
  item,
  plan,
  gap,
  stockOnHand,
  logged,
  date,
}: {
  item: PrepItemLite;
  plan: PlanRow | undefined;
  gap: GapRow | undefined;
  stockOnHand: number | null;
  logged?: { qty_prepped: number; qty_sent_haw: number; qty_sent_sy: number; qty_kept: number };
  date: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const overrideMut = useUpsertPrepPlanOverride();

  const [oTotal, setOTotal] = useState(plan?.override_total == null ? "" : String(plan.override_total));
  const [oHaw, setOHaw] = useState(plan?.override_haw == null ? "" : String(plan.override_haw));
  const [oSy, setOSy] = useState(plan?.override_sy == null ? "" : String(plan.override_sy));
  useEffect(() => {
    setOTotal(plan?.override_total == null ? "" : String(plan.override_total));
    setOHaw(plan?.override_haw == null ? "" : String(plan.override_haw));
    setOSy(plan?.override_sy == null ? "" : String(plan.override_sy));
  }, [plan?.override_total, plan?.override_haw, plan?.override_sy]);

  const saveOverride = (
    field: "override_total" | "override_haw" | "override_sy",
    raw: string
  ) => {
    const value = raw.trim() === "" ? null : parseFloat(raw);
    if (value != null && (!isFinite(value) || value < 0)) {
      toast.error("Override must be blank or ≥ 0");
      return;
    }
    overrideMut.mutate(
      {
        date,
        prepItemId: item.id,
        userId: user?.id ?? null,
        [field]: value,
      } as Parameters<typeof overrideMut.mutate>[0],
      {
        onSuccess: () => toast.success(`${item.name} override saved`),
        onError: (e: Error) => toast.error(e.message),
      }
    );
  };

  const [showLog, setShowLog] = useState(false);
  const [showCount, setShowCount] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{item.name}</div>
          <div className="font-mono text-[11px] text-stone-500">
            {item.code} · {item.unit}
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Prep {fmtQty(plan?.effective_total)} {item.unit}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
        <Stat label="Panini avg" value={fmtQty(plan?.panini_avg)} />
        <Stat label="Add-on avg" value={fmtQty(plan?.addon_avg)} />
        <Stat label="Catering" value={fmtQty(plan?.catering_qty)} />
        <Stat label="Calc total" value={fmtQty(plan?.calculated_total)} />
        <Stat label="Calc HAW" value={fmtQty(plan?.calculated_haw)} />
        <Stat label="Calc SY" value={fmtQty(plan?.calculated_sy)} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <OverrideInput
          label="Override total"
          value={oTotal}
          onChange={setOTotal}
          onCommit={(v) => saveOverride("override_total", v)}
        />
        <OverrideInput
          label="Override HAW"
          value={oHaw}
          onChange={setOHaw}
          onCommit={(v) => saveOverride("override_haw", v)}
        />
        <OverrideInput
          label="Override SY"
          value={oSy}
          onChange={setOSy}
          onCommit={(v) => saveOverride("override_sy", v)}
        />
      </div>

      <div className="flex items-center justify-between gap-2 rounded bg-stone-50 px-2 py-1 text-xs">
        <span>
          Stock on hand:{" "}
          <strong>{stockOnHand == null ? "—" : `${fmtQty(stockOnHand)} ${item.unit}`}</strong>
          {gap ? <> · gap {fmtQty(gap.prep_gap)} {item.unit}</> : null}
        </span>
        <span className="font-mono text-[11px]">
          HAW {fmtQty(plan?.effective_haw)} · SY {fmtQty(plan?.effective_sy)}
        </span>
      </div>

      {logged ? (
        <div className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          Logged today: {fmtQty(logged.qty_prepped)} {item.unit} · HAW{" "}
          {fmtQty(logged.qty_sent_haw)} · SY {fmtQty(logged.qty_sent_sy)} · kept{" "}
          {fmtQty(logged.qty_kept)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowCount((v) => !v)}>
          {showCount ? "Hide count" : "Count stock"}
        </Button>
        <Button
          variant={logged ? "outline" : "default"}
          size="sm"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? "Hide log" : logged ? "Edit prep log" : "Log prep run"}
        </Button>
      </div>

      {showCount ? (
        <StockCountForm
          item={item}
          date={date}
          userId={user?.id ?? null}
          initial={stockOnHand ?? 0}
          onSaved={() => {
            setShowCount(false);
            qc.invalidateQueries({ queryKey: qk.stockCounts(date) });
            qc.invalidateQueries({ queryKey: qk.prepGap(date) });
          }}
        />
      ) : null}

      {showLog ? (
        <PrepLogForm
          item={item}
          date={date}
          userId={user?.id ?? null}
          recommendedHAW={plan?.effective_haw ?? 0}
          recommendedSY={plan?.effective_sy ?? 0}
          initial={logged}
          onSaved={() => {
            setShowLog(false);
            qc.invalidateQueries({ queryKey: qk.prepLog(date) });
            qc.invalidateQueries({ queryKey: qk.prepGap(date) });
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch prep row — large stoplight chip + stock input
// ---------------------------------------------------------------------------

type Stoplight = "blank" | "red" | "yellow" | "green";

function classifyStoplight(stock: number | null, todayDemand: number): Stoplight {
  if (stock == null) return "blank";
  if (todayDemand > 0 && stock < todayDemand) return "red";
  if (todayDemand > 0 && stock < 2 * todayDemand) return "yellow";
  return "green";
}

const STOPLIGHT_META: Record<
  Stoplight,
  { label: string; bg: string; text: string; emoji: string }
> = {
  blank: {
    label: "Count stock",
    bg: "bg-stone-200",
    text: "text-stone-700",
    emoji: "⬜",
  },
  red: {
    label: "PREP NOW",
    bg: "bg-red-500",
    text: "text-white",
    emoji: "🔴",
  },
  yellow: {
    label: "Low — prep tomorrow",
    bg: "bg-yellow-400",
    text: "text-stone-900",
    emoji: "🟡",
  },
  green: {
    label: "OK",
    bg: "bg-emerald-500",
    text: "text-white",
    emoji: "🟢",
  },
};

function BatchPrepRow({
  item,
  plan,
  gap,
  stockOnHand,
  logged,
  date,
}: {
  item: PrepItemLite;
  plan: PlanRow | undefined;
  gap: GapRow | undefined;
  stockOnHand: number | null;
  logged?: { qty_prepped: number; qty_sent_haw: number; qty_sent_sy: number; qty_kept: number };
  date: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const todayDemand = gap?.today_demand ?? 0;
  const stoplight = classifyStoplight(stockOnHand, todayDemand);
  const meta = STOPLIGHT_META[stoplight];

  const [showCount, setShowCount] = useState(false);
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="status"
          aria-label={`${item.name} stoplight: ${meta.label}`}
          className={`flex h-12 min-w-[12rem] items-center justify-center rounded-md px-3 text-sm font-semibold ${meta.bg} ${meta.text}`}
        >
          <span className="mr-2 text-lg leading-none">{meta.emoji}</span>
          {meta.label}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="font-mono text-[11px] text-stone-500">
            {item.code} · {item.unit}
            {item.batch_size ? (
              <span> · batch {item.batch_size} {item.batch_unit ?? item.unit}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
        <Stat label="Stock on hand" value={stockOnHand == null ? "—" : `${fmtQty(stockOnHand)}`} />
        <Stat label="Today demand" value={fmtQty(gap?.today_demand)} />
        <Stat label="Rest of week" value={fmtQty(gap?.rest_of_week_demand)} />
        <Stat label="Total needed" value={fmtQty(gap?.total_needed)} />
        <Stat label="Prep gap" value={fmtQty(gap?.prep_gap)} />
        <Stat
          label="Batches"
          value={gap?.batches_to_make == null ? "—" : String(gap.batches_to_make)}
        />
      </div>

      <div className="rounded bg-stone-50 px-2 py-1 text-xs text-stone-700">
        Plan: prep <strong>{fmtQty(plan?.effective_total)}</strong> {item.unit} · HAW{" "}
        <strong>{fmtQty(plan?.effective_haw)}</strong> · SY{" "}
        <strong>{fmtQty(plan?.effective_sy)}</strong>
        {plan?.catering_qty && plan.catering_qty > 0 ? (
          <span> · catering {fmtQty(plan.catering_qty)}</span>
        ) : null}
      </div>

      {logged ? (
        <div className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          Logged: {fmtQty(logged.qty_prepped)} {item.unit} · HAW{" "}
          {fmtQty(logged.qty_sent_haw)} · SY {fmtQty(logged.qty_sent_sy)} · kept{" "}
          {fmtQty(logged.qty_kept)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowCount((v) => !v)}>
          {showCount ? "Hide count" : "Count stock"}
        </Button>
        <Button
          variant={logged ? "outline" : "default"}
          size="sm"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? "Hide log" : logged ? "Edit prep log" : "Log prep run"}
        </Button>
      </div>

      {showCount ? (
        <StockCountForm
          item={item}
          date={date}
          userId={user?.id ?? null}
          initial={stockOnHand ?? 0}
          onSaved={() => {
            setShowCount(false);
            qc.invalidateQueries({ queryKey: qk.stockCounts(date) });
            qc.invalidateQueries({ queryKey: qk.prepGap(date) });
          }}
        />
      ) : null}

      {showLog ? (
        <PrepLogForm
          item={item}
          date={date}
          userId={user?.id ?? null}
          recommendedHAW={plan?.effective_haw ?? 0}
          recommendedSY={plan?.effective_sy ?? 0}
          initial={logged}
          onSaved={() => {
            setShowLog(false);
            qc.invalidateQueries({ queryKey: qk.prepLog(date) });
            qc.invalidateQueries({ queryKey: qk.prepGap(date) });
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form pieces
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-stone-500">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function OverrideInput({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-stone-500">{label}</label>
      <Input
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={() => onCommit(value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

function StockCountForm({
  item,
  date,
  userId,
  initial,
  onSaved,
}: {
  item: PrepItemLite;
  date: string;
  userId: string | null;
  initial: number;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState(String(initial));
  const save = useMutation({
    mutationFn: async () => {
      const n = parseFloat(qty);
      if (!isFinite(n) || n < 0) throw new Error("Enter a non-negative number");
      const { error } = await supabase
        .from("stock_counts")
        .upsert(
          {
            count_date: date,
            prep_item_id: item.id,
            qty_on_hand: n,
            input_qty: n,
            input_unit: item.unit,
            counted_by_user_id: userId,
          },
          { onConflict: "count_date,prep_item_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock counted");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-end gap-2 rounded border border-dashed border-stone-300 p-2">
      <div className="flex-1">
        <label className="text-xs text-stone-500">
          On hand right now ({item.unit})
        </label>
        <Input
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>
      <Button
        size="sm"
        disabled={save.isPending}
        onClick={() => void save.mutateAsync()}
      >
        {save.isPending ? "Saving…" : "Save count"}
      </Button>
    </div>
  );
}

function PrepLogForm({
  item,
  date,
  userId,
  recommendedHAW,
  recommendedSY,
  initial,
  onSaved,
}: {
  item: PrepItemLite;
  date: string;
  userId: string | null;
  recommendedHAW: number;
  recommendedSY: number;
  initial?: { qty_prepped: number; qty_sent_haw: number; qty_sent_sy: number; qty_kept: number };
  onSaved: () => void;
}) {
  const startPrepped = initial
    ? String(initial.qty_prepped)
    : ((Math.max(0, recommendedHAW) + Math.max(0, recommendedSY)).toFixed(2));
  const startHaw = initial
    ? String(initial.qty_sent_haw)
    : recommendedHAW.toFixed(2);
  const startSy = initial
    ? String(initial.qty_sent_sy)
    : recommendedSY.toFixed(2);
  const [prepped, setPrepped] = useState(startPrepped);
  const [haw, setHaw] = useState(startHaw);
  const [sy, setSy] = useState(startSy);
  const [notes, setNotes] = useState("");

  const preppedN = parseFloat(prepped) || 0;
  const hawN = parseFloat(haw) || 0;
  const syN = parseFloat(sy) || 0;
  const kept = preppedN - hawN - syN;
  const invalid = preppedN < 0 || hawN < 0 || syN < 0 || kept < -0.001;

  const save = useMutation({
    mutationFn: async () => {
      if (invalid) throw new Error("HAW + SY can't exceed prepped");
      const { error } = await supabase
        .from("prep_log")
        .upsert(
          {
            log_date: date,
            prep_item_id: item.id,
            qty_prepped: preppedN,
            qty_sent_haw: hawN,
            qty_sent_sy: syN,
            qty_kept: Math.max(0, kept),
            notes: notes || null,
            prepped_by_user_id: userId,
          },
          { onConflict: "log_date,prep_item_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prep logged");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 rounded border border-dashed border-stone-300 p-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-stone-500">Prepped ({item.unit})</label>
          <Input
            inputMode="decimal"
            value={prepped}
            onChange={(e) => setPrepped(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">
            HAW <span className="text-[10px] text-stone-400">(rec {fmtQty(recommendedHAW)})</span>
          </label>
          <Input
            inputMode="decimal"
            value={haw}
            onChange={(e) => setHaw(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div>
          <label className="text-xs text-stone-500">
            SY <span className="text-[10px] text-stone-400">(rec {fmtQty(recommendedSY)})</span>
          </label>
          <Input
            inputMode="decimal"
            value={sy}
            onChange={(e) => setSy(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-stone-500">
          Kept on hand: <strong>{fmtQty(Math.max(0, kept))}</strong> {item.unit}
        </span>
        {invalid ? <Badge variant="bad">HAW + SY &gt; prepped</Badge> : null}
      </div>
      <Input
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button
        size="sm"
        disabled={invalid || save.isPending}
        onClick={() => void save.mutateAsync()}
      >
        {save.isPending ? "Saving…" : initial ? "Update log" : "Save log"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waste card (unchanged from v1)
// ---------------------------------------------------------------------------

const WASTE_REASONS = [
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "over_prepped", label: "Over-prepped" },
  { value: "customer_return", label: "Customer return" },
  { value: "staff_meal", label: "Staff meal" },
  { value: "other", label: "Other" },
] as const;

interface WasteRow {
  id: string;
  waste_date: string;
  prep_item_id: string;
  qty: number;
  reason_code: string;
  note: string | null;
}

function WasteCard({ date, prepItems }: { date: string; prepItems: PrepItemLite[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: entriesRaw = [] } = useWasteEntries(date);
  const entries = entriesRaw as WasteRow[];
  const nameById = useMemo(
    () => new Map(prepItems.map((p) => [p.id, p])),
    [prepItems]
  );
  const [itemId, setItemId] = useState<string>(prepItems[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof WASTE_REASONS)[number]["value"]>("expired");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!itemId && prepItems.length > 0) setItemId(prepItems[0].id);
  }, [itemId, prepItems]);

  const save = useMutation({
    mutationFn: async () => {
      const n = parseFloat(qty);
      if (!isFinite(n) || n <= 0) throw new Error("Enter qty > 0");
      if (!itemId) throw new Error("Pick an item");
      const { error } = await supabase.from("waste_entries").insert({
        waste_date: date,
        prep_item_id: itemId,
        qty: n,
        reason_code: reason,
        note: note || null,
        logged_by_user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Waste logged");
      setQty("");
      setNote("");
      qc.invalidateQueries({ queryKey: qk.wasteEntries(date) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waste_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Waste removed");
      qc.invalidateQueries({ queryKey: qk.wasteEntries(date) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Waste log</CardTitle>
        <CardDescription>
          Record anything binned, returned, or eaten by staff.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="col-span-2">
            <label className="text-xs text-stone-500">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
            >
              {prepItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500">Qty</label>
            <Input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
          <div>
            <label className="text-xs text-stone-500">Reason</label>
            <select
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as (typeof WASTE_REASONS)[number]["value"])
              }
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
            >
              {WASTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => void save.mutateAsync()}
          >
            {save.isPending ? "Saving…" : "Log waste"}
          </Button>
        </div>

        {entries.length > 0 ? (
          <div className="space-y-1 pt-2">
            {entries.map((w) => {
              const it = nameById.get(w.prep_item_id);
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs"
                >
                  <span>
                    <strong>{fmtQty(w.qty)}</strong> {it?.unit ?? ""}{" "}
                    {it?.name ?? w.prep_item_id} · {w.reason_code}
                    {w.note ? ` · ${w.note}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove.mutateAsync(w.id)}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="pt-1 text-xs text-stone-500">No waste logged today.</p>
        )}
      </CardContent>
    </Card>
  );
}
