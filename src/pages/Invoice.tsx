// /invoice — pick store + week → weekly_invoice RPC → render printable view.
// Tabs: Screen / Print (browser print-to-PDF) / Text (paste into Xero).
// Save persists invoices + invoice_lines (idempotent on store_id + week_number).

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  qk,
  useStores,
  useSalesWeeks,
  usePrepItems,
  useWeeklyInvoice,
  useAppSettings,
} from "@/lib/queries";
import { centsToDollars, fmtQty } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "screen" | "print" | "text";

interface PrepItemLite {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export default function InvoicePage() {
  const params = useParams<{ weekNum?: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: settings } = useAppSettings();
  const { data: stores = [] } = useStores();
  const { data: weeks = [] } = useSalesWeeks();
  const { data: prepItemsRaw = [] } = usePrepItems();
  const prepItems = prepItemsRaw as PrepItemLite[];

  const [storeId, setStoreId] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      const haw = stores.find((s) => s.code === "HAW");
      setStoreId(haw?.id ?? stores[0].id);
    }
  }, [stores, storeId]);

  const defaultWeek =
    (params.weekNum && parseInt(params.weekNum, 10)) ||
    settings?.latest_week_number ||
    weeks[0]?.week_number ||
    1;
  const [weekNumber, setWeekNumber] = useState<number>(defaultWeek);
  useEffect(() => {
    if (params.weekNum) setWeekNumber(parseInt(params.weekNum, 10));
  }, [params.weekNum]);

  const week = weeks.find((w) => w.week_number === weekNumber);

  const { data: lines = [], isLoading } = useWeeklyInvoice(
    storeId,
    week?.week_start_date ?? "",
    week?.week_end_date ?? ""
  );

  const nameById = new Map(prepItems.map((p) => [p.id, p]));
  const lineRows = (lines as Array<{
    prep_item_id: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
  }>).map((l) => ({
    ...l,
    name: nameById.get(l.prep_item_id)?.name ?? l.prep_item_id,
    unit: nameById.get(l.prep_item_id)?.unit ?? "",
  }));
  const total = lineRows.reduce((s, l) => s + Number(l.line_total_cents), 0);

  const storeRow = stores.find((s) => s.id === storeId);

  const [tab, setTab] = useState<Tab>("screen");

  const save = useMutation({
    mutationFn: async () => {
      if (!storeId || !week) throw new Error("Pick a store + week");
      const { data: invRow, error: invErr } = await supabase
        .from("invoices")
        .upsert(
          {
            store_id: storeId,
            week_number: weekNumber,
            week_start: week.week_start_date,
            week_end: week.week_end_date,
            total_cents: total,
            generated_by_user_id: user?.id ?? null,
          },
          { onConflict: "store_id,week_number" }
        )
        .select("id")
        .single();
      if (invErr) throw invErr;
      const { error: delErr } = await supabase
        .from("invoice_lines")
        .delete()
        .eq("invoice_id", invRow.id);
      if (delErr) throw delErr;
      if (lineRows.length === 0) return;
      const { error: insErr } = await supabase.from("invoice_lines").insert(
        lineRows.map((l) => ({
          invoice_id: invRow.id,
          prep_item_id: l.prep_item_id,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          line_total_cents: l.line_total_cents,
        }))
      );
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Invoice saved");
      qc.invalidateQueries({ queryKey: qk.invoices });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const textBody = useMemo(() => {
    // Tab-separated, easy paste into Xero spreadsheet.
    const out: string[] = [];
    out.push(`Piccolo Production Invoice — Week ${weekNumber} — ${storeRow?.code ?? ""}`);
    out.push(`Period: ${week?.week_start_date} to ${week?.week_end_date}`);
    out.push("");
    out.push(["Item", "Qty", "Unit price", "Line total"].join("\t"));
    for (const l of lineRows) {
      out.push(
        [
          l.name,
          `${fmtQty(l.qty)} ${l.unit}`,
          centsToDollars(l.unit_price_cents),
          centsToDollars(l.line_total_cents),
        ].join("\t")
      );
    }
    out.push("");
    out.push(`TOTAL\t\t\t${centsToDollars(total)}`);
    return out.join("\n");
  }, [lineRows, total, week, weekNumber, storeRow]);

  return (
    <AppShell title="Invoice">
      <Card className="mb-4 print:hidden">
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
          <CardDescription>
            Pulled from <code>prep_log.qty_sent_*</code> × prep_item transfer price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-stone-500">Store</label>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
                value={storeId ?? ""}
                onChange={(e) => setStoreId(e.target.value || null)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500">Week</label>
              <select
                className="h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-2 text-sm"
                value={weekNumber}
                onChange={(e) => setWeekNumber(parseInt(e.target.value, 10))}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.week_number}>
                    Week {w.week_number} ({w.week_start_date})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant={tab === "screen" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("screen")}
              >
                Screen
              </Button>
              <Button
                variant={tab === "print" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("print")}
              >
                Print
              </Button>
              <Button
                variant={tab === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("text")}
              >
                Text
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {tab !== "text" ? (
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="print:hidden">
            <CardTitle>
              Week {weekNumber} — {storeRow?.code}
              <Badge variant="outline" className="ml-2">
                {week?.week_start_date} → {week?.week_end_date}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
            <div className="space-y-2 print:p-6">
              <div className="print:block hidden">
                <h1 className="text-xl font-semibold">Piccolo Production Invoice</h1>
                <p className="text-sm text-stone-600">
                  Week {weekNumber} · {storeRow?.code} · {week?.week_start_date} to{" "}
                  {week?.week_end_date}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-stone-500">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit price</th>
                    <th className="py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((l) => (
                    <tr key={l.prep_item_id} className="border-b border-stone-100">
                      <td className="py-2">{l.name}</td>
                      <td className="py-2 text-right font-mono">
                        {fmtQty(l.qty)} {l.unit}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {centsToDollars(l.unit_price_cents)}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {centsToDollars(l.line_total_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-3 text-right font-medium">
                      Total
                    </td>
                    <td className="py-3 text-right font-mono font-semibold">
                      {centsToDollars(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              {tab === "print" ? (
                <Button size="sm" onClick={() => window.print()}>
                  Open print dialog
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={save.isPending || lineRows.length === 0}
                onClick={() => void save.mutateAsync()}
              >
                {save.isPending ? "Saving…" : "Save invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Copy for Xero</CardTitle>
            <CardDescription>Tab-separated — paste into Xero spreadsheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-xs text-stone-700">
              {textBody}
            </pre>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(textBody);
                    toast.success("Copied");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={save.isPending || lineRows.length === 0}
                onClick={() => void save.mutateAsync()}
              >
                {save.isPending ? "Saving…" : "Save invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
