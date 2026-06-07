# Piccolo Production app — refresh v3 (Jonny-ready)

**Shipped:** 07/06/2026
**Branch:** main (direct push authorized by Morty for this work — see chat 07/06/2026)
**Range:** 8ae7d21 → bc971b3 (3 feature commits)
**Production URL:** https://piccolo-production.vercel.app
**Supabase project:** qjplbovvadtfkmtjxplf (Sydney)
**Driver:** Morty's "current build seems very clunky" feedback + the workbook-vs-app audit at `plans/WORKBOOK-VS-APP-AUDIT-2026-05-31.md`.

## Commits

| SHA | Phase | Headline |
|---|---|---|
| 104f91a | 1 — Slim + Configurable | Bottom nav swap (Invoice → Recipes), `/settings` "More" page splits into For-today / Commercial blocks, three new Settings cards (Forecast window + median, Store splits, Supplier schedule with per-ingredient split rules), Dashboard tiles gated to admin, internal routes (`/__primitives`, `/__sentry-test`) hidden from production bundle. Migration `20260607001134_refresh_v3_phase1_config.sql` (app_settings.window_weeks / use_median, sales_weeks.exclude_from_avg, ingredients.split_rule with fresh_garlic backfill, Jonny user seed PIN 2222 must_change_pin). |
| 926300a | 2 — Surface gaps | `/sales-averages` page (panini × weekday matrix, Combined / HAW / SY tabs, weekly totals), `/prep-log` page (date-range browser, missed-days callout, click date → backfill on Today), `/supplier-orders` rework (Mon/Wed/Fri quick-pick chips for thrice-weekly suppliers, drives per-ingredient split rule via RPC). Migration `20260607005248_refresh_v3_phase2_rpcs.sql` (sales_averages_4wk, combined_demand_by_weekday, supplier_order_recommendation all rewritten to honour Phase 1's configurable knobs). |
| bc971b3 | 3 — Visual refresh + harden | Drop Inter; Instrument Sans body + Fraunces Variable serif display + JetBrains Mono. New terracotta palette + warm cream surfaces. `container-app` utility scales 640/760/880 across phone → iPad → desktop. Bottom nav 56pt pill-style touch targets. Card / Button / Input / Badge primitives rebuilt on new tokens. Scale-on-active button feedback. prefers-reduced-motion respected. **Critical bug fix:** `pinAuthFetch` was guarded by `!headers.has("authorization")` so it never overwrote supabase-js's auto-set `Authorization: Bearer <anon_key>` — every RLS-protected SELECT silently returned [] in dev. Always overwrite now. `scripts/smoke-api.sh` smoke probe. `.claude/launch.json` registers the local preview server. |

## Migrations applied (live on `qjplbovvadtfkmtjxplf`)

- `20260607001134_refresh_v3_phase1_config` — additive (ALTER ADD COLUMN, INSERT WHERE NOT EXISTS). Idempotent.
- `20260607005248_refresh_v3_phase2_rpcs` — CREATE OR REPLACE FUNCTION across three RPCs. Idempotent.

Both applied via Supabase MCP `apply_migration` (preferred path per `~/.claude/rules/dev/supabase-migrations.md`).

## What now works that didn't

| Workbook tab | Before refresh | After refresh |
|---|---|---|
| Sales Averages (workbook brain of demand model) | Math existed but no UI | `/sales-averages` matrix renders |
| Prep Log (browse history) | Could only edit today via /today modal | `/prep-log` browser + missed-days view + click-to-backfill |
| Ordering Guide DOM Mon/Wed/Fri ritual | Collapsed to single delivery | Mon/Wed/Fri quick-pick tabs, honours per-ingredient split_rule (mon_only / two_seven_three / third_each / equal_split) |
| Settings → Forecast knobs | Hardcoded 4-week mean | Configurable 2/4/6/8 weeks, median toggle, per-week exclude |
| Settings → Store splits | Existed in DB but no UI | Editable HAW/SY % per panini |
| Settings → Supplier schedule | Raw JSON dump only | Slot viewer + per-ingredient split editor |

## What's intentionally NOT in scope (Morty's call 07/06/2026)

| Cut | Reason |
|---|---|
| Service worker / IndexedDB offline mode | Cool room wifi is fine per Morty |
| PDF generation (invoices / cook cards) | Browser print is enough |
| Invoice auto-roll cron + payment status enum + trend chart | Jonny copies line items to Xero; commercial features are Damian-time |
| Margin Watch deep view | Damian comes later; admin-gated for now |
| Address sales-input edit-week or seasonal/trend forecast adjustments | Future |
| Tomatoes (Cut) prep recipe seed (audit row 50) | Content, fix during data import |
| Several missing ingredient costs (focaccia, mozzarella, prosciutto meat, etc) | Content, fix during data import |

## Day-one user (Jonny)

- Display name: Jonny
- Initial PIN: `2222`
- `must_change_pin = true` (will be prompted on first login)
- `is_admin = false` (commercial surfaces hidden from nav)
- E.164 not yet added to `tools.elevated.allowFrom.whatsapp[]` (Jonny isn't in the WhatsApp group; comms still go via Damian)

## Damian

- Already seeded
- `is_admin = true` — sees Dashboard commercial tiles, Costing, Invoice, Invoice History, Audit Log in the More menu's Commercial block
- `must_change_pin = false` (already changed long ago)

## Verification done in this session

| Probe | Result |
|---|---|
| Typecheck (`npx tsc --noEmit`) | Clean across all 3 phases |
| Production build (`npm run build`) | Clean (508KB main, expected for the data app) |
| Login flow (Jonny → 2222 → must_change_pin redirect) | Works; PIN-change page renders cleanly with Fraunces |
| Today page render (Sunday 7 June) | Day picker terracotta, all cards rendered |
| Supplier orders page (DOM) | Mon/Wed/Fri quick picks render; Mon active on Mon delivery date |
| Settings → Supplier schedule | DOM card expands; per-ingredient split_rule dropdowns visible |
| `/sales-averages` | Matrix renders with — for unseeded data; "Latest week: 4 · Window includes weeks 1 → 4" |
| Pill-style bottom nav active state | Active route's icon gets terracotta-100 pill background |
| Vercel push 8ae7d21 → bc971b3 | Pushed clean to main; Vercel auto-deploy triggered |

## What you should check before handing to Jonny

1. **Open https://piccolo-production.vercel.app** on iPad + phone after the Vercel deploy completes. Confirm Fraunces serif renders correctly (it's a variable font, should look warm + Italian). Confirm pill-style bottom nav. Confirm terracotta brand.
2. **Log in as Jonny (`2222`)** and walk through the change-PIN flow.
3. **After Jonny's PIN change**, walk to Today / Store / Suppliers / Recipes / More. Sub-check: Suppliers → DOM → Mon delivery tab.
4. **Toggle a Settings → Forecast knob** (e.g. window to 6 weeks) and confirm /sales-averages re-renders with the new label.
5. **Settings → Supplier schedule → DOM → expand** → change `Salad Mix` to `2/7 Mon, 2/7 Wed, 3/7 Fri` → go to Supplier orders / DOM / each tab → confirm the Salad Mix recommended qty differs per tab.

## What I'd queue next (after Jonny is using it)

| Follow-up | Owner | Trigger |
|---|---|---|
| Seed `tomatoes_cut` prep_item_recipe (1000g gourmet_tomatoes → 1kg) | Data import | Before Damian opens /costing |
| Fill missing ingredient costs (focaccia, cheeses, cured meats) | Data import | Before Damian opens /costing |
| Service worker + IndexedDB queue for prep_log | Future | If coolroom wifi turns out to be flaky in practice |
| Add an "exclude from average" surface on /sales-input directly (not just Settings → Forecast weeks) | Future | If Damian wants the closure-week flow inline |
| Add add-ons matrix to /sales-averages (currently only panini) | Future | If Damian asks for it |
| Codex Pattern B review | Optional | If you want a second-model check on these three commits, run `/code-review` or `gh pr create` + `codex review` retroactively against the diff. NO_CAPS iteration per ~/.claude/rules/dev/codex-review.md. |

## Plan reference

`plans/REFRESH-PLAN-2026-06-07.md` — the canonical plan this work executed.
