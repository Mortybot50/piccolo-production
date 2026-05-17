import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useAppSettings, useUpdateAppSettings } from "@/lib/queries";

export function GlobalSettingsCard() {
  const { data, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [week, setWeek] = useState("");
  const [buffer, setBuffer] = useState("");
  const [waste, setWaste] = useState("");

  useEffect(() => {
    if (!data) return;
    setWeek(String(data.latest_week_number));
    setBuffer(String(data.buffer_pct));
    setWaste(String(data.waste_threshold_pct));
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
        <Button onClick={() => void onSave()} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
