// Today / Prep / Tracker — F1 morning flow.
// Daily plan -> stock count -> prep gap -> log production (with HAW/SY split).

import { useMemo, useState } from "react";
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
  useDailyPrepPlan,
  usePrepGap,
  useStockCounts,
  usePrepLog,
  useWasteEntries,
} from "@/lib/queries";
import { fmtQty, todayISO } from "@/lib/format";
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

export default function TodayPage() {
  const date = todayISO();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);
  const { data: plan = [], isLoading: planLoading } = useDailyPrepPlan(date);
  const { data: gap = [], isLoading: gapLoading } = usePrepGap(date);
  const { data: stockCounts = [] } = useStockCounts(date);
  const { data: prepLog = [] } = usePrepLog(date);

  const planByItem = new Map<
    string,
    {
      panini_avg: number;
      catering_qty: number;
      total_with_buffer: number;
      haw_split: number;
      sy_split: number;
      unit: string;
    }
  >();
  for (const r of plan as Array<{
    prep_item_id: string;
    panini_avg: number;
    catering_qty: number;
    total_with_buffer: number;
    haw_split: number;
    sy_split: number;
    unit: string;
  }>) {
    planByItem.set(r.prep_item_id, {
      panini_avg: Number(r.panini_avg ?? 0),
      catering_qty: Number(r.catering_qty ?? 0),
      total_with_buffer: Number(r.total_with_buffer ?? 0),
      haw_split: Number(r.haw_split ?? 0),
      sy_split: Number(r.sy_split ?? 0),
      unit: r.unit,
    });
  }

  const gapByItem = new Map<
    string,
    {
      today_demand: number;
      total_needed: number;
      stock_on_hand: number;
      prep_gap: number;
      batches_to_make: number | null;
      status: string;
    }
  >();
  for (const r of gap as Array<{
    prep_item_id: string;
    today_demand: number;
    total_needed: number;
    stock_on_hand: number;
    prep_gap: number;
    batches_to_make: number | null;
    status: string;
  }>) {
    gapByItem.set(r.prep_item_id, {
      today_demand: Number(r.today_demand ?? 0),
      total_needed: Number(r.total_needed ?? 0),
      stock_on_hand: Number(r.stock_on_hand ?? 0),
      prep_gap: Number(r.prep_gap ?? 0),
      batches_to_make: r.batches_to_make == null ? null : Number(r.batches_to_make),
      status: r.status,
    });
  }

  const stockByItem = new Map<string, number>();
  for (const r of stockCounts as Array<{ prep_item_id: string; qty_on_hand: number }>) {
    if (!stockByItem.has(r.prep_item_id))
      stockByItem.set(r.prep_item_id, Number(r.qty_on_hand));
  }

  const logByItem = new Map<
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
    logByItem.set(r.prep_item_id, {
      qty_prepped: Number(r.qty_prepped),
      qty_sent_haw: Number(r.qty_sent_haw),
      qty_sent_sy: Number(r.qty_sent_sy),
      qty_kept: Number(r.qty_kept),
    });
  }

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
            Count stock first → see the gap → prep + split between Hawthorn and South Yarra.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Prep gap (today)</CardTitle>
          <CardDescription>
            🔴 prep now · 🟡 low · 🟢 ok. Missing stock count? Use "Count stock" below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {gapLoading || planLoading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : null}
          {prepItems.map((p) => {
            const g = gapByItem.get(p.id);
            const pl = planByItem.get(p.id);
            const logged = logByItem.get(p.id);
            return (
              <PrepRow
                key={p.id}
                item={p}
                plan={pl}
                gap={g}
                stockOnHand={stockByItem.get(p.id) ?? null}
                logged={logged}
                date={date}
              />
            );
          })}
        </CardContent>
      </Card>

      <WasteCard date={date} prepItems={prepItems} />
    </AppShell>
  );
}

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
        <CardTitle>Waste log (today)</CardTitle>
        <CardDescription>
          Record anything binned, returned, or eaten by staff. Drives loss tracking.
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

function PrepRow({
  item,
  plan,
  gap,
  stockOnHand,
  logged,
  date,
}: {
  item: PrepItemLite;
  plan?: {
    panini_avg: number;
    catering_qty: number;
    total_with_buffer: number;
    haw_split: number;
    sy_split: number;
    unit: string;
  };
  gap?: {
    today_demand: number;
    total_needed: number;
    stock_on_hand: number;
    prep_gap: number;
    batches_to_make: number | null;
    status: string;
  };
  stockOnHand: number | null;
  logged?: { qty_prepped: number; qty_sent_haw: number; qty_sent_sy: number; qty_kept: number };
  date: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showCount, setShowCount] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const statusVariant: "ok" | "warn" | "bad" | "outline" = useMemo(() => {
    const s = gap?.status ?? "";
    if (s.startsWith("🔴")) return "bad";
    if (s.startsWith("🟡")) return "warn";
    if (s.startsWith("🟢")) return "ok";
    return "outline";
  }, [gap?.status]);

  const recommendedHAW = plan ? plan.haw_split : 0;
  const recommendedSY = plan ? plan.sy_split : 0;

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{item.name}</div>
          <div className="font-mono text-[11px] text-stone-500">
            {item.code} · {item.unit}
          </div>
        </div>
        <Badge variant={statusVariant}>{gap?.status ?? "—"}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <div className="text-stone-500">Today demand</div>
          <div className="font-mono">
            {fmtQty(gap?.today_demand)} {item.unit}
          </div>
        </div>
        <div>
          <div className="text-stone-500">On hand</div>
          <div className="font-mono">
            {stockOnHand == null ? "—" : `${fmtQty(stockOnHand)} ${item.unit}`}
          </div>
        </div>
        <div>
          <div className="text-stone-500">Gap</div>
          <div className="font-mono">
            {fmtQty(gap?.prep_gap)} {item.unit}
          </div>
        </div>
        <div>
          <div className="text-stone-500">Batches</div>
          <div className="font-mono">{gap?.batches_to_make ?? "—"}</div>
        </div>
      </div>

      {plan ? (
        <div className="rounded bg-stone-50 px-2 py-1 text-xs text-stone-700">
          Plan: prep <strong>{fmtQty(plan.total_with_buffer)}</strong> {plan.unit} · split{" "}
          <strong>HAW {fmtQty(recommendedHAW)}</strong> /{" "}
          <strong>SY {fmtQty(recommendedSY)}</strong>
          {plan.catering_qty > 0 ? (
            <span> · catering {fmtQty(plan.catering_qty)}</span>
          ) : null}
        </div>
      ) : null}

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
          {showLog ? "Hide log" : logged ? "Edit prep log" : "Log prep"}
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
          recommendedHAW={recommendedHAW}
          recommendedSY={recommendedSY}
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
      const { error } = await supabase.from("stock_counts").insert({
        count_date: date,
        prep_item_id: item.id,
        qty_on_hand: n,
        counted_by_user_id: userId,
      });
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
      // Upsert by (log_date, prep_item_id).
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
