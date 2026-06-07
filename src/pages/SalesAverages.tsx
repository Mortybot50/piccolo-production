// /sales-averages — rolling 4wk panini × weekday × store matrix + combined view.
// "The brain of the demand model" — Damian/Jonny flip here to sanity-check the forecast.

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
import {
  useAppSettings,
  useStores,
  useMenuItems,
  useSalesAverages,
} from "@/lib/queries";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface MenuRow {
  id: string;
  code: string;
  name: string;
}

interface AvgRow {
  menu_item_id: string;
  weekday: string;
  avg_qty: number | string;
}

function rowsToMatrix(rows: AvgRow[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!map.has(r.menu_item_id)) map.set(r.menu_item_id, new Map());
    map.get(r.menu_item_id)!.set(r.weekday, Number(r.avg_qty ?? 0));
  }
  return map;
}

function num(x: number | undefined) {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toFixed(1);
}

export default function SalesAveragesPage() {
  const { data: settings } = useAppSettings();
  const { data: stores = [] } = useStores();
  const { data: menuItems = [] } = useMenuItems();
  const [view, setView] = useState<"combined" | "haw" | "sy">("combined");

  const wk = settings?.latest_week_number ?? null;
  const window_weeks = (settings as { window_weeks?: number } | undefined)
    ?.window_weeks ?? 4;
  const use_median = (settings as { use_median?: boolean } | undefined)
    ?.use_median ?? false;

  const hawId = stores.find((s) => s.code === "HAW")?.id ?? null;
  const syId = stores.find((s) => s.code === "SY")?.id ?? null;

  const haw = useSalesAverages(hawId, wk);
  const sy = useSalesAverages(syId, wk);

  const hawMatrix = useMemo(() => rowsToMatrix((haw.data ?? []) as AvgRow[]), [haw.data]);
  const syMatrix = useMemo(() => rowsToMatrix((sy.data ?? []) as AvgRow[]), [sy.data]);

  const combinedMatrix = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const matrix of [hawMatrix, syMatrix]) {
      for (const [miId, perDay] of matrix.entries()) {
        if (!out.has(miId)) out.set(miId, new Map());
        for (const [d, q] of perDay.entries()) {
          out.get(miId)!.set(d, (out.get(miId)!.get(d) ?? 0) + q);
        }
      }
    }
    return out;
  }, [hawMatrix, syMatrix]);

  const matrix =
    view === "combined" ? combinedMatrix : view === "haw" ? hawMatrix : syMatrix;
  const loading = haw.isLoading || sy.isLoading;

  return (
    <AppShell title="Sales averages">
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>
            Rolling {window_weeks}-week {use_median ? "median" : "average"}
          </CardTitle>
          <CardDescription>
            Drives every forecast in the app. Tweak the window or which weeks count
            in Settings → Global / Forecast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <ViewToggle current={view} onChange={setView} />
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Latest week: <strong>{wk ?? "—"}</strong> • Window includes weeks{" "}
            {wk ? `${wk - window_weeks + 1} → ${wk}` : "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Panini —{" "}
            {view === "combined" ? "HAW + SY combined" : view === "haw" ? "HAW only" : "SY only"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {!loading ? (
            <table className="min-w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-stone-500">
                  <th className="px-2 py-1 text-left text-xs font-medium uppercase">
                    Panini
                  </th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className="px-2 py-1 text-right text-xs font-medium uppercase">
                      {d}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right text-xs font-medium uppercase">
                    Weekly
                  </th>
                </tr>
              </thead>
              <tbody>
                {(menuItems as MenuRow[]).map((m) => {
                  const perDay = matrix.get(m.id) ?? new Map<string, number>();
                  const weekly = WEEKDAYS.reduce(
                    (s, d) => s + (perDay.get(d) ?? 0),
                    0,
                  );
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--color-border)] last:border-b-0"
                    >
                      <td className="px-2 py-1 text-sm">{m.name}</td>
                      {WEEKDAYS.map((d) => (
                        <td key={d} className="px-2 py-1 text-right text-sm">
                          {num(perDay.get(d))}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right text-sm font-medium">
                        {weekly > 0 ? weekly.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-stone-500">
        <Badge variant="outline" className="mr-1">
          Tip
        </Badge>
        Weeks marked excluded in Settings → Forecast weeks don't count toward this
        average — so a closure week won't drag the forecast down.
      </p>
    </AppShell>
  );
}

function ViewToggle({
  current,
  onChange,
}: {
  current: "combined" | "haw" | "sy";
  onChange: (v: "combined" | "haw" | "sy") => void;
}) {
  const tabs: Array<{ id: "combined" | "haw" | "sy"; label: string }> = [
    { id: "combined", label: "Combined" },
    { id: "haw", label: "HAW" },
    { id: "sy", label: "SY" },
  ];
  return (
    <div className="flex gap-1 rounded-md border border-[var(--color-border)] bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={
            current === t.id
              ? "rounded bg-[var(--color-brand-600)] px-3 py-1 text-xs font-medium text-white"
              : "rounded px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
