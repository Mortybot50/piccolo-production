-- Piccolo Production — v2 hardening Phase 1: prep-plan + store-order overrides.
--
-- The Excel workbook uses the pattern IF(override<>"", override, calculated)
-- everywhere a forecast row appears, with BOTH visible. Operators want to
-- override without breaking the formula. These two tables hold the override
-- numbers. Blank (NULL) means "use the calculated value".

-- =============================================================================
-- prep_plan_overrides — per (plan_date, prep_item_id)
-- =============================================================================

create table if not exists public.prep_plan_overrides (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  prep_item_id uuid not null references public.prep_items(id) on delete cascade,
  override_total numeric,   -- replaces total_with_buffer when set
  override_haw numeric,     -- replaces haw_split when set
  override_sy numeric,      -- replaces sy_split when set
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_date, prep_item_id)
);

create index if not exists prep_plan_overrides_date_idx
  on public.prep_plan_overrides (plan_date desc);

-- =============================================================================
-- store_order_overrides — per (store_id, for_date, prep_item_id)
-- =============================================================================

create table if not exists public.store_order_overrides (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  for_date date not null,
  prep_item_id uuid not null references public.prep_items(id) on delete cascade,
  override_qty numeric,
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, for_date, prep_item_id)
);

create index if not exists store_order_overrides_date_idx
  on public.store_order_overrides (for_date desc);

-- =============================================================================
-- Touch + audit + RLS
-- =============================================================================

drop trigger if exists prep_plan_overrides_touch on public.prep_plan_overrides;
create trigger prep_plan_overrides_touch
  before update on public.prep_plan_overrides
  for each row execute function public.touch_updated_at();

drop trigger if exists prep_plan_overrides_audit on public.prep_plan_overrides;
create trigger prep_plan_overrides_audit
  after insert or update or delete on public.prep_plan_overrides
  for each row execute function public.audit_trigger_fn();

drop trigger if exists store_order_overrides_touch on public.store_order_overrides;
create trigger store_order_overrides_touch
  before update on public.store_order_overrides
  for each row execute function public.touch_updated_at();

drop trigger if exists store_order_overrides_audit on public.store_order_overrides;
create trigger store_order_overrides_audit
  after insert or update or delete on public.store_order_overrides
  for each row execute function public.audit_trigger_fn();

alter table public.prep_plan_overrides enable row level security;
drop policy if exists prep_plan_overrides_authed on public.prep_plan_overrides;
create policy prep_plan_overrides_authed
  on public.prep_plan_overrides
  for all to authenticated
  using (true) with check (true);

alter table public.store_order_overrides enable row level security;
drop policy if exists store_order_overrides_authed on public.store_order_overrides;
create policy store_order_overrides_authed
  on public.store_order_overrides
  for all to authenticated
  using (true) with check (true);
