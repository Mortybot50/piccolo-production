// /stocktake — Jonny's primary entry. Walk the coolroom, count what's there,
// see "below par" callouts, then jump to placing orders.
//
// Two tabs: Prep items (the 9 things production makes — cotoletta, salsa verde,
// etc.) and Ingredients (the 30+ raw inputs from OROSO/DOM/ARZ).
//
// Counts land in stock_counts (prep) or ingredient_stock_counts (ingredients).
// supplier_order_recommendation reads the latest ingredient count and subtracts
// it from weekly_need so the Mon/Wed/Fri DOM tab shows "you actually need X
// more after stock on hand".

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePrepItems,
  useIngredients,
  useSuppliers,
  useLatestStockCountsByPrepItem,
  useLatestIngredientStockCounts,
  useUpsertStockCount,
  useUpsertIngredientStockCount,
} from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { toCanonical, unitOptionsFor } from "@/lib/units";
import { Minus, Plus, AlertCircle, Truck, Store } from "lucide-react";

type Tab = "prep" | "ingredients";

interface PrepRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  par_qty: number | null;
}

interface IngRow {
  id: string;
  code: string;
  name: string;
  pack_unit: string | null;
  par_qty: number | null;
  supplier_id: string | null;
  suppliers?: { code: string; name: string } | null;
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - t) / (24 * 3600 * 1000));
}

function stalenessLabel(days: number | null): string {
  if (days == null) return "never counted";
  if (days === 0) return "counted today";
  if (days === 1) return "counted yesterday";
  return `${days} days ago`;
}

export default function StocktakePage() {
  const today = todayISO();
  const { user } = useAuth();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<Tab>("prep");

  const { data: prepItems = [] } = usePrepItems();
  const { data: ingredients = [] } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const { data: prepLatest } = useLatestStockCountsByPrepItem();
  const { data: ingLatest } = useLatestIngredientStockCounts();

  const upsertPrep = useUpsertStockCount();
  const upsertIng = useUpsertIngredientStockCount();

  return (
    <AppShell title="Stocktake" subtitle="Count what's on hand">
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Counting for</CardTitle>
          <CardDescription>
            Defaults to today. Change the date to backfill a missed day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-44"
            />
            <div className="flex gap-1 rounded-md border border-[var(--color-border)] bg-white p-1">
              <button
                type="button"
                onClick={() => setTab("prep")}
                className={
                  tab === "prep"
                    ? "rounded bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
                }
              >
                Prep items
              </button>
              <button
                type="button"
                onClick={() => setTab("ingredients")}
                className={
                  tab === "ingredients"
                    ? "rounded bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-subtle)]"
                }
              >
                Ingredients
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {tab === "prep" ? (
        <PrepStocktake
          date={date}
          rows={(prepItems as PrepRow[]).filter((p) => (p as { active?: boolean }).active !== false)}
          latest={prepLatest}
          userId={user?.id ?? null}
          onSave={async (payload) => {
            try {
              await upsertPrep.mutateAsync(payload);
              toast.success("Saved");
            } catch (e) {
              toast.error(`Save failed: ${(e as Error).message}`);
              throw e;
            }
          }}
          saving={upsertPrep.isPending}
        />
      ) : (
        <IngredientStocktake
          date={date}
          rows={ingredients as IngRow[]}
          suppliers={suppliers as Array<{ id: string; code: string; name: string }>}
          latest={ingLatest}
          userId={user?.id ?? null}
          onSave={async (payload) => {
            try {
              await upsertIng.mutateAsync(payload);
              toast.success("Saved");
            } catch (e) {
              toast.error(`Save failed: ${(e as Error).message}`);
              throw e;
            }
          }}
          saving={upsertIng.isPending}
        />
      )}

      <Card className="mt-3">
        <CardHeader>
          <CardTitle>Next step</CardTitle>
          <CardDescription>
            With counts saved, order recommendations subtract what's on hand
            from what's needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/supplier-orders">
              <Truck className="h-4 w-4" /> Order from suppliers
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/store-order/HAW">
              <Store className="h-4 w-4" /> HAW order
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/store-order/SY">
              <Store className="h-4 w-4" /> SY order
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}

// =============================================================================
// Prep items tab — flat list, all 9 items, count + unit picker per row.
// =============================================================================
function PrepStocktake({
  date,
  rows,
  latest,
  userId,
  onSave,
  saving,
}: {
  date: string;
  rows: PrepRow[];
  latest:
    | Map<
        string,
        {
          id: string;
          count_date: string;
          qty_on_hand: number;
          input_qty: number | null;
          input_unit: string | null;
        }
      >
    | undefined;
  userId: string | null;
  onSave: (payload: {
    count_date: string;
    prep_item_id: string;
    qty_on_hand: number;
    input_qty: number;
    input_unit: string;
    par_qty_snapshot: number | null;
    counted_by_user_id: string | null;
  }) => Promise<void>;
  saving: boolean;
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
  return (
    <StocktakeList
      date={date}
      items={sorted.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        par_qty: p.par_qty,
      }))}
      latest={latest}
      userId={userId}
      onSave={(payload) =>
        onSave({
          prep_item_id: payload.itemId,
          count_date: payload.count_date,
          qty_on_hand: payload.qty_on_hand,
          input_qty: payload.input_qty,
          input_unit: payload.input_unit,
          par_qty_snapshot: payload.par_qty_snapshot,
          counted_by_user_id: payload.counted_by_user_id,
        })
      }
      saving={saving}
      emptyMessage="No active prep items configured."
    />
  );
}

// =============================================================================
// Ingredients tab — grouped by supplier, collapsible.
// =============================================================================
function IngredientStocktake({
  date,
  rows,
  suppliers,
  latest,
  userId,
  onSave,
  saving,
}: {
  date: string;
  rows: IngRow[];
  suppliers: Array<{ id: string; code: string; name: string }>;
  latest:
    | Map<
        string,
        {
          id: string;
          count_date: string;
          qty_on_hand: number;
          input_qty: number | null;
          input_unit: string | null;
        }
      >
    | undefined;
  userId: string | null;
  onSave: (payload: {
    count_date: string;
    ingredient_id: string;
    qty_on_hand: number;
    input_qty: number;
    input_unit: string;
    par_qty_snapshot: number | null;
    counted_by_user_id: string | null;
  }) => Promise<void>;
  saving: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, IngRow[]>();
    const unassigned: IngRow[] = [];
    for (const r of rows) {
      if (!r.supplier_id) {
        unassigned.push(r);
        continue;
      }
      if (!m.has(r.supplier_id)) m.set(r.supplier_id, []);
      m.get(r.supplier_id)!.push(r);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { byId: m, unassigned };
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set(["__start"]);
  });

  // On first render with suppliers, expand all groups by default.
  useEffect(() => {
    if (expanded.has("__start") && suppliers.length > 0) {
      const all = new Set<string>(suppliers.map((s) => s.id));
      if (groups.unassigned.length > 0) all.add("__unassigned");
      setExpanded(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers.length]);

  return (
    <div className="space-y-3">
      {suppliers
        .filter((s) => (groups.byId.get(s.id) ?? []).length > 0)
        .map((s) => {
          const items = groups.byId.get(s.id) ?? [];
          const isOpen = expanded.has(s.id);
          return (
            <Card key={s.id}>
              <CardHeader>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.delete("__start");
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    });
                  }}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    <CardDescription>
                      {items.length} ingredient{items.length === 1 ? "" : "s"} ·{" "}
                      {isOpen ? "Tap to collapse" : "Tap to expand"}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{s.code}</Badge>
                </button>
              </CardHeader>
              {isOpen ? (
                <CardContent>
                  <StocktakeList
                    date={date}
                    items={items.map((i) => ({
                      id: i.id,
                      name: i.name,
                      unit: i.pack_unit ?? "ea",
                      par_qty: i.par_qty,
                    }))}
                    latest={latest}
                    userId={userId}
                    onSave={(payload) =>
                      onSave({
                        ingredient_id: payload.itemId,
                        count_date: payload.count_date,
                        qty_on_hand: payload.qty_on_hand,
                        input_qty: payload.input_qty,
                        input_unit: payload.input_unit,
                        par_qty_snapshot: payload.par_qty_snapshot,
                        counted_by_user_id: payload.counted_by_user_id,
                      })
                    }
                    saving={saving}
                    embedded
                  />
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      {groups.unassigned.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned</CardTitle>
            <CardDescription>
              {groups.unassigned.length} ingredient
              {groups.unassigned.length === 1 ? "" : "s"} not yet linked to a
              supplier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StocktakeList
              date={date}
              items={groups.unassigned.map((i) => ({
                id: i.id,
                name: i.name,
                unit: i.pack_unit ?? "ea",
                par_qty: i.par_qty,
              }))}
              latest={latest}
              userId={userId}
              onSave={(payload) =>
                onSave({
                  ingredient_id: payload.itemId,
                  count_date: payload.count_date,
                  qty_on_hand: payload.qty_on_hand,
                  input_qty: payload.input_qty,
                  input_unit: payload.input_unit,
                  par_qty_snapshot: payload.par_qty_snapshot,
                  counted_by_user_id: payload.counted_by_user_id,
                })
              }
              saving={saving}
              embedded
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// =============================================================================
// Shared list — used by both Prep and Ingredients (inside a Card or standalone).
// =============================================================================
interface StocktakeItem {
  id: string;
  name: string;
  unit: string;
  par_qty: number | null;
}

interface SavePayload {
  itemId: string;
  count_date: string;
  qty_on_hand: number;
  input_qty: number;
  input_unit: string;
  par_qty_snapshot: number | null;
  counted_by_user_id: string | null;
}

function StocktakeList({
  date,
  items,
  latest,
  userId,
  onSave,
  saving,
  embedded,
  emptyMessage,
}: {
  date: string;
  items: StocktakeItem[];
  latest:
    | Map<
        string,
        {
          id: string;
          count_date: string;
          qty_on_hand: number;
          input_qty: number | null;
          input_unit: string | null;
        }
      >
    | undefined;
  userId: string | null;
  onSave: (payload: SavePayload) => Promise<void>;
  saving: boolean;
  embedded?: boolean;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-fg-muted)]">
        {emptyMessage ?? "Nothing to count."}
      </p>
    );
  }
  const Wrapper = embedded ? (Frag as React.FC<{ children: React.ReactNode }>) : Card;
  return (
    <Wrapper>
      {!embedded ? (
        <CardHeader>
          <CardTitle>Walk the coolroom</CardTitle>
          <CardDescription>
            Per row: type the qty, pick the unit, tap Save. Below-par rows are
            flagged.
          </CardDescription>
        </CardHeader>
      ) : null}
      <div className={embedded ? "space-y-2" : "p-5 md:p-6 pt-0"}>
        <div className="space-y-2">
          {items.map((it) => (
            <CountRow
              key={it.id}
              item={it}
              date={date}
              latest={latest?.get(it.id)}
              userId={userId}
              onSave={onSave}
              saving={saving}
            />
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

const Frag = ({ children }: { children: React.ReactNode }) => <>{children}</>;

function CountRow({
  item,
  date,
  latest,
  userId,
  onSave,
  saving,
}: {
  item: StocktakeItem;
  date: string;
  latest:
    | {
        id: string;
        count_date: string;
        qty_on_hand: number;
        input_qty: number | null;
        input_unit: string | null;
      }
    | undefined;
  userId: string | null;
  onSave: (payload: SavePayload) => Promise<void>;
  saving: boolean;
}) {
  const options = useMemo(() => unitOptionsFor(item.unit), [item.unit]);
  const initialUnit =
    latest?.count_date === date && latest.input_unit
      ? latest.input_unit
      : item.unit;
  const initialQty =
    latest?.count_date === date
      ? String(latest.input_qty ?? latest.qty_on_hand)
      : "";

  const [qty, setQty] = useState(initialQty);
  const [unit, setUnit] = useState(initialUnit);
  const [savedAt, setSavedAt] = useState<string | null>(
    latest?.count_date === date ? "saved" : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (latest?.count_date === date) {
      setQty(String(latest.input_qty ?? latest.qty_on_hand));
      setUnit(latest.input_unit ?? item.unit);
      setSavedAt("saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, date]);

  const numQty = parseFloat(qty);
  const canonical = useMemo(() => {
    if (!Number.isFinite(numQty)) return null;
    return toCanonical(numQty, unit, item.unit);
  }, [numQty, unit, item.unit]);

  const conversionBad =
    qty !== "" && Number.isFinite(numQty) && canonical == null;
  const belowPar =
    canonical != null && item.par_qty != null && canonical < item.par_qty;

  const lastDays = daysAgo(latest?.count_date);
  const lastLabel = stalenessLabel(lastDays);

  function step(delta: number) {
    const cur = parseFloat(qty);
    const next = Number.isFinite(cur) ? cur + delta : delta;
    setQty(next.toString());
    setSavedAt(null);
  }

  async function save() {
    if (!Number.isFinite(numQty)) {
      toast.error("Enter a number first");
      return;
    }
    if (canonical == null) {
      toast.error(`Can't convert ${unit} to ${item.unit}`);
      return;
    }
    if (numQty < 0) {
      toast.error("Qty can't be negative");
      return;
    }
    await onSave({
      itemId: item.id,
      count_date: date,
      qty_on_hand: canonical,
      input_qty: numQty,
      input_unit: unit,
      par_qty_snapshot: item.par_qty,
      counted_by_user_id: userId,
    });
    setSavedAt("saved");
  }

  return (
    <div
      className={
        belowPar
          ? "rounded-lg border border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)]/40 p-3"
          : "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
      }
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-[11px] text-[var(--color-fg-soft)]">
            {item.par_qty != null
              ? `par ${item.par_qty} ${item.unit} · ${lastLabel}`
              : lastLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {belowPar ? (
            <Badge variant="bad">
              <AlertCircle className="mr-0.5 h-3 w-3" /> Below par
            </Badge>
          ) : savedAt === "saved" ? (
            <Badge variant="ok">Saved</Badge>
          ) : null}
        </div>
      </div>
      {/* Row of stepper + qty + unit picker. */}
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="decrease"
          className="h-11 w-10 shrink-0 px-0"
          onClick={() => step(item.unit === "kg" || item.unit === "L" ? -0.5 : -1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value.replace(/[^0-9.]/g, ""));
            setSavedAt(null);
          }}
          placeholder="0"
          className="h-11 flex-1 min-w-0 text-center text-base tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="increase"
          className="h-11 w-10 shrink-0 px-0"
          onClick={() => step(item.unit === "kg" || item.unit === "L" ? 0.5 : 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <select
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            setSavedAt(null);
          }}
          className="h-11 w-16 shrink-0 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1 text-sm"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {/* Save on its own row so the qty input stays a full-width tap target. */}
      <div className="mt-2 flex items-center justify-end">
        <Button
          size="sm"
          disabled={
            saving ||
            qty === "" ||
            (savedAt === "saved" && unit === (latest?.input_unit ?? item.unit) && numQty === Number(latest?.input_qty ?? NaN))
          }
          onClick={() => void save()}
          className="h-9 px-5"
        >
          Save
        </Button>
      </div>
      {conversionBad ? (
        <p className="mt-1 text-[11px] text-[var(--color-bad)]">
          Can't convert {unit} → {item.unit}. Pick a compatible unit.
        </p>
      ) : canonical != null && unit !== item.unit ? (
        <p className="mt-1 text-[11px] text-[var(--color-fg-soft)]">
          ≈ {canonical.toFixed(canonical % 1 === 0 ? 0 : 2)} {item.unit}
        </p>
      ) : null}
    </div>
  );
}
