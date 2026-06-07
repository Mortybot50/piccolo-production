import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  useSuppliers,
  useIngredients,
  useUpdateIngredientSplitRule,
} from "@/lib/queries";

type SplitRule = "equal_split" | "mon_only" | "two_seven_three" | "third_each";

const SPLIT_LABELS: Record<SplitRule, string> = {
  equal_split: "Equal split across deliveries",
  mon_only: "Mon delivery only",
  two_seven_three: "2/7 Mon, 2/7 Wed, 3/7 Fri",
  third_each: "1/3 per delivery",
};

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  schedule_jsonb: { kind?: string; slots?: Array<{ order: string; delivery: string }> } | null;
}

interface IngredientRow {
  id: string;
  code: string;
  name: string;
  supplier_id: string | null;
  split_rule: SplitRule;
}

export function SupplierScheduleCard() {
  const { data: suppliers = [], isLoading: sLoading } = useSuppliers();
  const { data: ingredients = [], isLoading: iLoading } = useIngredients();
  const update = useUpdateIngredientSplitRule();
  const [expanded, setExpanded] = useState<string | null>(null);

  const ingredientsBySupplier = useMemo(() => {
    const map = new Map<string, IngredientRow[]>();
    for (const i of ingredients as IngredientRow[]) {
      if (!i.supplier_id) continue;
      if (!map.has(i.supplier_id)) map.set(i.supplier_id, []);
      map.get(i.supplier_id)!.push(i);
    }
    return map;
  }, [ingredients]);

  function onChangeRule(ingId: string, rule: SplitRule) {
    update
      .mutateAsync({ id: ingId, split_rule: rule })
      .then(() => toast.success("Split rule saved"))
      .catch((e: Error) => toast.error(`Save failed: ${e.message}`));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier schedule</CardTitle>
        <CardDescription>
          Set the delivery cadence per supplier, and how each ingredient should
          split across the week. Used by the Mon/Wed/Fri supplier-order screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(sLoading || iLoading) ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : null}
        {(suppliers as SupplierRow[]).map((s) => {
          const kind = s.schedule_jsonb?.kind ?? "as_needed";
          const slots = s.schedule_jsonb?.slots ?? [];
          const ingr = ingredientsBySupplier.get(s.id) ?? [];
          const isOpen = expanded === s.id;
          const showSplitEditor = kind === "thrice_weekly" && ingr.length > 0;
          return (
            <div
              key={s.id}
              className="rounded-md border border-[var(--color-border)] bg-white"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="font-mono text-[11px] text-stone-500">
                    {s.code}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{kind}</Badge>
                  <span className="text-xs text-stone-500">
                    {isOpen ? "Hide" : "Edit"}
                  </span>
                </div>
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-[var(--color-border)] p-3">
                  {slots.length > 0 ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-stone-500">
                        Delivery slots
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {slots.map((slot, idx) => (
                          <Badge key={idx} variant="outline">
                            Order {slot.order} → Delivery {slot.delivery}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {showSplitEditor ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-stone-500">
                        Per-ingredient split rule
                      </p>
                      <div className="space-y-2">
                        {ingr
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((i) => (
                            <div
                              key={i.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-sm">{i.name}</span>
                              <select
                                value={i.split_rule ?? "equal_split"}
                                onChange={(e) =>
                                  onChangeRule(i.id, e.target.value as SplitRule)
                                }
                                className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs"
                              >
                                {(Object.keys(SPLIT_LABELS) as SplitRule[]).map(
                                  (r) => (
                                    <option key={r} value={r}>
                                      {SPLIT_LABELS[r]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500">
                      {kind === "daily" || kind === "weekly"
                        ? "No per-ingredient split needed — single delivery cadence."
                        : "No ingredients linked yet."}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExpanded(null)}
          disabled={expanded === null}
        >
          Collapse all
        </Button>
      </CardContent>
    </Card>
  );
}
