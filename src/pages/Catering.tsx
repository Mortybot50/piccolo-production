// /catering — Jonny's manual catering entry.
// New order: customer + delivery date → add menu_item lines → save.
// List existing orders by delivery date, soonest first.

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, useMenuItems } from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";

interface CateringOrderRow {
  id: string;
  customer_name: string;
  delivery_date: string;
  contact: string | null;
  notes: string | null;
  status: string;
  catering_order_lines:
    | Array<{ menu_item_id: string; qty: number; menu_items: { name: string; code: string } | null }>
    | null;
}

function useCateringOrders() {
  return useQuery({
    queryKey: qk.cateringOrders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catering_orders")
        .select(
          "id, customer_name, delivery_date, contact, notes, status, catering_order_lines(menu_item_id, qty, menu_items(name, code))"
        )
        .order("delivery_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CateringOrderRow[];
    },
  });
}

export default function CateringPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useCateringOrders();
  const { data: menuItems = [] } = useMenuItems();

  const [customer, setCustomer] = useState("");
  const [delivery, setDelivery] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: async () => {
      if (!customer.trim() || !delivery) throw new Error("Customer + delivery date required");
      // Validate lines BEFORE inserting the parent row (Supabase has no
      // client transaction so a parent-insert + failed-line scenario
      // would leak an empty catering order).
      const parsedLines = Object.entries(lines)
        .map(([menu_item_id, q]) => ({
          menu_item_id,
          qty: parseInt(q, 10),
        }))
        .filter((l) => Number.isInteger(l.qty) && l.qty > 0);
      if (parsedLines.length === 0) throw new Error("Add at least one line");

      const { data: orderRow, error: orderErr } = await supabase
        .from("catering_orders")
        .insert({
          customer_name: customer.trim(),
          delivery_date: delivery,
          contact: contact.trim() || null,
          notes: notes.trim() || null,
          created_by_user_id: user?.id ?? null,
          status: "pending",
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;
      const lineRows = parsedLines.map((l) => ({
        catering_order_id: orderRow.id,
        menu_item_id: l.menu_item_id,
        qty: l.qty,
      }));
      const { error: linesErr } = await supabase.from("catering_order_lines").insert(lineRows);
      if (linesErr) {
        // Best-effort rollback: delete the orphan order row.
        await supabase.from("catering_orders").delete().eq("id", orderRow.id);
        throw linesErr;
      }
    },
    onSuccess: () => {
      toast.success(`Catering order saved for ${customer}`);
      setCustomer("");
      setDelivery("");
      setContact("");
      setNotes("");
      setLines({});
      qc.invalidateQueries({ queryKey: qk.cateringOrders });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("catering_orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cateringOrders }),
  });

  return (
    <AppShell title="Catering">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>New catering order</CardTitle>
          <CardDescription>
            Feeds into the prep plan on the delivery date automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-stone-500">Customer</label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500">Delivery date</label>
              <Input
                type="date"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-stone-500">Contact (optional)</label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-stone-500">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-stone-500">Lines</div>
            {menuItems.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-[var(--color-border)] py-1 last:border-b-0"
              >
                <div>
                  <div className="text-sm">{m.name}</div>
                  <div className="font-mono text-[10px] text-stone-500">{m.code}</div>
                </div>
                <Input
                  inputMode="numeric"
                  className="h-9 w-16 text-center text-sm"
                  placeholder="0"
                  value={lines[m.id] ?? ""}
                  onChange={(e) =>
                    setLines((l) => ({
                      ...l,
                      [m.id]: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <Button
            disabled={create.isPending}
            onClick={() => void create.mutateAsync()}
          >
            {create.isPending ? "Saving…" : "Save catering order"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming + past</CardTitle>
          <CardDescription>Soonest delivery first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {orders.length === 0 ? (
            <p className="text-sm text-stone-500">No catering orders yet.</p>
          ) : null}
          {orders.map((o) => (
            <div
              key={o.id}
              className="space-y-1 rounded border border-[var(--color-border)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{o.customer_name}</span>
                  <span className="ml-2 text-xs text-stone-500">
                    {new Date(o.delivery_date).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <Badge
                  variant={
                    o.status === "delivered"
                      ? "ok"
                      : o.status === "cancelled"
                        ? "bad"
                        : o.status === "confirmed"
                          ? "default"
                          : "warn"
                  }
                >
                  {o.status}
                </Badge>
              </div>
              {o.contact ? (
                <div className="text-xs text-stone-500">Contact: {o.contact}</div>
              ) : null}
              {o.notes ? <div className="text-xs text-stone-700">{o.notes}</div> : null}
              <ul className="space-y-0.5 text-xs">
                {(o.catering_order_lines ?? []).map((l) => (
                  <li key={l.menu_item_id} className="flex justify-between font-mono">
                    <span>{l.menu_items?.name ?? "?"}</span>
                    <span className="text-stone-600">× {l.qty}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1">
                {(["pending", "confirmed", "delivered", "cancelled"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={o.status === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => updateStatus.mutate({ id: o.id, status: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
