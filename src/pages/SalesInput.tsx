// Path B: paste a TSV from POS/spreadsheet (primary input) or edit per-cell.
// One week × one store at a time. Tabs: Panini | Add-ons.

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  qk,
  useAppSettings,
  useStores,
  useMenuItems,
  useAddonItems,
  useSalesWeeks,
  useSalesEntries,
  useAddonEntries,
  useSalesAverages,
  useAdvanceLatestWeek,
} from "@/lib/queries";
import { WEEKDAYS, fmtQty, type Weekday } from "@/lib/format";

type Tab = "panini" | "addons";

interface ItemLite {
  id: string;
  code: string;
  name: string;
}
type Grid = Record<string, Record<Weekday, string>>; // itemId -> weekday -> value (string for input)

function blankGrid(items: ItemLite[]): Grid {
  const g: Grid = {};
  for (const it of items) {
    g[it.id] = { Mon: "", Tue: "", Wed: "", Thu: "", Fri: "", Sat: "", Sun: "" };
  }
  return g;
}

// Parses pasted TSV/CSV. Accepts:
//  - 7 cols (Mon..Sun) and rows in the visible item order
//  - tab- or comma-separated, optional leading row label that we strip
function parsePaste(text: string, items: ItemLite[]): Grid | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const out = blankGrid(items);
  for (let i = 0; i < Math.min(lines.length, items.length); i++) {
    const raw = lines[i];
    const cells = raw.includes("\t") ? raw.split("\t") : raw.split(",");
    // If first cell looks like a label (non-numeric), drop it.
    const head = cells[0]?.trim() ?? "";
    const values =
      head !== "" && Number.isNaN(parseFloat(head)) ? cells.slice(1) : cells;
    if (values.length < 7) continue;
    const item = items[i];
    for (let w = 0; w < 7; w++) {
      const v = (values[w] ?? "").trim();
      out[item.id][WEEKDAYS[w]] = v;
    }
  }
  return out;
}

export default function SalesInputPage() {
  const qc = useQueryClient();
  const { data: settings } = useAppSettings();
  const { data: weeks = [] } = useSalesWeeks();
  const { data: stores = [] } = useStores();
  const { data: menuItems = [] } = useMenuItems();
  const { data: addonItems = [] } = useAddonItems();

  const defaultWeek = settings?.latest_week_number ?? weeks[0]?.week_number ?? 1;
  const [weekNumber, setWeekNumber] = useState<number>(defaultWeek);
  useEffect(() => {
    if (settings?.latest_week_number) setWeekNumber(settings.latest_week_number);
  }, [settings?.latest_week_number]);

  const [storeId, setStoreId] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      const haw = stores.find((s) => s.code === "HAW");
      setStoreId(haw?.id ?? stores[0].id);
    }
  }, [stores, storeId]);

  const week = weeks.find((w) => w.week_number === weekNumber);
  const weekId = week?.id ?? null;

  const [tab, setTab] = useState<Tab>("panini");

  const items: ItemLite[] = useMemo(
    () =>
      (tab === "panini" ? menuItems : addonItems).map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
      })),
    [tab, menuItems, addonItems]
  );

  const { data: salesEntries = [] } = useSalesEntries(tab === "panini" ? weekId : null);
  const { data: addonEntries = [] } = useAddonEntries(tab === "addons" ? weekId : null);

  const [grid, setGrid] = useState<Grid>({});
  // Re-seed grid when items/week/store change.
  useEffect(() => {
    const fresh = blankGrid(items);
    if (tab === "panini") {
      for (const e of salesEntries as Array<{
        store_id: string;
        menu_item_id: string;
        weekday: Weekday;
        qty: number;
      }>) {
        if (e.store_id !== storeId) continue;
        if (!fresh[e.menu_item_id]) continue;
        fresh[e.menu_item_id][e.weekday] = String(e.qty);
      }
    } else {
      for (const e of addonEntries as Array<{
        store_id: string;
        addon_item_id: string;
        weekday: Weekday;
        qty: number;
      }>) {
        if (e.store_id !== storeId) continue;
        if (!fresh[e.addon_item_id]) continue;
        fresh[e.addon_item_id][e.weekday] = String(e.qty);
      }
    }
    setGrid(fresh);
  }, [items, salesEntries, addonEntries, storeId, tab, weekId]);

  const setCell = (itemId: string, day: Weekday, value: string) => {
    setGrid((g) => ({
      ...g,
      [itemId]: { ...g[itemId], [day]: value.replace(/[^0-9.]/g, "") },
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!weekId || !storeId) throw new Error("Pick a week and store first");
      if (tab === "panini") {
        const rows: Array<{
          week_id: string;
          store_id: string;
          menu_item_id: string;
          weekday: Weekday;
          qty: number;
        }> = [];
        for (const item of items) {
          for (const day of WEEKDAYS) {
            const raw = grid[item.id]?.[day] ?? "";
            const qty = raw === "" ? 0 : parseFloat(raw);
            if (!isFinite(qty)) continue;
            rows.push({
              week_id: weekId,
              store_id: storeId,
              menu_item_id: item.id,
              weekday: day,
              qty,
            });
          }
        }
        if (rows.length === 0) return;
        const { error } = await supabase
          .from("sales_entries")
          .upsert(rows, { onConflict: "week_id,store_id,menu_item_id,weekday" });
        if (error) throw error;
      } else {
        const rows: Array<{
          week_id: string;
          store_id: string;
          addon_item_id: string;
          weekday: Weekday;
          qty: number;
        }> = [];
        for (const item of items) {
          for (const day of WEEKDAYS) {
            const raw = grid[item.id]?.[day] ?? "";
            const qty = raw === "" ? 0 : parseFloat(raw);
            if (!isFinite(qty)) continue;
            rows.push({
              week_id: weekId,
              store_id: storeId,
              addon_item_id: item.id,
              weekday: day,
              qty,
            });
          }
        }
        if (rows.length === 0) return;
        const { error } = await supabase
          .from("addon_entries")
          .upsert(rows, { onConflict: "week_id,store_id,addon_item_id,weekday" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (tab === "panini" && weekId) {
        qc.invalidateQueries({ queryKey: qk.salesEntries(weekId) });
      }
      if (tab === "addons" && weekId) {
        qc.invalidateQueries({ queryKey: qk.addonEntries(weekId) });
      }
      // Averages depend on this store + week.
      if (storeId) {
        qc.invalidateQueries({ queryKey: qk.salesAverages(storeId, weekNumber) });
      }
    },
  });

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parsePaste(text, items);
      if (!parsed) {
        toast.error("Nothing to paste");
        return;
      }
      setGrid(parsed);
      toast.success("Pasted — review then Save week");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const dirty = useMemo(() => {
    // Cheap: if grid has any non-empty value, treat as dirty (save is idempotent).
    return Object.values(grid).some((row) =>
      WEEKDAYS.some((d) => (row?.[d] ?? "") !== "")
    );
  }, [grid]);

  const advance = useAdvanceLatestWeek();
  const latestWk = settings?.latest_week_number ?? null;
  const recentWeeks = useMemo(() => weeks.slice(0, 4), [weeks]);

  return (
    <AppShell title="Sales input">
      <Card className="mb-3">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Latest week</CardTitle>
            <CardDescription>
              Recommendations key off this week's averages. Advance once a
              week (Mon morning) to roll the rolling window forward.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={advance.isPending}
            onClick={() => {
              advance
                .mutateAsync()
                .then(() => toast.success("Latest week advanced"))
                .catch((e: Error) => toast.error(e.message));
            }}
          >
            {advance.isPending ? "Advancing…" : "Advance latest week"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <Badge variant="outline" className="mr-1">
              Week {latestWk ?? "—"}
            </Badge>
            <span className="text-stone-500">
              currently driving prep + store-order forecasts.
            </span>
          </div>
          {recentWeeks.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {recentWeeks.map((w) => (
                <Badge
                  key={w.id}
                  variant={w.week_number === latestWk ? "default" : "outline"}
                  className="font-mono text-[11px]"
                >
                  Wk {w.week_number} · {w.week_start_date}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Week + store</CardTitle>
          <CardDescription>
            Path B paste: copy a 7-column TSV from your POS spreadsheet, then click Paste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-stone-500">Week</label>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
                value={weekNumber}
                onChange={(e) => setWeekNumber(parseInt(e.target.value, 10))}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.week_number}>
                    Week {w.week_number} ({w.week_start_date})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500">Store</label>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
                value={storeId ?? ""}
                onChange={(e) => setStoreId(e.target.value || null)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant={tab === "panini" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("panini")}
              >
                Panini
              </Button>
              <Button
                variant={tab === "addons" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("addons")}
              >
                Add-ons
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {tab === "panini" ? "Panini" : "Add-ons"} grid
            </CardTitle>
            <CardDescription>Edit cells or paste TSV (rows in the order below).</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePaste}>
              Paste TSV
            </Button>
            <Button
              size="sm"
              disabled={!weekId || !storeId || !dirty || save.isPending}
              onClick={() => {
                save
                  .mutateAsync()
                  .then(() => toast.success("Saved"))
                  .catch((e: Error) => toast.error(e.message));
              }}
            >
              {save.isPending ? "Saving…" : "Save week"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="px-1 py-2">Item</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-1 py-2 text-center">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-[var(--color-border)]">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{it.name}</div>
                      <div className="font-mono text-[10px] text-stone-500">{it.code}</div>
                    </td>
                    {WEEKDAYS.map((d) => (
                      <td key={d} className="px-1 py-1 align-middle">
                        <Input
                          inputMode="decimal"
                          className="h-9 w-16 text-center text-sm"
                          value={grid[it.id]?.[d] ?? ""}
                          onChange={(e) => setCell(it.id, d, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AveragesCard
        storeId={storeId}
        weekNumber={weekNumber}
        items={menuItems.map((i) => ({ id: i.id, code: i.code, name: i.name }))}
      />
    </AppShell>
  );
}

function AveragesCard({
  storeId,
  weekNumber,
  items,
}: {
  storeId: string | null;
  weekNumber: number;
  items: ItemLite[];
}) {
  const qc = useQueryClient();
  const { data: avgs = [], isLoading } = useSalesAverages(storeId, weekNumber);
  // Build a Map<menuItemId, Map<weekday, avg>>.
  const byItem = new Map<string, Map<Weekday, number>>();
  for (const r of avgs as Array<{ menu_item_id: string; weekday: Weekday; avg_qty: number }>) {
    if (!byItem.has(r.menu_item_id)) byItem.set(r.menu_item_id, new Map());
    byItem.get(r.menu_item_id)!.set(r.weekday, Number(r.avg_qty));
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>4-week rolling averages</CardTitle>
          <CardDescription>
            <Badge variant="outline" className="mr-1">
              Week {weekNumber}
            </Badge>
            Used by prep + store-order recommendations.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (storeId) {
              qc.invalidateQueries({ queryKey: qk.salesAverages(storeId, weekNumber) });
              toast.success("Recomputing…");
            }
          }}
        >
          Recompute
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-stone-500">No items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="px-1 py-1">Item</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-1 py-1 text-center">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const row = byItem.get(it.id);
                  return (
                    <tr key={it.id} className="border-t border-[var(--color-border)]">
                      <td className="py-1 pr-2">{it.name}</td>
                      {WEEKDAYS.map((d) => (
                        <td
                          key={d}
                          className="px-1 py-1 text-center font-mono text-xs text-stone-700"
                        >
                          {fmtQty(row?.get(d), 1)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
