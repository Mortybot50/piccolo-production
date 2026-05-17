# piccolo-prod-app — Codex follow-ups (P2 findings filed during Pattern B gates)

## phase-C-to-I — 2026-05-18
**Source:** Codex review round 1 on f27aab1..HEAD, triaged P2 at gate close.

### useWeeklyInvoice empty-date guard
**Finding (verbatim):** `useWeeklyInvoice` enables as soon as `storeId` exists, even when `weekStart`/`weekEnd` are still empty strings while weeks/settings are loading. On Invoice/Dashboard this can call the Postgres `weekly_invoice` date parameters with `""`, producing avoidable RPC errors before the valid week query runs. (src/lib/queries.ts:289)

**Why P2:** Avoidable console error only — Postgres rejects the empty-string date cast, react-query swallows the error, the next render with valid dates retries correctly. Not user-visible.

**Action:** revisit if/when an error-monitoring service starts surfacing the noise. Add `enabled: !!storeId && weekStart !== "" && weekEnd !== ""` to all three useWeeklyInvoice callsites + the parallel useProductionPnl/useSalesAverages where applicable. Otherwise leave open.

### InvoiceHistory link drops store code
**Finding (verbatim):** When a saved SY invoice is clicked, this link only passes the week number; `InvoicePage` then defaults the store selector to HAW, so the SY history row reopens/reprints the HAW invoice for that week. (src/pages/InvoiceHistory.tsx:61)

**Why P2:** User can manually flip the store dropdown — workaround is one click. Not data loss. SY invoice still exists in DB.

**Action:** Either pass `?store=SY` as query param and read in Invoice page, or change route to `/invoice/:weekNum/:storeCode`. Revisit when reprinting saved invoices becomes a daily flow.

### Invoice week defaults to 1 before async settings load
**Finding (verbatim):** On `/invoice` without `:weekNum`, `settings`/`weeks` are undefined on first render, so `useState(defaultWeek)` locks `weekNumber` to `1`. (src/pages/Invoice.tsx:63)

**Why P2:** User picks correct week via dropdown. One extra click on cold-load.

**Action:** Add `useEffect` syncing weekNumber to settings.latest_week_number once settings.data is non-null.
