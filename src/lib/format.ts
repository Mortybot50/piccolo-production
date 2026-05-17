// Small formatting helpers used across the app.

export function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function fmtQty(n: number | null | undefined, decimals = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return Number(n.toFixed(decimals)).toString();
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function isoToDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function addDaysISO(s: string, days: number): string {
  // Use local components so we don't shift across the UTC boundary
  // (toISOString() converts back to UTC, which subtracts 10h in AEST and
  // returns the previous calendar day — see Codex review 18/05/2026).
  const d = isoToDate(s);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function weekStartISO(d: Date = new Date()): string {
  // Monday-anchored week start. Uses local components (see addDaysISO note).
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  const y = r.getFullYear();
  const m = String(r.getMonth() + 1).padStart(2, "0");
  const dd = String(r.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function weekdayOf(d: Date | string): Weekday {
  const date = typeof d === "string" ? isoToDate(d) : d;
  const map: Record<number, Weekday> = {
    0: "Sun",
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
  };
  return map[date.getDay()];
}
