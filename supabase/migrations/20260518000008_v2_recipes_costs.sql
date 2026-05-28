-- Piccolo Production — v2 hardening Phase 1: recipe recursion + effective-dated prices.
--
-- This migration:
--   1. Adds child_prep_item_id column to prep_item_recipe so a prep item can
--      recursively reference another prep item (e.g. Salad Mix → Roasted Peppers
--      prep, not the raw tin). Replaces the old composite PK with a surrogate id.
--   2. Adds ingredient_cost_history and transfer_price_history tables.
--      Effective-dated. The "current" row has effective_to IS NULL.
--   3. Adds RLS + audit triggers to the new tables. Existing audit_trigger_fn
--      is reused.
--
-- Idempotent — uses IF NOT EXISTS / DROP-CREATE patterns.

-- =============================================================================
-- prep_item_recipe — add recursion column + relax PK
-- =============================================================================

-- Add surrogate id + child_prep_item_id.
alter table public.prep_item_recipe
  add column if not exists id uuid default gen_random_uuid();

alter table public.prep_item_recipe
  add column if not exists child_prep_item_id uuid references public.prep_items(id) on delete restrict;

-- Swap PK: drop composite first (must happen before relaxing ingredient_id NOT NULL,
-- because Postgres requires PK columns to be NOT NULL).
do $$
declare
  v_pk_name text;
begin
  select conname into v_pk_name
    from pg_constraint
    where conrelid = 'public.prep_item_recipe'::regclass
      and contype = 'p';
  if v_pk_name is not null then
    execute format('alter table public.prep_item_recipe drop constraint %I', v_pk_name);
  end if;
end$$;

-- ingredient_id is currently NOT NULL — relax it so a line can be EITHER a
-- raw ingredient OR a child prep item.
alter table public.prep_item_recipe
  alter column ingredient_id drop not null;

-- Populate id for any pre-existing rows that don't have one.
update public.prep_item_recipe set id = gen_random_uuid() where id is null;

alter table public.prep_item_recipe
  alter column id set not null;

alter table public.prep_item_recipe
  add constraint prep_item_recipe_pkey primary key (id);

-- Exactly one of ingredient_id or child_prep_item_id must be set.
alter table public.prep_item_recipe
  drop constraint if exists prep_item_recipe_target_xor;
alter table public.prep_item_recipe
  add constraint prep_item_recipe_target_xor
  check ((ingredient_id is not null)::int + (child_prep_item_id is not null)::int = 1);

-- Uniqueness per (prep_item_id, target). Two partial unique indexes so each
-- ingredient or child prep can appear at most once in a recipe.
drop index if exists prep_item_recipe_unique_ing;
create unique index prep_item_recipe_unique_ing
  on public.prep_item_recipe (prep_item_id, ingredient_id)
  where ingredient_id is not null;

drop index if exists prep_item_recipe_unique_child;
create unique index prep_item_recipe_unique_child
  on public.prep_item_recipe (prep_item_id, child_prep_item_id)
  where child_prep_item_id is not null;

-- =============================================================================
-- ingredient_cost_history — effective-dated raw-ingredient cost per base unit
-- =============================================================================

create table if not exists public.ingredient_cost_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  cost_per_unit_cents numeric(14,6) not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists ingredient_cost_history_ingredient_idx
  on public.ingredient_cost_history (ingredient_id, effective_from desc);

-- At most one open (effective_to IS NULL) row per ingredient.
create unique index if not exists ingredient_cost_history_one_open
  on public.ingredient_cost_history (ingredient_id)
  where effective_to is null;

-- =============================================================================
-- transfer_price_history — effective-dated prep-item transfer price
-- =============================================================================

create table if not exists public.transfer_price_history (
  id uuid primary key default gen_random_uuid(),
  prep_item_id uuid not null references public.prep_items(id) on delete cascade,
  price_cents int not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists transfer_price_history_prep_idx
  on public.transfer_price_history (prep_item_id, effective_from desc);

create unique index if not exists transfer_price_history_one_open
  on public.transfer_price_history (prep_item_id)
  where effective_to is null;

-- =============================================================================
-- Touch + audit triggers on the new tables
-- =============================================================================

drop trigger if exists ingredient_cost_history_touch on public.ingredient_cost_history;
create trigger ingredient_cost_history_touch
  before update on public.ingredient_cost_history
  for each row execute function public.touch_updated_at();

drop trigger if exists ingredient_cost_history_audit on public.ingredient_cost_history;
create trigger ingredient_cost_history_audit
  after insert or update or delete on public.ingredient_cost_history
  for each row execute function public.audit_trigger_fn();

drop trigger if exists transfer_price_history_touch on public.transfer_price_history;
create trigger transfer_price_history_touch
  before update on public.transfer_price_history
  for each row execute function public.touch_updated_at();

drop trigger if exists transfer_price_history_audit on public.transfer_price_history;
create trigger transfer_price_history_audit
  after insert or update or delete on public.transfer_price_history
  for each row execute function public.audit_trigger_fn();

-- =============================================================================
-- RLS — single-role _authed (matches Phase B convention)
-- =============================================================================

alter table public.ingredient_cost_history enable row level security;
drop policy if exists ingredient_cost_history_authed on public.ingredient_cost_history;
create policy ingredient_cost_history_authed
  on public.ingredient_cost_history
  for all to authenticated
  using (true) with check (true);

alter table public.transfer_price_history enable row level security;
drop policy if exists transfer_price_history_authed on public.transfer_price_history;
create policy transfer_price_history_authed
  on public.transfer_price_history
  for all to authenticated
  using (true) with check (true);
