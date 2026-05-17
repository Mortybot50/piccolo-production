// /dashboard — KPI tiles + alerts.
//   This week revenue (sum of weekly_invoice HAW+SY for current week)
//   Prior week revenue
//   Production P&L summary (loss alerts, low-margin alerts)
//   Stale-cost ingredient count
//   Forgot-to-log: if no prep_log entries today and it's after 11:00 local

import { useMemo } from "react";
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
  useProductionPnl,
  usePrepLog,
} from "@/lib/queries";
import {
  centsToDollars,
  fmtPct,
  fmtQty,
  todayISO,
  addDaysISO,
} from "@/lib/format";

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

interface PnlRow {
  prep_item_id: string;
  qty_produced: number;
  qty_sent_total: number;
  computed_cogs_per_unit_cents: number;
  transfer_price_cents: number;
  margin_per_unit_cents: number;
  margin_pct: number | null;
}

export default function DashboardPage() {
  const { data: settings } = useAppSettings();
  const { data: stores = [] } = useStores();
  const { data: weeks = [] } = useSalesWeeks();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const { data: ingredients = [] } = useIngredients();
  const prepItems = prepItemsRaw as Array<{ id: string; name: string }>;
  const prepNameById = new Map(prepItems.map((p) => [p.id, p.name]));

  const wk = settings?.latest_week_number ?? weeks[0]?.week_number;
  const currentWeek = weeks.find((w) => w.week_number === wk);
  const priorWeek = weeks.find((w) => w.week_number === (wk ? wk - 1 : -1));

  const hawId = stores.find((s) => s.code === "HAW")?.id ?? null;
  const syId = stores.find((s) => s.code === "SY")?.id ?? null;

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

  // P&L last 30 days for margin alerts.
  const start = addDaysISO(todayISO(), -30);
  const { data: pnl = [] } = useProductionPnl(start, todayISO());
  const pnlRows = pnl as PnlRow[];
  const losses = pnlRows.filter(
    (r) => r.transfer_price_cents > 0 && Number(r.margin_per_unit_cents) < 0
  );
  const lowMargins = pnlRows.filter(
    (r) =>
      r.transfer_price_cents > 0 &&
      Number(r.margin_per_unit_cents) >= 0 &&
      r.margin_pct != null &&
      Number(r.margin_pct) < 0.05
  );

  // Stale cost ingredients.
  const ings = ingredients as unknown as IngLite[];
  const staleIngs = ings.filter((i) => i.cost_per_pack_cents != null && isStale(i.last_cost_update_at));
  const emptyCost = ings.filter((i) => i.cost_per_pack_cents == null);

  // Forgot to log today.
  const { data: prepLog = [] } = usePrepLog(todayISO());
  const nowHours = new Date().getHours();
  const forgotToLog = nowHours >= 11 && prepLog.length === 0;

  // Top movers (qty_sent_total, top 5).
  const topMovers = useMemo(
    () =>
      [...pnlRows]
        .sort((a, b) => Number(b.qty_sent_total) - Number(a.qty_sent_total))
        .slice(0, 5),
    [pnlRows]
  );

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

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardDescription>This week revenue</CardDescription>
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
          <CardTitle>Margin alerts (last 30d)</CardTitle>
          <CardDescription>
            Losses + low-margin items computed against current ingredient costs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {losses.length === 0 && lowMargins.length === 0 ? (
            <p className="text-sm text-stone-500">
              <Badge variant="ok" className="mr-1">
                OK
              </Badge>
              All items profitable.
            </p>
          ) : null}
          {losses.map((r) => (
            <div
              key={r.prep_item_id}
              className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-2 text-sm"
            >
              <span>{prepNameById.get(r.prep_item_id) ?? r.prep_item_id}</span>
              <Badge variant="bad">
                LOSS {centsToDollars(r.margin_per_unit_cents)}/u
              </Badge>
            </div>
          ))}
          {lowMargins.map((r) => (
            <div
              key={r.prep_item_id}
              className="flex items-center justify-between rounded border border-yellow-200 bg-yellow-50 p-2 text-sm"
            >
              <span>{prepNameById.get(r.prep_item_id) ?? r.prep_item_id}</span>
              <Badge variant="warn">low {fmtPct(r.margin_pct)}</Badge>
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
          <CardTitle>Top movers (last 30d)</CardTitle>
          <CardDescription>By total sent to stores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {topMovers.map((r) => (
            <div
              key={r.prep_item_id}
              className="flex items-center justify-between border-b border-stone-100 py-1 last:border-b-0"
            >
              <span>{prepNameById.get(r.prep_item_id) ?? r.prep_item_id}</span>
              <span className="font-mono text-xs text-stone-600">
                {fmtQty(r.qty_sent_total)} sent · margin{" "}
                {fmtPct(r.margin_pct)}
              </span>
            </div>
          ))}
          {topMovers.length === 0 ? (
            <p className="text-stone-500">No data yet — log some prep.</p>
          ) : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
