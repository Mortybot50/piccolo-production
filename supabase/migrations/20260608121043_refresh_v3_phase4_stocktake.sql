-- Piccolo Production v3 refresh — Phase 4: par levels + ingredient stock counts + supplier RPC on-hand
-- Created 08/06/2026.

-- 1. Par levels on prep_items + ingredients.
alter table public.prep_items
  add column if not exists par_qty numeric;

alter table public.ingredients
  add column if not exists par_qty numeric;

-- 2. Extend stock_counts with the original input + unit + par snapshot.
--    qty_on_hand stays canonical (kg / L / pcs); input_qty + input_unit are
--    raw "Jonny typed 1500 g" + "g" so we can audit the conversion later.
alter table public.stock_counts
  add column if not exists input_qty numeric,
  add column if not exists input_unit text,
  add column if not exists par_qty_snapshot numeric,
  add column if not exists notes text;

-- 3. New table — ingredient_stock_counts. Same shape as stock_counts but
--    indexed on ingredients. Kept separate because:
--     a) cardinality is bigger (40 ingredients vs 9 prep items)
--     b) different RPC consumers (supplier_order_recommendation reads this;
--        prep_gap reads stock_counts)
--     c) cleaner type system, no polymorphic kind column
create table if not exists public.ingredient_stock_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty_on_hand numeric not null,
  input_qty numeric,
  input_unit text,
  par_qty_snapshot numeric,
  notes text,
  counted_by_user_id uuid references public.users(id) on delete set null,
  counted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (count_date, ingredient_id)
);

create index if not exists ingredient_stock_counts_ingredient_idx
  on public.ingredient_stock_counts (ingredient_id);
create index if not exists ingredient_stock_counts_date_idx
  on public.ingredient_stock_counts (count_date desc);

-- 4. Touch trigger + audit trigger + RLS for the new table.
drop trigger if exists ingredient_stock_counts_touch on public.ingredient_stock_counts;
create trigger ingredient_stock_counts_touch
  before update on public.ingredient_stock_counts
  for each row execute function public.touch_updated_at();

drop trigger if exists ingredient_stock_counts_audit on public.ingredient_stock_counts;
create trigger ingredient_stock_counts_audit
  after insert or update or delete on public.ingredient_stock_counts
  for each row execute function public.audit_trigger_fn();

alter table public.ingredient_stock_counts enable row level security;
drop policy if exists ingredient_stock_counts_authed on public.ingredient_stock_counts;
create policy ingredient_stock_counts_authed
  on public.ingredient_stock_counts
  for all to authenticated using (true) with check (true);

-- 5. supplier_order_recommendation v3 — now subtracts latest ingredient on-hand
--    from the recommended_qty. The RPC keeps the same shape; only the on_hand
--    column flips from a hardcoded 0 to the live count.
drop function if exists public.supplier_order_recommendation(uuid, date);

create or replace function public.supplier_order_recommendation(p_supplier_id uuid, p_delivery_date date)
returns table (
  ingredient_id uuid,
  weekly_need numeric,
  recommended_qty numeric,
  on_hand numeric,
  calculation_note text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_week_number int;
  v_buffer numeric;
  v_schedule jsonb;
  v_kind text;
  v_weekday_delivery text;
  v_weekday_order text;
  v_supplier_multiplier numeric := 1;
  v_supplier_note text;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;
  select schedule_jsonb into v_schedule from public.suppliers where id = p_supplier_id;

  v_kind := coalesce(v_schedule->>'kind', 'as_needed');
  v_weekday_delivery := trim(to_char(p_delivery_date, 'Dy'));
  v_weekday_order := trim(to_char(p_delivery_date - interval '1 day', 'Dy'));

  if v_kind = 'daily' then
    if v_weekday_order = 'Thu' then
      v_supplier_multiplier := 3;
      v_supplier_note := 'Thursday order covers Sat+Sun+Mon (3x)';
    else
      v_supplier_multiplier := 1;
      v_supplier_note := 'Daily next-day delivery';
    end if;
  elsif v_kind = 'weekly' then
    v_supplier_multiplier := 7;
    v_supplier_note := 'Weekly order — covers 7 days';
  elsif v_kind = 'thrice_weekly' then
    v_supplier_multiplier := 0;
    v_supplier_note := 'Thrice-weekly: per-ingredient split rule';
  else
    v_supplier_multiplier := 1;
    v_supplier_note := 'As-needed';
  end if;

  return query
  with weekly_prep_demand as (
    select cd.prep_item_id, sum(cd.demand_qty * (1 + coalesce(v_buffer, 0.10)))::numeric as weekly_qty
    from public.combined_demand_by_weekday(v_week_number) cd
    group by cd.prep_item_id
  ),
  ingredient_weekly_need as (
    select
      pir.ingredient_id,
      sum(
        coalesce(wpd.weekly_qty, 0)
          * case
              when pi.unit = pir.yield_unit then 1
              when pi.unit = 'kg' and pir.yield_unit = 'g' then 1000
              when pi.unit = 'L' and pir.yield_unit = 'ml' then 1000
              else 1
            end
          / nullif(pir.yield_qty, 0)
          * pir.qty_per_yield
      )::numeric as need_qty
    from public.prep_item_recipe pir
    join public.prep_items pi on pi.id = pir.prep_item_id
    left join weekly_prep_demand wpd on wpd.prep_item_id = pir.prep_item_id
    where pir.ingredient_id is not null
    group by pir.ingredient_id
  ),
  -- Latest count per ingredient on or before delivery date.
  latest_ingredient_count as (
    select distinct on (isc.ingredient_id)
      isc.ingredient_id, isc.qty_on_hand, isc.count_date
    from public.ingredient_stock_counts isc
    where isc.count_date <= p_delivery_date
    order by isc.ingredient_id, isc.count_date desc
  ),
  per_delivery as (
    select
      ing.id as ingredient_id,
      coalesce(iwn.need_qty, 0)::numeric as weekly_need,
      case
        when v_kind = 'thrice_weekly' then
          coalesce(iwn.need_qty, 0) *
          case coalesce(ing.split_rule, 'equal_split')
            when 'mon_only' then
              case when v_weekday_delivery = 'Mon' then 1.0 else 0.0 end
            when 'two_seven_three' then
              case v_weekday_delivery
                when 'Mon' then 2.0 / 7
                when 'Wed' then 2.0 / 7
                when 'Fri' then 3.0 / 7
                else 0.0
              end
            when 'third_each' then
              case when v_weekday_delivery in ('Mon','Wed','Fri') then 1.0 / 3 else 0.0 end
            else
              case when v_weekday_delivery in ('Mon','Wed','Fri') then 2.5 / 7 else 0.0 end
          end
        else (coalesce(iwn.need_qty, 0) * v_supplier_multiplier / 7.0)
      end::numeric as raw_delivery_qty,
      coalesce(lic.qty_on_hand, 0)::numeric as on_hand,
      case
        when v_kind = 'thrice_weekly' then
          v_supplier_note || ' (' || coalesce(ing.split_rule, 'equal_split') || ', ' || v_weekday_delivery || ')'
        else v_supplier_note
      end as calculation_note
    from public.ingredients ing
    left join ingredient_weekly_need iwn on iwn.ingredient_id = ing.id
    left join latest_ingredient_count lic on lic.ingredient_id = ing.id
    where ing.supplier_id = p_supplier_id
  )
  select
    pd.ingredient_id,
    pd.weekly_need,
    greatest(0, pd.raw_delivery_qty - pd.on_hand)::numeric as recommended_qty,
    pd.on_hand,
    pd.calculation_note
  from per_delivery pd;
end;
$$;

grant execute on function public.supplier_order_recommendation(uuid, date) to authenticated;
