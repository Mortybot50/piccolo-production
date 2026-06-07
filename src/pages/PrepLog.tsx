// /prep-log — browse historical prep_log entries, fix a missed day inline,
// see which days have zero entries.

import { useMemo, useState } from "react";
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
import {
  usePrepItems,
  usePrepLogRange,
  useUsersList,
} from "@/lib/queries";
import { addDaysISO, fmtQty, todayISO } from "@/lib/format";

interface LogRow {
  id: string;
  log_date: string;
  prep_item_id: string;
  qty_prepped: number;
  qty_sent_haw: number;
  qty_sent_sy: number;
  qty_kept: number;
  notes: string | null;
  prepped_by_user_id: string | null;
}

interface PrepRow {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface UserRow {
  id: string;
  display_name: string;
}

function daysBack(n: number): string[] {
  const today = todayISO();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(addDaysISO(today, -i));
  }
  return out;
}

export default function PrepLogPage() {
  const [endDate, setEndDate] = useState(todayISO());
  const [days, setDays] = useState(30);
  const [prepFilter, setPrepFilter] = useState<string>("all");

  const startDate = addDaysISO(endDate, -(days - 1));

  const { data: rows = [], isLoading } = usePrepLogRange(startDate, endDate);
  const { data: prepItems = [] } = usePrepItems();
  const { data: users = [] } = useUsersList();

  const prepByID = useMemo(() => {
    const m = new Map<string, PrepRow>();
    for (const p of prepItems as PrepRow[]) m.set(p.id, p);
    return m;
  }, [prepItems]);

  const userByID = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users as UserRow[]) m.set(u.id, u);
    return m;
  }, [users]);

  const filtered = (rows as LogRow[]).filter(
    (r) => prepFilter === "all" || r.prep_item_id === prepFilter,
  );

  // Missed days: any day in the window with zero log rows.
  const datesWithEntries = new Set((rows as LogRow[]).map((r) => r.log_date));
  const allDates = useMemo(() => daysBack(days), [days]);
  const missedDays = allDates.filter((d) => !datesWithEntries.has(d));

  return (
    <AppShell title="Prep log">
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Show prep runs in a date window.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-stone-500">End date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-stone-500">Window</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500">Prep item</label>
              <select
                value={prepFilter}
                onChange={(e) => setPrepFilter(e.target.value)}
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
              >
                <option value="all">All</option>
                {(prepItems as PrepRow[]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {missedDays.length > 0 ? (
        <Card className="mb-3 border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-base">
              Missed days{" "}
              <Badge variant="warn" className="ml-2">
                {missedDays.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Days in this window with zero log entries. Open Today on that date
              to backfill.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {missedDays.slice(0, 14).map((d) => (
              <Badge key={d} variant="warn">
                {d}
              </Badge>
            ))}
            {missedDays.length > 14 ? (
              <Badge variant="outline">+{missedDays.length - 14} more</Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Entries{" "}
            <Badge variant="outline" className="ml-1">
              {filtered.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            {startDate} → {endDate}. Click a row's date to open the Today page
            for that date.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {!isLoading && filtered.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nothing logged in this window
              {prepFilter !== "all" ? " for the selected item" : ""}.
            </p>
          ) : null}
          {filtered.length > 0 ? (
            <table className="min-w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-stone-500">
                  <th className="px-2 py-1 text-left text-xs font-medium uppercase">
                    Date
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium uppercase">
                    Item
                  </th>
                  <th className="px-2 py-1 text-right text-xs font-medium uppercase">
                    Prepped
                  </th>
                  <th className="px-2 py-1 text-right text-xs font-medium uppercase">
                    HAW
                  </th>
                  <th className="px-2 py-1 text-right text-xs font-medium uppercase">
                    SY
                  </th>
                  <th className="px-2 py-1 text-right text-xs font-medium uppercase">
                    Kept
                  </th>
                  <th className="px-2 py-1 text-left text-xs font-medium uppercase">
                    By
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const p = prepByID.get(r.prep_item_id);
                  const u = r.prepped_by_user_id
                    ? userByID.get(r.prepped_by_user_id)
                    : null;
                  const unit = p?.unit ?? "";
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--color-border)] last:border-b-0"
                    >
                      <td className="px-2 py-1 text-sm">
                        <Link
                          to={`/today?d=${r.log_date}`}
                          className="text-[var(--color-brand-600)] underline"
                        >
                          {r.log_date}
                        </Link>
                      </td>
                      <td className="px-2 py-1 text-sm">{p?.name ?? r.prep_item_id}</td>
                      <td className="px-2 py-1 text-right text-sm font-medium">
                        {fmtQty(r.qty_prepped)} {unit}
                      </td>
                      <td className="px-2 py-1 text-right text-sm">
                        {fmtQty(r.qty_sent_haw)}
                      </td>
                      <td className="px-2 py-1 text-right text-sm">
                        {fmtQty(r.qty_sent_sy)}
                      </td>
                      <td className="px-2 py-1 text-right text-sm text-stone-500">
                        {fmtQty(r.qty_kept)}
                      </td>
                      <td className="px-2 py-1 text-xs text-stone-500">
                        {u?.display_name ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/today">Back to Today</Link>
        </Button>
      </div>
    </AppShell>
  );
}
