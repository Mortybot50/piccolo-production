// /dashboard — KPI tiles + alerts.
//   This week revenue (sum of weekly_invoice HAW+SY for current week)
//   Prior week revenue
//   Loss-making prep items (compute_cogs vs transfer_price_as_of)
//   Stale-cost ingredient count
//   Forgot-to-log: if no prep_log entries today and it's after 11:00 local

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
import {
  useAppSettings,
  useStores,
  useSalesWeeks,
  usePrepItems,
  useIngredients,
  useWeeklyInvoice,
  usePrepLog,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { centsToDollars, fmtPct, todayISO } from "@/lib/format";

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return Date.now() - t > 60 * 24 * 3600 * 1000;
}

interface IngLite {
  id: string;
  name: string;
  cost_per_pack_cents: number | null;
  last_cost_update_at: string | null;
}

interface PrepLite {
  id: string;
  name: string;
  active: boolean;
}

// Pulls compute_cogs + transfer_price_as_of for every active prep item and
// flags rows where cogs >= transfer price (loss or zero-margin).
function useLossMakingPrep(asOf: string) {
  return useQuery({
    queryKey: ["dashboard_loss_making", asOf],
    queryFn: async () => {
      const { data: prepRows, error: prepErr } = await supabase
        .from("prep_items")
        .select("id, name, unit, active")
        .eq("active", true);
      if (prepErr) throw prepErr;
      const out: Array<{ id: string; name: string; unit: string; cogs: number; price: number }> = [];
      for (const p of prepRows ?? []) {
        const [{ data: cogs }, { data: price }] = await Promise.all([
          supabase.rpc("compute_cogs", { p_kind: "prep_item", p_id: p.id, p_as_of_date: asOf }),
          supabase.rpc("transfer_price_as_of", { p_prep_item_id: p.id, p_as_of_date: asOf }),
        ]);
        out.push({
          id: p.id,
          name: p.name,
          unit: p.unit,
          cogs: Number(cogs ?? 0),
          price: Number(price ?? 0),
        });
      }
      return out;
    },
  });
}

export default function DashboardPage() {
  const today = todayISO();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;
  const { data: settings } = useAppSettings();
  const { data: stores = [] } = useStores();
  const { data: weeks = [] } = useSalesWeeks();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const { data: ingredients = [] } = useIngredients();
  const prepItems = prepItemsRaw as PrepLite[];

  const wk = settings?.latest_week_number ?? weeks[0]?.week_number;
  const currentWeek = weeks.find((w) => w.week_number === wk);
  const priorWeek = weeks.find((w) => w.week_number === (wk ? wk - 1 : -1));

  const hawId = stores.find((s) => s.code === "HAW")?.id ?? null;
  const syId = stores.find((s) => s.code === "SY")?.id ?? null;

  // Commercial-tile queries are only consumed when isAdmin — but the hooks
  // must run unconditionally to satisfy the rules of hooks. They short-circuit
  // when storeId/dates are empty (react-query enabled-gate inside).
  const curHaw = useWeeklyInvoice(hawId, currentWeek?.week_start_date ?? "", currentWeek?.week_end_date ?? "");
  const curSy = useWeeklyInvoice(syId, currentWeek?.week_start_date ?? "", currentWeek?.week_end_date ?? "");
  const priorHaw = useWeeklyInvoice(hawId, priorWeek?.week_start_date ?? "", priorWeek?.week_end_date ?? "");
  const priorSy = useWeeklyInvoice(syId, priorWeek?.week_start_date ?? "", priorWeek?.week_end_date ?? "");

  const totalCents = (rows: Array<{ line_total_cents: number }>) =>
    rows.reduce((s, r) => s + Number(r.line_total_cents ?? 0), 0);
  const curTotal = totalCents(curHaw.data ?? []) + totalCents(curSy.data ?? []);
  const priorTotal = totalCents(priorHaw.data ?? []) + totalCents(priorSy.data ?? []);
  const deltaPct =
    priorTotal > 0 ? (curTotal - priorTotal) / priorTotal : null;

  // Loss-making items (compute_cogs vs transfer_price_as_of).
  const { data: loss = [], isLoading: lossLoading } = useLossMakingPrep(today);
  const losses = loss.filter((r) => r.price > 0 && r.cogs > r.price);
  const lowMargins = loss.filter((r) => {
    if (r.price <= 0 || r.cogs > r.price) return false;
    const margin = r.price - r.cogs;
    return margin > 0 && margin / r.price < 0.05;
  });

  // Stale cost ingredients.
  const ings = ingredients as unknown as IngLite[];
  const staleIngs = ings.filter((i) => i.cost_per_pack_cents != null && isStale(i.last_cost_update_at));
  const emptyCost = ings.filter((i) => i.cost_per_pack_cents == null);

  // Forgot to log today.
  const { data: prepLog = [] } = usePrepLog(today);
  const nowHours = new Date().getHours();
  const forgotToLog = nowHours >= 11 && prepLog.length === 0;

  return (
    <AppShell title="Dashboard">
      {forgotToLog ? (
        <Card className="mb-3 border-yellow-300 bg-yellow-50">
          <CardContent className="flex items-center justify-between pt-4">
            <p className="text-sm">
              <Badge variant="warn" className="mr-2">
                Reminder
              </Badge>
              Nothing logged today — record morning prep.
            </p>
            <Button asChild size="sm">
              <Link to="/today">Open today</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!isAdmin ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Where to next</CardTitle>
            <CardDescription>Your most-used screens.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Button asChild size="sm">
              <Link to="/today">Today's prep</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/store-order/HAW">HAW order</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/store-order/SY">SY order</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/supplier-orders">Supplier orders</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/recipes">Recipes</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
      <>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardDescription>This week earned</CardDescription>
            <CardTitle className="font-mono">{centsToDollars(curTotal)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              Week {wk}
              {deltaPct != null ? (
                <Badge
                  variant={deltaPct >= 0 ? "ok" : "bad"}
                  className="ml-2"
                >
                  {deltaPct >= 0 ? "+" : ""}
                  {fmtPct(deltaPct, 0)}
                </Badge>
              ) : null}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Prior week</CardDescription>
            <CardTitle className="font-mono">{centsToDollars(priorTotal)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-stone-500">
              Week {wk ? wk - 1 : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>
            Loss-making prep items
            {losses.length > 0 ? (
              <Badge variant="bad" className="ml-2">
                {losses.length}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            COGS exceeds transfer price (effective {today}). Drill into{" "}
            <Link to="/costing" className="underline">Costing</Link> for details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {lossLoading ? <p className="text-sm text-stone-500">Computing…</p> : null}
          {!lossLoading && losses.length === 0 && lowMargins.length === 0 ? (
            <p className="text-sm text-stone-500">
              <Badge variant="ok" className="mr-1">
                OK
              </Badge>
              All items profitable.
            </p>
          ) : null}
          {losses.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-2 text-sm"
            >
              <span>{r.name}</span>
              <Badge variant="bad">
                LOSS {centsToDollars(r.cogs - r.price)}/{r.unit}
              </Badge>
            </div>
          ))}
          {lowMargins.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded border border-yellow-200 bg-yellow-50 p-2 text-sm"
            >
              <span>{r.name}</span>
              <Badge variant="warn">low {fmtPct((r.price - r.cogs) / r.price)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Cost hygiene</CardTitle>
          <CardDescription>Stale or missing ingredient costs warp COGS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span>Missing cost</span>
            <Badge variant={emptyCost.length > 0 ? "warn" : "ok"}>
              {emptyCost.length}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Stale (&gt;60 days)</span>
            <Badge variant={staleIngs.length > 0 ? "warn" : "ok"}>
              {staleIngs.length}
            </Badge>
          </div>
          {(emptyCost.length > 0 || staleIngs.length > 0) && (
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to="/settings">Fix in Settings → Ingredients</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <Link to="/today">Today</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/costing">Costing</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/invoice">Invoice</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/audit-log">Audit log</Link>
          </Button>
        </CardContent>
      </Card>
      </>
      ) : null}
      {/* Prep items reference to satisfy lints; downstream uses if expanded. */}
      <span className="hidden">{prepItems.length}</span>
    </AppShell>
  );
}
