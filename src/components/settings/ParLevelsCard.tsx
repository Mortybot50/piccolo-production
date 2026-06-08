import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  usePrepItems,
  useIngredients,
  useSuppliers,
  useUpdatePrepItemPar,
  useUpdateIngredientPar,
} from "@/lib/queries";

interface PrepRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  par_qty: number | null;
  active?: boolean;
}

interface IngRow {
  id: string;
  code: string;
  name: string;
  pack_unit: string | null;
  par_qty: number | null;
  supplier_id: string | null;
}

interface SupplierRow {
  id: string;
  code: string;
  name: string;
}

export function ParLevelsCard() {
  const { data: prepItems = [], isLoading: prepLoading } = usePrepItems();
  const { data: ingredients = [], isLoading: ingLoading } = useIngredients();
  const { data: suppliers = [] } = useSuppliers();
  const updatePrep = useUpdatePrepItemPar();
  const updateIng = useUpdateIngredientPar();

  const activePrep = (prepItems as PrepRow[]).filter((p) => p.active !== false);
  const prepMissing = activePrep.filter((p) => p.par_qty == null).length;
  const ingMissing = (ingredients as IngRow[]).filter(
    (i) => i.par_qty == null,
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Prep item par levels</CardTitle>
              <CardDescription>
                Target on-hand qty. Stocktake flags anything below par.
              </CardDescription>
            </div>
            <Badge variant={prepMissing > 0 ? "warn" : "ok"}>
              {prepMissing > 0 ? `${prepMissing} blank` : "all set"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {prepLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {activePrep
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <ParRow
                key={p.id}
                name={p.name}
                unit={p.unit}
                par_qty={p.par_qty}
                onSave={(par) =>
                  updatePrep
                    .mutateAsync({ id: p.id, par_qty: par })
                    .then(() => toast.success(`${p.name} par saved`))
                    .catch((e: Error) => toast.error(`Save failed: ${e.message}`))
                }
              />
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Ingredient par levels</CardTitle>
              <CardDescription>
                Target on-hand qty per ingredient. Drives the "below par" flag
                on the stocktake page.
              </CardDescription>
            </div>
            <Badge variant={ingMissing > 0 ? "warn" : "ok"}>
              {ingMissing > 0 ? `${ingMissing} blank` : "all set"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {ingLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {(suppliers as SupplierRow[])
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((s) => {
              const items = (ingredients as IngRow[])
                .filter((i) => i.supplier_id === s.id)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (items.length === 0) return null;
              return (
                <div key={s.id} className="space-y-1">
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-soft)]">
                    {s.code} · {s.name}
                  </p>
                  {items.map((i) => (
                    <ParRow
                      key={i.id}
                      name={i.name}
                      unit={i.pack_unit ?? "ea"}
                      par_qty={i.par_qty}
                      onSave={(par) =>
                        updateIng
                          .mutateAsync({ id: i.id, par_qty: par })
                          .then(() => toast.success(`${i.name} par saved`))
                          .catch((e: Error) =>
                            toast.error(`Save failed: ${e.message}`),
                          )
                      }
                    />
                  ))}
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}

function ParRow({
  name,
  unit,
  par_qty,
  onSave,
}: {
  name: string;
  unit: string;
  par_qty: number | null;
  onSave: (par: number | null) => void;
}) {
  const [val, setVal] = useState(par_qty == null ? "" : String(par_qty));

  useEffect(() => {
    setVal(par_qty == null ? "" : String(par_qty));
  }, [par_qty]);

  const dirty = (par_qty == null ? "" : String(par_qty)) !== val;
  const parsed = val === "" ? null : parseFloat(val);
  const invalid = val !== "" && !Number.isFinite(parsed);

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2">
      <span className="flex-1 truncate text-sm">{name}</span>
      <Input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder="—"
        className="h-9 w-20 text-right text-sm tabular-nums"
      />
      <span className="w-10 text-xs text-[var(--color-fg-soft)]">{unit}</span>
      <Button
        size="sm"
        disabled={!dirty || invalid}
        onClick={() => onSave(parsed)}
      >
        Save
      </Button>
    </div>
  );
}
