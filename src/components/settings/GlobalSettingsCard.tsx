import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAppSettings, useUpdateAppSettings } from "@/lib/queries";

const WINDOW_OPTIONS = [2, 4, 6, 8];

export function GlobalSettingsCard() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [week, setWeek] = useState("");
  const [buffer, setBuffer] = useState("");
  const [waste, setWaste] = useState("");
  const [windowWeeks, setWindowWeeks] = useState<number>(4);
  const [useMedian, setUseMedian] = useState<boolean>(false);

  useEffect(() => {
    if (!data) return;
    setWeek(String(data.latest_week_number));
    setBuffer(String(data.buffer_pct));
    setWaste(String(data.waste_threshold_pct));
    setWindowWeeks((data.window_weeks as number | undefined) ?? 4);
    setUseMedian((data.use_median as boolean | undefined) ?? false);
  }, [data]);

  if (isLoading || !data) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  async function onSave() {
    try {
      await update.mutateAsync({
        latest_week_number: parseInt(week, 10),
        buffer_pct: parseFloat(buffer),
        waste_threshold_pct: parseFloat(waste),
        window_weeks: windowWeeks,
        use_median: useMedian,
      });
      toast.success("Global settings saved");
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="week">Latest week number</Label>
          <Input
            id="week"
            type="number"
            inputMode="numeric"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-500">
            Auto-advances Monday 03:00 AEST via pg_cron.
          </p>
        </div>
        <div>
          <Label htmlFor="buffer">Buffer %</Label>
          <Input
            id="buffer"
            type="number"
            step="0.01"
            min="0"
            max="1"
            inputMode="decimal"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-500">Use 0.10 for 10%.</p>
        </div>
        <div>
          <Label htmlFor="waste">Waste threshold %</Label>
          <Input
            id="waste"
            type="number"
            step="0.01"
            min="0"
            max="1"
            inputMode="decimal"
            value={waste}
            onChange={(e) => setWaste(e.target.value)}
          />
        </div>
        <div className="border-t border-[var(--color-border)] pt-4">
          <Label>Forecast window</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map((w) => (
              <Button
                key={w}
                type="button"
                size="sm"
                variant={windowWeeks === w ? "default" : "outline"}
                onClick={() => setWindowWeeks(w)}
              >
                {w} weeks
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Rolling window for sales averages. Default 4.
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useMedian}
              onChange={(e) => setUseMedian(e.target.checked)}
              className="h-4 w-4"
            />
            Use median instead of mean
          </label>
          <p className="mt-1 text-xs text-stone-500">
            Better when a catering spike skews one week.
          </p>
        </div>
        <Button onClick={() => void onSave()} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
