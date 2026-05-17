// /audit-log — searchable audit trail (last 500 rows).

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

interface AuditRow {
  id: string;
  ts: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_jsonb: unknown;
  after_jsonb: unknown;
  users: { display_name: string } | null;
}

function useAuditLog() {
  return useQuery({
    queryKey: qk.auditLog,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, ts, user_id, action, entity_type, entity_id, before_jsonb, after_jsonb, users(display_name)")
        .order("ts", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });
}

export default function AuditLogPage() {
  const { data: rows = [], isLoading } = useAuditLog();
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.entity_type.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        (r.users?.display_name ?? "").toLowerCase().includes(q) ||
        (r.entity_id ?? "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  return (
    <AppShell title="Audit log">
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Every insert/update/delete on master data + daily logs. Last 500 entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Filter by table, action, user, id…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-4">
          {isLoading ? <p className="text-sm text-stone-500">Loading…</p> : null}
          {filtered.map((r) => (
            <div
              key={r.id}
              className="space-y-1 rounded border border-[var(--color-border)] bg-white p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <Badge variant="outline" className="mr-1">
                    {r.action}
                  </Badge>
                  <span className="font-mono text-xs">
                    {r.entity_type}
                    {r.entity_id ? `:${r.entity_id.slice(0, 8)}` : ""}
                  </span>
                </span>
                <span className="text-xs text-stone-500">
                  {new Date(r.ts).toLocaleString("en-AU")} ·{" "}
                  {r.users?.display_name ?? "system"}
                </span>
              </div>
              <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-[10px] text-stone-600">
                {JSON.stringify({ before: r.before_jsonb, after: r.after_jsonb }, null, 2)}
              </pre>
            </div>
          ))}
          {!isLoading && filtered.length === 0 ? (
            <p className="text-sm text-stone-500">No matching entries.</p>
          ) : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
