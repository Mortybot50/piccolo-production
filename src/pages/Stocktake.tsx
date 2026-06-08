// /stocktake — the only screen Jonny needs. Lands on a list of cards:
// one per supplier (count + order), plus an "In-house prep" card for the
// items production makes themselves (cotoletta, salsa verde, etc.).
//
// Tap a card → goes to the per-supplier or per-prep flow.

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
import {
  useSuppliers,
  useIngredients,
  usePrepItems,
  useLatestStockCountsByPrepItem,
  useLatestIngredientStockCounts,
} from "@/lib/queries";
import { ChefHat, ChevronRight, Truck } from "lucide-react";
import { todayISO } from "@/lib/format";

interface SupplierRow {
  id: string;
  code: string;
  name: string;
}
interface IngRow {
  id: string;
  supplier_id: string | null;
  par_qty: number | null;
}
interface PrepRow {
  id: string;
  active: boolean;
  par_qty: number | null;
}

export default function StocktakePage() {
  const today = todayISO();
  const { data: suppliers = [] } = useSuppliers();
  const { data: ingredients = [] } = useIngredients();
  const { data: prepItems = [] } = usePrepItems();
  const { data: prepLatest } = useLatestStockCountsByPrepItem();
  const { data: ingLatest } = useLatestIngredientStockCounts();

  const activePrep = (prepItems as PrepRow[]).filter((p) => p.active !== false);
  const prepCountedToday = activePrep.filter(
    (p) => prepLatest?.get(p.id)?.count_date === today,
  ).length;
  const prepBelowPar = activePrep.filter((p) => {
    if (p.par_qty == null) return false;
    const c = prepLatest?.get(p.id);
    return c && Number(c.qty_on_hand) < p.par_qty;
  }).length;

  function supplierStats(supplierId: string) {
    const items = (ingredients as IngRow[]).filter(
      (i) => i.supplier_id === supplierId,
    );
    const counted = items.filter(
      (i) => ingLatest?.get(i.id)?.count_date === today,
    ).length;
    const belowPar = items.filter((i) => {
      if (i.par_qty == null) return false;
      const c = ingLatest?.get(i.id);
      return c && Number(c.qty_on_hand) < i.par_qty;
    }).length;
    return { total: items.length, counted, belowPar };
  }

  return (
    <AppShell title="Stocktake" subtitle="Pick a category or supplier">
      <Card className="mb-3">
        <Link to="/stocktake/prep" className="block">
          <CardContent className="flex items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-100)] text-[var(--color-accent-700)]">
                <ChefHat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold">In-house prep</p>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  {activePrep.length} item{activePrep.length === 1 ? "" : "s"} ·{" "}
                  {prepCountedToday > 0
                    ? `${prepCountedToday} counted today`
                    : "none counted today"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {prepBelowPar > 0 ? (
                <Badge variant="bad">{prepBelowPar} below par</Badge>
              ) : null}
              <ChevronRight className="h-5 w-5 text-[var(--color-fg-soft)]" />
            </div>
          </CardContent>
        </Link>
      </Card>

      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-soft)]">
          Suppliers
        </p>
      </div>

      {(suppliers as SupplierRow[]).map((s) => {
        const stats = supplierStats(s.id);
        if (stats.total === 0) return null;
        return (
          <Card key={s.id} className="mb-2">
            <Link to={`/stocktake/${s.code.toLowerCase()}`} className="block">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-brand-100)] text-[var(--color-brand-700)]">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-semibold">{s.name}</p>
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      {stats.total} ingredient{stats.total === 1 ? "" : "s"} ·{" "}
                      {stats.counted > 0
                        ? `${stats.counted} counted today`
                        : "none counted today"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {stats.belowPar > 0 ? (
                    <Badge variant="bad">{stats.belowPar} below par</Badge>
                  ) : null}
                  <ChevronRight className="h-5 w-5 text-[var(--color-fg-soft)]" />
                </div>
              </CardContent>
            </Link>
          </Card>
        );
      })}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">How this works</CardTitle>
          <CardDescription>
            Tap a supplier to walk the shelf — count each ingredient, then
            review the suggested order and send it. Tap In-house prep to count
            what production has on hand.
          </CardDescription>
        </CardHeader>
      </Card>
    </AppShell>
  );
}
