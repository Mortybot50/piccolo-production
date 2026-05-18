// /costing — Panini margins + production costing tabs. Per BRIEF §4.13.
//
// Panini tab: per menu item — COGS (compute_cogs) vs sell price → margin $ + %.
// Prep tab: per prep item — COGS vs effective transfer price → margin per unit.

import { useMemo, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useMenuItems, usePrepItems } from "@/lib/queries";
import { centsToDollars, fmtPct, fmtQty, todayISO } from "@/lib/format";

type Tab = "panini" | "prep";

interface MenuItemLite {
  id: string;
  code: string;
  name: string;
  sell_price_cents: number;
  active: boolean;
}

interface PrepItemLite {
  id: string;
  code: string;
  name: string;
  unit: string;
  transfer_price_cents: number | null;
  active: boolean;
}

interface PaniniRow {
  id: string;
  code: string;
  name: string;
  cogs_cents: number;
  sell_cents: number;
}

interface PrepRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  cogs_cents: number;
  transfer_cents: number;
}

function usePaniniCosting(items: MenuItemLite[], asOf: string) {
  return useQuery({
    queryKey: ["costing_panini", asOf, items.map((i) => i.id).join(",")] as const,
    enabled: items.length > 0,
    queryFn: async () => {
      const out: PaniniRow[] = [];
      for (const m of items) {
        const { data, error } = await supabase.rpc("compute_cogs", {
          p_kind: "menu_item",
          p_id: m.id,
          p_as_of_date: asOf,
        });
        if (error) throw error;
        out.push({
          id: m.id,
          code: m.code,
          name: m.name,
          cogs_cents: Math.round(Number(data ?? 0) * 100),
          sell_cents: m.sell_price_cents,
        });
      }
      return out;
    },
  });
}

function usePrepCosting(items: PrepItemLite[], asOf: string) {
  return useQuery({
    queryKey: ["costing_prep", asOf, items.map((i) => i.id).join(",")] as const,
    enabled: items.length > 0,
    queryFn: async () => {
      const out: PrepRow[] = [];
      for (const p of items) {
        const [{ data: cogs, error: cogsErr }, { data: tp, error: tpErr }] =
          await Promise.all([
            supabase.rpc("compute_cogs", {
              p_kind: "prep_item",
              p_id: p.id,
              p_as_of_date: asOf,
            }),
            supabase.rpc("transfer_price_as_of", {
              p_prep_item_id: p.id,
              p_as_of_date: asOf,
            }),
          ]);
        if (cogsErr) throw cogsErr;
        if (tpErr) throw tpErr;
        out.push({
          id: p.id,
          code: p.code,
          name: p.name,
          unit: p.unit,
          cogs_cents: Math.round(Number(cogs ?? 0) * 100),
          transfer_cents: Math.round(Number(tp ?? 0) * 100),
        });
      }
      return out;
    },
  });
}

export default function CostingPage() {
  const [tab, setTab] = useState<Tab>("panini");
  const [asOf, setAsOf] = useState(todayISO());
  const { data: menuItemsRaw = [] } = useMenuItems();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const menuItems = (menuItemsRaw as MenuItemLite[]).filter((m) => m.active);
  const prepItems = (prepItemsRaw as PrepItemLite[]).filter((p) => p.active);

  return (
    <AppShell title="Costing">
      <Card className="mb-3">
        <CardContent className="flex flex-wrap items-center gap-2 pt-4">
          <Button
            size="sm"
            variant={tab === "panini" ? "default" : "outline"}
            onClick={() => setTab("panini")}
          >
            Panini margins
          </Button>
          <Button
            size="sm"
            variant={tab === "prep" ? "default" : "outline"}
            onClick={() => setTab("prep")}
          >
            Production costing
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-stone-500" htmlFor="costing-as-of">
              As of
            </label>
            <input
              id="costing-as-of"
              type="date"
              className="h-9 rounded border border-[var(--color-border)] bg-white px-2 text-sm"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {tab === "panini" ? (
        <PaniniMarginsCard items={menuItems} asOf={asOf} />
      ) : (
        <ProductionCostingCard items={prepItems} asOf={asOf} />
      )}
    </AppShell>
  );
}

function PaniniMarginsCard({
  items,
  asOf,
}: {
  items: MenuItemLite[];
  asOf: string;
}) {
  const { data: rows = [], isLoading } = usePaniniCosting(items, asOf);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ma = a.sell_cents > 0 ? (a.sell_cents - a.cogs_cents) / a.sell_cents : 0;
      const mb = b.sell_cents > 0 ? (b.sell_cents - b.cogs_cents) / b.sell_cents : 0;
      return ma - mb; // worst margin first
    });
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Panini margins</CardTitle>
        <CardDescription>
          Margin = sell − COGS (effective as of {asOf}). Worst first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <p className="text-sm text-stone-500">Computing…</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="px-1 py-1">Item</th>
                <th className="px-1 py-1 text-right">Sell</th>
                <th className="px-1 py-1 text-right">COGS</th>
                <th className="px-1 py-1 text-right">$ margin</th>
                <th className="px-1 py-1 text-right">% margin</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const margin = r.sell_cents - r.cogs_cents;
                const pct =
                  r.sell_cents > 0 ? margin / r.sell_cents : null;
                const loss = margin < 0;
                const low = !loss && pct != null && pct < 0.5;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="py-1 pr-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[10px] text-stone-500">
                        {r.code}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-right font-mono">
                      {centsToDollars(r.sell_cents)}
                    </td>
                    <td className="px-1 py-1 text-right font-mono">
                      {centsToDollars(r.cogs_cents)}
                    </td>
                    <td
                      className={`px-1 py-1 text-right font-mono ${
                        loss ? "text-red-700" : ""
                      }`}
                    >
                      {centsToDollars(margin)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {pct == null ? (
                        <span className="text-stone-400">—</span>
                      ) : loss ? (
                        <Badge variant="bad">{fmtPct(pct, 0)}</Badge>
                      ) : low ? (
                        <Badge variant="warn">{fmtPct(pct, 0)}</Badge>
                      ) : (
                        <Badge variant="ok">{fmtPct(pct, 0)}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionCostingCard({
  items,
  asOf,
}: {
  items: PrepItemLite[];
  asOf: string;
}) {
  const { data: rows = [], isLoading } = usePrepCosting(items, asOf);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const ma =
        a.transfer_cents > 0
          ? (a.transfer_cents - a.cogs_cents) / a.transfer_cents
          : 0;
      const mb =
        b.transfer_cents > 0
          ? (b.transfer_cents - b.cogs_cents) / b.transfer_cents
          : 0;
      return ma - mb;
    });
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production costing</CardTitle>
        <CardDescription>
          Per prep item — COGS vs effective transfer price as of {asOf}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-stone-500">Computing…</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="px-1 py-1">Item</th>
                <th className="px-1 py-1 text-right">Transfer</th>
                <th className="px-1 py-1 text-right">COGS</th>
                <th className="px-1 py-1 text-right">$ margin / unit</th>
                <th className="px-1 py-1 text-right">% margin</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const margin = r.transfer_cents - r.cogs_cents;
                const pct =
                  r.transfer_cents > 0 ? margin / r.transfer_cents : null;
                const loss = r.transfer_cents > 0 && margin < 0;
                const low = !loss && pct != null && pct > 0 && pct < 0.05;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="py-1 pr-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[10px] text-stone-500">
                        {r.code} · /{r.unit}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-right font-mono">
                      {r.transfer_cents === 0
                        ? "—"
                        : centsToDollars(r.transfer_cents)}
                    </td>
                    <td className="px-1 py-1 text-right font-mono">
                      {centsToDollars(r.cogs_cents)}
                    </td>
                    <td
                      className={`px-1 py-1 text-right font-mono ${
                        loss ? "text-red-700" : ""
                      }`}
                    >
                      {r.transfer_cents === 0
                        ? "—"
                        : centsToDollars(margin)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      {pct == null ? (
                        <span className="text-stone-400">—</span>
                      ) : loss ? (
                        <Badge variant="bad">{fmtPct(pct, 0)}</Badge>
                      ) : low ? (
                        <Badge variant="warn">{fmtPct(pct, 0)}</Badge>
                      ) : (
                        <Badge variant="ok">{fmtPct(pct, 0)}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* keep fmtQty import alive (used downstream if columns expand) */}
        <span className="hidden">{fmtQty(0)}</span>
      </CardContent>
    </Card>
  );
}
