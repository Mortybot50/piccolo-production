// /invoice-history — past saved invoices, click to open at /invoice/:weekNum.

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
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { centsToDollars } from "@/lib/format";

interface InvoiceRow {
  id: string;
  store_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  total_cents: number;
  generated_at: string;
  stores: { code: string; name: string } | null;
}

function useInvoices() {
  return useQuery({
    queryKey: qk.invoices,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, store_id, week_number, week_start, week_end, total_cents, generated_at, stores(code, name)")
        .order("week_number", { ascending: false })
        .order("store_id");
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });
}

export default function InvoiceHistoryPage() {
  const { data: invoices = [], isLoading } = useInvoices();
  return (
    <AppShell title="Invoice history">
      <Card>
        <CardHeader>
          <CardTitle>Past invoices</CardTitle>
          <CardDescription>Click a row to re-open and reprint.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {!isLoading && invoices.length === 0 ? (
            <p className="text-sm text-stone-500">No invoices saved yet.</p>
          ) : null}
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              to={`/invoice/${inv.week_number}`}
              className="flex items-center justify-between rounded border border-[var(--color-border)] bg-white px-3 py-2 hover:bg-stone-50"
            >
              <div>
                <div className="font-medium">
                  Week {inv.week_number}{" "}
                  <Badge variant="outline" className="ml-1">
                    {inv.stores?.code ?? "?"}
                  </Badge>
                </div>
                <div className="text-xs text-stone-500">
                  {inv.week_start} → {inv.week_end} · generated{" "}
                  {new Date(inv.generated_at).toLocaleDateString("en-AU")}
                </div>
              </div>
              <div className="font-mono text-sm font-semibold">
                {centsToDollars(inv.total_cents)}
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
