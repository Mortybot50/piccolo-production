// CountRow — the per-item count input used by the Stocktake flow.
// Pulled out of Stocktake.tsx so it can be shared with the per-supplier
// stocktake-then-order page.
//
// Each row shows the item name, "last counted N days ago", optional par badge,
// a numeric input with +/- steppers, a unit picker (same-family conversions),
// and a Save button. Below-par rows go red.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toCanonical, unitOptionsFor } from "@/lib/units";

export interface CountItem {
  id: string;
  name: string;
  /** Canonical unit (kg / L / pcs / g / ml / bunch / egg / roll). */
  unit: string;
  par_qty: number | null;
}

export interface LatestCount {
  id: string;
  count_date: string;
  qty_on_hand: number;
  input_qty: number | null;
  input_unit: string | null;
}

export interface CountSavePayload {
  itemId: string;
  count_date: string;
  qty_on_hand: number;
  input_qty: number;
  input_unit: string;
  par_qty_snapshot: number | null;
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Math.floor((Date.now() - t) / (24 * 3600 * 1000));
}

function stalenessLabel(days: number | null): string {
  if (days == null) return "never counted";
  if (days === 0) return "counted today";
  if (days === 1) return "counted yesterday";
  return `${days} days ago`;
}

export function CountRow({
  item,
  date,
  latest,
  onSave,
  saving,
}: {
  item: CountItem;
  date: string;
  latest: LatestCount | undefined;
  onSave: (payload: CountSavePayload) => Promise<void>;
  saving: boolean;
}) {
  const options = useMemo(() => unitOptionsFor(item.unit), [item.unit]);
  const initialUnit =
    latest?.count_date === date && latest.input_unit
      ? latest.input_unit
      : item.unit;
  const initialQty =
    latest?.count_date === date
      ? String(latest.input_qty ?? latest.qty_on_hand)
      : "";

  const [qty, setQty] = useState(initialQty);
  const [unit, setUnit] = useState(initialUnit);
  const [savedAt, setSavedAt] = useState<string | null>(
    latest?.count_date === date ? "saved" : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (latest?.count_date === date) {
      setQty(String(latest.input_qty ?? latest.qty_on_hand));
      setUnit(latest.input_unit ?? item.unit);
      setSavedAt("saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, date]);

  const numQty = parseFloat(qty);
  const canonical = useMemo(() => {
    if (!Number.isFinite(numQty)) return null;
    return toCanonical(numQty, unit, item.unit);
  }, [numQty, unit, item.unit]);

  const conversionBad =
    qty !== "" && Number.isFinite(numQty) && canonical == null;
  const belowPar =
    canonical != null && item.par_qty != null && canonical < item.par_qty;

  const lastDays = daysAgo(latest?.count_date);
  const lastLabel = stalenessLabel(lastDays);

  function step(delta: number) {
    const cur = parseFloat(qty);
    const next = Number.isFinite(cur) ? cur + delta : delta;
    setQty(next.toString());
    setSavedAt(null);
  }

  async function save() {
    if (!Number.isFinite(numQty)) return;
    if (canonical == null) return;
    if (numQty < 0) return;
    await onSave({
      itemId: item.id,
      count_date: date,
      qty_on_hand: canonical,
      input_qty: numQty,
      input_unit: unit,
      par_qty_snapshot: item.par_qty,
    });
    setSavedAt("saved");
  }

  return (
    <div
      className={
        belowPar
          ? "rounded-lg border border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)]/40 p-3"
          : "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
      }
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-[11px] text-[var(--color-fg-soft)]">
            {item.par_qty != null
              ? `par ${item.par_qty} ${item.unit} · ${lastLabel}`
              : lastLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {belowPar ? (
            <Badge variant="bad">
              <AlertCircle className="mr-0.5 h-3 w-3" /> Below par
            </Badge>
          ) : savedAt === "saved" ? (
            <Badge variant="ok">Saved</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="decrease"
          className="h-11 w-10 shrink-0 px-0"
          onClick={() => step(item.unit === "kg" || item.unit === "L" ? -0.5 : -1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value.replace(/[^0-9.]/g, ""));
            setSavedAt(null);
          }}
          placeholder="0"
          className="h-11 flex-1 min-w-0 text-center text-base tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="increase"
          className="h-11 w-10 shrink-0 px-0"
          onClick={() => step(item.unit === "kg" || item.unit === "L" ? 0.5 : 1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <select
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            setSavedAt(null);
          }}
          className="h-11 w-16 shrink-0 rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1 text-sm"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex items-center justify-end">
        <Button
          size="sm"
          disabled={
            saving ||
            qty === "" ||
            (savedAt === "saved" &&
              unit === (latest?.input_unit ?? item.unit) &&
              numQty === Number(latest?.input_qty ?? NaN))
          }
          onClick={() => void save()}
          className="h-9 px-5"
        >
          Save
        </Button>
      </div>
      {conversionBad ? (
        <p className="mt-1 text-[11px] text-[var(--color-bad)]">
          Can't convert {unit} → {item.unit}. Pick a compatible unit.
        </p>
      ) : canonical != null && unit !== item.unit ? (
        <p className="mt-1 text-[11px] text-[var(--color-fg-soft)]">
          ≈ {canonical.toFixed(canonical % 1 === 0 ? 0 : 2)} {item.unit}
        </p>
      ) : null}
    </div>
  );
}
