import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useMenuItems, useUpdateMenuItemSplits } from "@/lib/queries";

interface MenuRow {
  id: string;
  code: string;
  name: string;
  haw_split_pct: number;
  sy_split_pct: number;
}

export function MenuItemSplitsCard() {
  const { data = [], isLoading } = useMenuItems();
  const update = useUpdateMenuItemSplits();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store splits</CardTitle>
        <CardDescription>
          Per panini, what % of weekly volume goes through HAW vs SY. Drives the
          daily prep plan + store-order recommendation. HAW + SY should sum to 1.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
        {(data as MenuRow[]).map((m) => (
          <SplitRow
            key={m.id}
            row={m}
            onSave={(haw, sy) =>
              update
                .mutateAsync({ id: m.id, haw_split_pct: haw, sy_split_pct: sy })
                .then(() => toast.success(`${m.name} splits saved`))
                .catch((e: Error) => toast.error(`Save failed: ${e.message}`))
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SplitRow({
  row,
  onSave,
}: {
  row: MenuRow;
  onSave: (haw: number, sy: number) => void;
}) {
  const [haw, setHaw] = useState(row.haw_split_pct);
  const [sy, setSy] = useState(row.sy_split_pct);

  useEffect(() => {
    setHaw(row.haw_split_pct);
    setSy(row.sy_split_pct);
  }, [row.haw_split_pct, row.sy_split_pct]);

  const dirty =
    haw !== row.haw_split_pct || sy !== row.sy_split_pct;
  const sum = haw + sy;
  const sumOff = Math.abs(sum - 1) > 0.005;

  return (
    <div className="space-y-2 border-b border-[var(--color-border)] pb-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{row.name}</p>
        {sumOff ? (
          <span className="text-xs text-amber-700">
            Sum: {(sum * 100).toFixed(1)}% (not 100)
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-500">
          HAW
          <Input
            type="number"
            step="0.001"
            min="0"
            max="1"
            inputMode="decimal"
            value={haw}
            onChange={(e) => setHaw(parseFloat(e.target.value) || 0)}
          />
        </label>
        <label className="text-xs text-stone-500">
          SY
          <Input
            type="number"
            step="0.001"
            min="0"
            max="1"
            inputMode="decimal"
            value={sy}
            onChange={(e) => setSy(parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>
      <Button
        size="sm"
        disabled={!dirty}
        onClick={() => onSave(haw, sy)}
      >
        Save
      </Button>
    </div>
  );
}
