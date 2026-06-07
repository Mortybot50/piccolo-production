-- Piccolo Production v3 refresh — Phase 1: configurable forecast + per-ingredient split rules + Jonny user
-- Created 07/06/2026 per REFRESH-PLAN-2026-06-07.md
-- All operations are additive: ALTER TABLE ADD COLUMN with DEFAULT, idempotent INSERT.

-- 1. Configurable forecast window + mean-vs-median on app_settings.
alter table public.app_settings
  add column if not exists window_weeks int not null default 4,
  add column if not exists use_median boolean not null default false;

-- Allowed values: 2, 4, 6, 8. Drop+recreate the constraint so re-runs stay clean.
alter table public.app_settings
  drop constraint if exists app_settings_window_weeks_check;
alter table public.app_settings
  add constraint app_settings_window_weeks_check
  check (window_weeks in (2, 4, 6, 8));

-- 2. Per-week "exclude from rolling average" flag.
alter table public.sales_weeks
  add column if not exists exclude_from_avg boolean not null default false;

-- 3. Per-ingredient delivery split rule.
--    Semantics:
--      'equal_split'     — divide weekly_need across the supplier's delivery days
--      'mon_only'        — 100% on Monday delivery, 0 on others (workbook garlic pattern)
--      'two_seven_three' — 2/7 Mon, 2/7 Wed, 3/7 Fri          (workbook salad-veg pattern)
--      'third_each'      — 1/3 per delivery                   (workbook tomato-tub pattern)
alter table public.ingredients
  add column if not exists split_rule text not null default 'equal_split';

alter table public.ingredients
  drop constraint if exists ingredients_split_rule_check;
alter table public.ingredients
  add constraint ingredients_split_rule_check
  check (split_rule in ('equal_split', 'mon_only', 'two_seven_three', 'third_each'));

-- Backfill: the legacy supplier-level garlic_mon_only flag moves to per-ingredient.
update public.ingredients
  set split_rule = 'mon_only'
  where code = 'fresh_garlic' and split_rule = 'equal_split';

-- 4. Seed Jonny (production crew, default user, PIN 2222, must_change_pin = true).
--    Same pattern as Damian's seed in 20260517000001_initial_auth.sql.
insert into public.users (display_name, pin_hash, must_change_pin, active)
  select 'Jonny', crypt('2222', gen_salt('bf', 10)), true, true
  where not exists (
    select 1 from public.users where lower(display_name) = 'jonny'
  );

-- 5. Note for Phase 2 follow-up:
--    supplier_order_recommendation (in 20260518000011_v2_rpcs.sql) currently reads
--    suppliers.schedule_jsonb -> garlic_mon_only. Phase 2 will rewrite that RPC
--    to read ingredients.split_rule instead, making the supplier flag legacy.
--    Until then, both work — fresh_garlic is covered by either.
