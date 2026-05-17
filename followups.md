# piccolo-prod-app — Codex follow-ups (P2 findings filed during Pattern B gates)

## phase-C-to-I — 2026-05-18
**Source:** Codex review round 1 on f27aab1..HEAD, triaged P2 at gate close.

### useWeeklyInvoice empty-date guard
**Finding (verbatim):** `useWeeklyInvoice` enables as soon as `storeId` exists, even when `weekStart`/`weekEnd` are still empty strings while weeks/settings are loading. On Invoice/Dashboard this can call the Postgres `weekly_invoice` date parameters with `""`, producing avoidable RPC errors before the valid week query runs. (src/lib/queries.ts:289)

**Why P2:** Avoidable console error only — Postgres rejects the empty-string date cast, react-query swallows the error, the next render with valid dates retries correctly. Not user-visible.

**Action:** revisit if/when an error-monitoring service starts surfacing the noise. Add `enabled: !!storeId && weekStart !== "" && weekEnd !== ""` to all three useWeeklyInvoice callsites + the parallel useProductionPnl/useSalesAverages where applicable. Otherwise leave open.
