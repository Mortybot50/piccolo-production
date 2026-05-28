-- Piccolo Production — Phase B schema
-- Tables, RLS, touch trigger, audit trigger.
-- Single-tenant. No org_id. authenticated role = full access.
-- Idempotent — uses IF NOT EXISTS / DROP-CREATE for triggers.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =============================================================================
-- Helper: touch_updated_at already exists from Phase A
-- (public.touch_updated_at, search_path locked to public, pg_temp).
-- Reuse it.
-- =============================================================================

-- =============================================================================
-- TABLES
-- =============================================================================

-- app_settings: single-row sentinel via partial unique index on TRUE.
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  latest_week_number int not null default 1,
  buffer_pct numeric(5,4) not null default 0.10,
  waste_threshold_pct numeric(5,4) not null default 0.05,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_settings_singleton on public.app_settings ((true)) where singleton = true;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  schedule_jsonb jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prep_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null,
  portion_g numeric not null,
  shelf_life_days int not null,
  batch_size numeric,
  batch_unit text,
  frequency_label text,
  transfer_price_cents int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sell_price_cents int not null,
  haw_split_pct numeric(4,3) not null,
  sy_split_pct numeric(4,3) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.addon_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  linked_prep_item_id uuid references public.prep_items(id) on delete set null,
  portion_g numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  pack_desc text,
  cost_per_pack_cents int,
  pack_qty numeric,
  pack_unit text,
  cost_per_unit_cents numeric generated always as (
    case
      when pack_qty is not null and pack_qty > 0 and cost_per_pack_cents is not null
      then (cost_per_pack_cents::numeric / pack_qty)
      else null
    end
  ) stored,
  last_cost_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prep_item_recipe (
  prep_item_id uuid not null references public.prep_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  qty_per_yield numeric not null,
  qty_unit text not null,
  yield_qty numeric not null,
  yield_unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (prep_item_id, ingredient_id)
);

create table if not exists public.menu_item_recipe (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  line_no int not null,
  ingredient_id uuid references public.ingredients(id),
  prep_item_id uuid references public.prep_items(id),
  qty_per_serve numeric not null,
  qty_unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (menu_item_id, line_no),
  check (ingredient_id is not null or prep_item_id is not null)
);

create table if not exists public.sales_weeks (
  id uuid primary key default gen_random_uuid(),
  week_number int not null unique,
  week_start_date date not null,
  week_end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.sales_weeks(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  menu_item_id uuid not null references public.menu_items(id),
  weekday text not null check (weekday in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, store_id, menu_item_id, weekday)
);

create table if not exists public.addon_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.sales_weeks(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  addon_item_id uuid not null references public.addon_items(id),
  weekday text not null check (weekday in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, store_id, addon_item_id, weekday)
);

create table if not exists public.prep_log (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,
  prep_item_id uuid not null references public.prep_items(id),
  qty_prepped numeric not null,
  qty_sent_haw numeric not null default 0,
  qty_sent_sy numeric not null default 0,
  qty_kept numeric not null default 0,
  notes text,
  prepped_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (log_date, prep_item_id),
  check (abs(qty_kept - (qty_prepped - qty_sent_haw - qty_sent_sy)) < 0.001)
);

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null,
  prep_item_id uuid not null references public.prep_items(id),
  qty_on_hand numeric not null,
  counted_by_user_id uuid references public.users(id) on delete set null,
  counted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  waste_date date not null,
  prep_item_id uuid not null references public.prep_items(id),
  qty numeric not null,
  reason_code text not null check (reason_code in ('expired','damaged','over_prepped','customer_return','staff_meal','other')),
  note text,
  logged_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  for_date date not null,
  placed_by_user_id uuid references public.users(id) on delete set null,
  placed_at timestamptz not null default now(),
  status text not null default 'placed' check (status in ('placed','fulfilled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, for_date)
);

create table if not exists public.store_order_lines (
  store_order_id uuid not null references public.store_orders(id) on delete cascade,
  prep_item_id uuid not null references public.prep_items(id),
  qty_ordered numeric not null,
  qty_on_hand_at_order numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_order_id, prep_item_id)
);

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  order_date date not null,
  expected_delivery_date date,
  placed_by_user_id uuid references public.users(id) on delete set null,
  placed_at timestamptz not null default now(),
  status text not null default 'placed' check (status in ('placed','received','cancelled')),
  notes_to_supplier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, order_date)
);

create table if not exists public.supplier_order_lines (
  supplier_order_id uuid not null references public.supplier_orders(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric not null,
  qty_unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (supplier_order_id, ingredient_id)
);

create table if not exists public.catering_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  delivery_date date not null,
  contact text,
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catering_order_lines (
  catering_order_id uuid not null references public.catering_orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  qty int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (catering_order_id, menu_item_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  week_number int not null,
  week_start date not null,
  week_end date not null,
  total_cents int not null,
  generated_at timestamptz not null default now(),
  generated_by_user_id uuid references public.users(id) on delete set null,
  pdf_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, week_number)
);

create table if not exists public.invoice_lines (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  prep_item_id uuid not null references public.prep_items(id),
  qty numeric not null,
  unit_price_cents int not null,
  line_total_cents int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (invoice_id, prep_item_id)
);

-- audit_log: immutable. No updated_at, no touch trigger, no audit trigger on self.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('insert','update','delete')),
  entity_type text not null,
  entity_id text,
  before_jsonb jsonb,
  after_jsonb jsonb
);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);
create index if not exists audit_log_user_idx on public.audit_log (user_id);

-- =============================================================================
-- TOUCH TRIGGERS for updated_at (all tables except audit_log + app_settings)
-- =============================================================================

do $$
declare
  t text;
  tbls text[] := array[
    'stores','suppliers','prep_items','menu_items','addon_items',
    'ingredients','prep_item_recipe','menu_item_recipe',
    'sales_weeks','sales_entries','addon_entries',
    'prep_log','stock_counts','waste_entries',
    'store_orders','store_order_lines',
    'supplier_orders','supplier_order_lines',
    'catering_orders','catering_order_lines',
    'invoices','invoice_lines'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end$$;

-- =============================================================================
-- AUDIT TRIGGER FN + attach to every mutating table (NOT audit_log itself)
-- =============================================================================

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_claims text;
  v_action text;
  v_entity_id text;
  v_before jsonb;
  v_after jsonb;
begin
  -- Resolve app user_id from JWT claim (request.jwt.claims -> user_metadata -> app_user_id).
  -- Null when no JWT (system writes / direct admin).
  begin
    v_claims := current_setting('request.jwt.claims', true);
    if v_claims is not null and v_claims <> '' then
      v_user_id := nullif(((v_claims::jsonb -> 'user_metadata') ->> 'app_user_id'), '')::uuid;
    end if;
  exception when others then
    v_user_id := null;
  end;

  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_before := null;
    v_after := to_jsonb(new);
    v_entity_id := coalesce(v_after->>'id', '');
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_entity_id := coalesce(v_after->>'id', v_before->>'id', '');
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
    v_entity_id := coalesce(v_before->>'id', '');
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, before_jsonb, after_jsonb)
  values (v_user_id, v_action, tg_table_name, v_entity_id, v_before, v_after);

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

do $$
declare
  t text;
  tbls text[] := array[
    'app_settings','stores','suppliers','prep_items','menu_items','addon_items',
    'ingredients','prep_item_recipe','menu_item_recipe',
    'sales_weeks','sales_entries','addon_entries',
    'prep_log','stock_counts','waste_entries',
    'store_orders','store_order_lines',
    'supplier_orders','supplier_order_lines',
    'catering_orders','catering_order_lines',
    'invoices','invoice_lines'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger_fn()', t, t);
  end loop;
end$$;

-- =============================================================================
-- RLS — single role (authenticated) full access. Anon has nothing.
-- =============================================================================

do $$
declare
  t text;
  tbls text[] := array[
    'app_settings','stores','suppliers','prep_items','menu_items','addon_items',
    'ingredients','prep_item_recipe','menu_item_recipe',
    'sales_weeks','sales_entries','addon_entries',
    'prep_log','stock_counts','waste_entries',
    'store_orders','store_order_lines',
    'supplier_orders','supplier_order_lines',
    'catering_orders','catering_order_lines',
    'invoices','invoice_lines'
  ];
  policy_name text;
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security', t);
    policy_name := t || '_authed';
    execute format('drop policy if exists %I on public.%I', policy_name, t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', policy_name, t);
  end loop;
end$$;

-- audit_log: insert + select policies for authenticated. No update, no delete.
alter table public.audit_log enable row level security;
drop policy if exists audit_insert on public.audit_log;
drop policy if exists audit_select on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated with check (true);
create policy audit_select on public.audit_log for select to authenticated using (true);
