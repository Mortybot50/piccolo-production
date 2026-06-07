import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { useSalesWeeks, useUpdateSalesWeekExclusion } from "@/lib/queries";

interface WeekRow {
  id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  exclude_from_avg?: boolean;
}

export function ForecastCard() {
  const { data = [], isLoading } = useSalesWeeks();
  const update = useUpdateSalesWeekExclusion();

  const rows = data.slice(0, 12) as WeekRow[];

  function onToggle(row: WeekRow, checked: boolean) {
    update
      .mutateAsync({ id: row.id, exclude_from_avg: checked })
      .then(() =>
        toast.success(
          `Week ${row.week_number} ${checked ? "excluded from" : "included in"} averages`,
        ),
      )
      .catch((e: Error) => toast.error(`Save failed: ${e.message}`));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast weeks</CardTitle>
        <CardDescription>
          Tick a week to drop it from the rolling averages (closures, public
          holidays, catering-spike weeks).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-stone-500">
            No sales weeks yet. Once you start entering sales they'll appear here.
          </p>
        ) : null}
        {rows.map((w) => {
          const excluded = !!w.exclude_from_avg;
          return (
            <label
              key={w.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-white px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={excluded}
                  onChange={(e) => onToggle(w, e.target.checked)}
                  disabled={update.isPending}
                />
                <div>
                  <p className="text-sm font-medium">Week {w.week_number}</p>
                  <p className="text-xs text-stone-500">
                    {w.week_start_date} → {w.week_end_date}
                  </p>
                </div>
              </div>
              {excluded ? (
                <Badge variant="warn">Excluded</Badge>
              ) : (
                <Badge variant="outline">In average</Badge>
              )}
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}
