-- Piccolo Production — Phase B RPCs + pg_cron
-- Postgres functions for sales averages, demand, prep planning, ordering,
-- invoicing, and production P&L. Grant execute to authenticated.

-- ============================================================================
-- sales_averages_4wk
--   4-week rolling average of sales_entries.qty per menu_item × weekday for a store.
--   Window = [p_week_number - 3 .. p_week_number].
-- ============================================================================
create or replace function public.sales_averages_4wk(p_store_id uuid, p_week_number int)
returns table (
  menu_item_id uuid,
  weekday text,
  avg_qty numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    se.menu_item_id,
    se.weekday,
    avg(se.qty)::numeric as avg_qty
  from public.sales_entries se
  join public.sales_weeks sw on sw.id = se.week_id
  where se.store_id = p_store_id
    and sw.week_number between (p_week_number - 3) and p_week_number
  group by se.menu_item_id, se.weekday;
$$;

grant execute on function public.sales_averages_4wk(uuid, int) to authenticated;

-- ============================================================================
-- combined_demand_by_weekday
--   Total prep-item demand per weekday across BOTH stores, summing:
--     panini demand: sales_avg × menu_item_recipe.qty_per_serve (converted to prep unit)
--     addon demand: addon_avg × addon_items.portion_g (converted)
--   Conversion: when prep_item.unit in ('kg','L') and recipe qty_unit in ('g','ml'),
--   divide by 1000. Otherwise leave as-is.
-- ============================================================================
create or replace function public.combined_demand_by_weekday(p_week_number int)
returns table (
  prep_item_id uuid,
  weekday text,
  demand_qty numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with weekday_list as (
    select unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) as wd
  ),
  -- Sales averages across BOTH stores, per menu_item × weekday.
  sales_avg as (
    select
      se.menu_item_id,
      se.weekday,
      avg(se.qty)::numeric as avg_qty
    from public.sales_entries se
    join public.sales_weeks sw on sw.id = se.week_id
    where sw.week_number between (p_week_number - 3) and p_week_number
    group by se.menu_item_id, se.weekday
  ),
  addon_avg as (
    select
      ae.addon_item_id,
      ae.weekday,
      avg(ae.qty)::numeric as avg_qty
    from public.addon_entries ae
    join public.sales_weeks sw on sw.id = ae.week_id
    where sw.week_number between (p_week_number - 3) and p_week_number
    group by ae.addon_item_id, ae.weekday
  ),
  -- Demand from panini recipes (menu_item_recipe lines that reference a prep_item).
  panini_demand as (
    select
      mr.prep_item_id,
      sa.weekday,
      coalesce(sa.avg_qty, 0) *
        case
          when pi.unit in ('kg','L') and mr.qty_unit in ('g','ml')
            then mr.qty_per_serve / 1000.0
          else mr.qty_per_serve
        end as qty
    from public.menu_item_recipe mr
    join public.prep_items pi on pi.id = mr.prep_item_id
    cross join weekday_list wl
    left join sales_avg sa
      on sa.menu_item_id = mr.menu_item_id and sa.weekday = wl.wd
    where mr.prep_item_id is not null
      and sa.weekday is not null
  ),
  -- Demand from addons.
  addon_demand as (
    select
      ai.linked_prep_item_id as prep_item_id,
      aa.weekday,
      coalesce(aa.avg_qty, 0) *
        case
          when pi.unit in ('kg','L') then coalesce(ai.portion_g, pi.portion_g) / 1000.0
          else 1
        end as qty
    from public.addon_items ai
    join public.prep_items pi on pi.id = ai.linked_prep_item_id
    join addon_avg aa on aa.addon_item_id = ai.id
    where ai.linked_prep_item_id is not null
  ),
  combined as (
    select prep_item_id, weekday, qty from panini_demand
    union all
    select prep_item_id, weekday, qty from addon_demand
  )
  select prep_item_id, weekday, sum(qty)::numeric as demand_qty
  from combined
  group by prep_item_id, weekday;
$$;

grant execute on function public.combined_demand_by_weekday(int) to authenticated;

-- ============================================================================
-- daily_prep_plan(p_date)
--   For each active prep item, compute panini_avg + addon_avg + catering_qty,
--   apply buffer, split by HAW/SY (weighted by contributing menu items' sales
--   splits, or fall back to even split for items without recipe linkage).
-- ============================================================================
create or replace function public.daily_prep_plan(p_date date)
returns table (
  prep_item_id uuid,
  panini_avg numeric,
  addon_avg numeric,
  catering_qty numeric,
  total_with_buffer numeric,
  haw_split numeric,
  sy_split numeric,
  unit text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_week_number int;
  v_buffer numeric;
  v_weekday text;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;

  v_weekday := trim(to_char(p_date, 'Dy'));  -- 'Mon','Tue',...

  return query
  with demand as (
    select cd.prep_item_id, cd.weekday, cd.demand_qty
    from public.combined_demand_by_weekday(v_week_number) cd
    where cd.weekday = v_weekday
  ),
  -- Catering demand: catering_orders on p_date → menu_item × qty → prep_item demand
  catering_demand as (
    select
      mr.prep_item_id,
      sum(col.qty *
        case
          when pi.unit in ('kg','L') and mr.qty_unit in ('g','ml')
            then mr.qty_per_serve / 1000.0
          else mr.qty_per_serve
        end
      )::numeric as qty
    from public.catering_orders co
    join public.catering_order_lines col on col.catering_order_id = co.id
    join public.menu_item_recipe mr on mr.menu_item_id = col.menu_item_id
    join public.prep_items pi on pi.id = mr.prep_item_id
    where co.delivery_date = p_date
      and mr.prep_item_id is not null
    group by mr.prep_item_id
  ),
  -- Weighted HAW% per prep item (from sales-weighted menu_items splits)
  split_weights as (
    select
      mr.prep_item_id,
      avg(mi.haw_split_pct)::numeric as haw_pct,
      avg(mi.sy_split_pct)::numeric  as sy_pct
    from public.menu_item_recipe mr
    join public.menu_items mi on mi.id = mr.menu_item_id
    where mr.prep_item_id is not null
    group by mr.prep_item_id
  )
  select
    pi.id as prep_item_id,
    coalesce(d.demand_qty, 0)::numeric as panini_avg,
    0::numeric as addon_avg,  -- addon demand is already folded into combined_demand
    coalesce(cd.qty, 0)::numeric as catering_qty,
    ((coalesce(d.demand_qty, 0) + coalesce(cd.qty, 0)) * (1 + coalesce(v_buffer, 0.10)))::numeric as total_with_buffer,
    ((coalesce(d.demand_qty, 0) + coalesce(cd.qty, 0)) * (1 + coalesce(v_buffer, 0.10)) * coalesce(sw.haw_pct, 0.5))::numeric as haw_split,
    ((coalesce(d.demand_qty, 0) + coalesce(cd.qty, 0)) * (1 + coalesce(v_buffer, 0.10)) * coalesce(sw.sy_pct, 0.5))::numeric as sy_split,
    pi.unit as unit
  from public.prep_items pi
  left join demand d on d.prep_item_id = pi.id
  left join catering_demand cd on cd.prep_item_id = pi.id
  left join split_weights sw on sw.prep_item_id = pi.id
  where pi.active;
end;
$$;

grant execute on function public.daily_prep_plan(date) to authenticated;

-- ============================================================================
-- prep_gap(p_date)
--   For each active prep item: today's demand + rest-of-week demand,
--   minus latest stock_count on or before p_date.
-- ============================================================================
create or replace function public.prep_gap(p_date date)
returns table (
  prep_item_id uuid,
  today_demand numeric,
  rest_of_week_demand numeric,
  total_needed numeric,
  stock_on_hand numeric,
  prep_gap numeric,
  batches_to_make numeric,
  status text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_week_number int;
  v_buffer numeric;
  v_weekday text;
  v_dow_index int;
  v_weekdays text[] := array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;

  v_weekday := trim(to_char(p_date, 'Dy'));
  v_dow_index := array_position(v_weekdays, v_weekday);

  return query
  with combined as (
    select * from public.combined_demand_by_weekday(v_week_number)
  ),
  today as (
    select c.prep_item_id, sum(c.demand_qty * (1 + coalesce(v_buffer, 0.10)))::numeric as qty
    from combined c
    where c.weekday = v_weekday
    group by c.prep_item_id
  ),
  rest_of_week as (
    select c.prep_item_id, sum(c.demand_qty * (1 + coalesce(v_buffer, 0.10)))::numeric as qty
    from combined c
    where array_position(v_weekdays, c.weekday) > v_dow_index
    group by c.prep_item_id
  ),
  latest_stock as (
    select distinct on (sc.prep_item_id)
      sc.prep_item_id, sc.qty_on_hand, sc.count_date
    from public.stock_counts sc
    where sc.count_date <= p_date
    order by sc.prep_item_id, sc.count_date desc, sc.counted_at desc
  )
  select
    pi.id as prep_item_id,
    coalesce(t.qty, 0)::numeric as today_demand,
    coalesce(rw.qty, 0)::numeric as rest_of_week_demand,
    (coalesce(t.qty, 0) + coalesce(rw.qty, 0))::numeric as total_needed,
    coalesce(ls.qty_on_hand, 0)::numeric as stock_on_hand,
    greatest(0, coalesce(t.qty, 0) + coalesce(rw.qty, 0) - coalesce(ls.qty_on_hand, 0))::numeric as prep_gap,
    case
      when pi.batch_size is null or pi.batch_size = 0 then null
      else ceil(greatest(0, coalesce(t.qty, 0) + coalesce(rw.qty, 0) - coalesce(ls.qty_on_hand, 0)) / pi.batch_size)::numeric
    end as batches_to_make,
    case
      when ls.qty_on_hand is null then 'count_stock'
      when coalesce(ls.qty_on_hand, 0) < coalesce(t.qty, 0) then '🔴 PREP NOW'
      when coalesce(ls.qty_on_hand, 0) < coalesce(t.qty, 0) * 2 then '🟡 LOW'
      else '🟢 OK'
    end as status
  from public.prep_items pi
  left join today t on t.prep_item_id = pi.id
  left join rest_of_week rw on rw.prep_item_id = pi.id
  left join latest_stock ls on ls.prep_item_id = pi.id
  where pi.active;
end;
$$;

grant execute on function public.prep_gap(date) to authenticated;

-- ============================================================================
-- store_order_recommendation(p_store_id, p_for_date)
--   Per-prep-item forecast for the weekday of p_for_date, weighted by the
--   store's split-share of demand, minus on-hand, with buffer.
-- ============================================================================
create or replace function public.store_order_recommendation(p_store_id uuid, p_for_date date)
returns table (
  prep_item_id uuid,
  forecast numeric,
  with_buffer numeric,
  on_hand numeric,
  recommended_qty numeric
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_week_number int;
  v_buffer numeric;
  v_weekday text;
  v_store_code text;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;
  v_weekday := trim(to_char(p_for_date, 'Dy'));
  select code into v_store_code from public.stores where id = p_store_id;

  return query
  with combined as (
    select * from public.combined_demand_by_weekday(v_week_number)
    where weekday = v_weekday
  ),
  split as (
    select
      mr.prep_item_id,
      case when v_store_code = 'HAW' then avg(mi.haw_split_pct)
           when v_store_code = 'SY'  then avg(mi.sy_split_pct)
           else 0.5 end::numeric as pct
    from public.menu_item_recipe mr
    join public.menu_items mi on mi.id = mr.menu_item_id
    where mr.prep_item_id is not null
    group by mr.prep_item_id
  ),
  latest_stock as (
    select distinct on (sc.prep_item_id)
      sc.prep_item_id, sc.qty_on_hand
    from public.stock_counts sc
    where sc.count_date <= p_for_date
    order by sc.prep_item_id, sc.count_date desc, sc.counted_at desc
  )
  select
    pi.id as prep_item_id,
    (coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5))::numeric as forecast,
    (coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5) * (1 + coalesce(v_buffer, 0.10)))::numeric as with_buffer,
    coalesce(ls.qty_on_hand, 0)::numeric as on_hand,
    greatest(0, coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5) * (1 + coalesce(v_buffer, 0.10)) - coalesce(ls.qty_on_hand, 0))::numeric as recommended_qty
  from public.prep_items pi
  left join combined c on c.prep_item_id = pi.id
  left join split s on s.prep_item_id = pi.id
  left join latest_stock ls on ls.prep_item_id = pi.id
  where pi.active;
end;
$$;

grant execute on function public.store_order_recommendation(uuid, date) to authenticated;

-- ============================================================================
-- supplier_order_recommendation(p_supplier_id, p_delivery_date)
--   For each ingredient supplied by p_supplier_id, compute weekly need
--   from prep_item_recipe × weekly demand from combined_demand_by_weekday.
--   Encode OROSO Thursday=3× covers Sat+Sun+Mon rule via schedule_jsonb.
-- ============================================================================
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
  v_weekday text;
  v_multiplier numeric := 1;
  v_note text;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;
  select schedule_jsonb into v_schedule from public.suppliers where id = p_supplier_id;
  v_kind := coalesce(v_schedule->>'kind', 'as_needed');
  v_weekday := trim(to_char(p_delivery_date - interval '1 day', 'Dy'));  -- order day = delivery - 1

  -- OROSO Thursday-covers-3-days: when delivery_date is Saturday, the order
  -- placed Thursday must cover Sat+Sun+Mon.
  if v_kind = 'daily' then
    if v_weekday = 'Thu' then
      v_multiplier := 3;
      v_note := 'Thursday order covers Sat+Sun+Mon (×3)';
    else
      v_multiplier := 1;
      v_note := 'Daily next-day delivery';
    end if;
  elsif v_kind = 'weekly' then
    v_multiplier := 7;
    v_note := 'Weekly order — covers 7 days';
  elsif v_kind = 'thrice_weekly' then
    v_multiplier := 2.5;  -- average 2-3 days coverage per slot
    v_note := 'Thrice-weekly — ~2.5 day coverage';
  else
    v_multiplier := 1;
    v_note := 'As-needed';
  end if;

  return query
  with weekly_prep_demand as (
    -- Sum demand across all weekdays = weekly demand for each prep_item.
    select cd.prep_item_id, sum(cd.demand_qty * (1 + coalesce(v_buffer, 0.10)))::numeric as weekly_qty
    from public.combined_demand_by_weekday(v_week_number) cd
    group by cd.prep_item_id
  ),
  ingredient_weekly_need as (
    -- For each ingredient, sum across prep recipes: (weekly_prep_demand / prep yield) × recipe qty_per_yield
    -- This converts prep demand → raw ingredient consumption.
    select
      pir.ingredient_id,
      sum(
        coalesce(wpd.weekly_qty, 0)
          * case
              -- Convert weekly_prep_demand (in prep.unit) to yield_unit if mismatched.
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
    group by pir.ingredient_id
  )
  select
    ing.id as ingredient_id,
    coalesce(iwn.need_qty, 0)::numeric as weekly_need,
    (coalesce(iwn.need_qty, 0) * v_multiplier / 7.0)::numeric as recommended_qty,
    0::numeric as on_hand,  -- on-hand for raw ingredients not tracked in v1
    v_note as calculation_note
  from public.ingredients ing
  left join ingredient_weekly_need iwn on iwn.ingredient_id = ing.id
  where ing.supplier_id = p_supplier_id;
end;
$$;

grant execute on function public.supplier_order_recommendation(uuid, date) to authenticated;

-- ============================================================================
-- weekly_invoice(p_store_id, p_week_start, p_week_end)
--   Sum prep_log.qty_sent_<store> for the store across the week, × transfer_price.
-- ============================================================================
create or replace function public.weekly_invoice(p_store_id uuid, p_week_start date, p_week_end date)
returns table (
  prep_item_id uuid,
  qty numeric,
  unit_price_cents int,
  line_total_cents int
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_store_code text;
begin
  select code into v_store_code from public.stores where id = p_store_id;

  return query
  with totals as (
    select
      pl.prep_item_id,
      sum(case
            when v_store_code = 'HAW' then pl.qty_sent_haw
            when v_store_code = 'SY'  then pl.qty_sent_sy
            else 0
          end)::numeric as total_qty
    from public.prep_log pl
    where pl.log_date between p_week_start and p_week_end
    group by pl.prep_item_id
  )
  select
    pi.id as prep_item_id,
    coalesce(t.total_qty, 0)::numeric as qty,
    coalesce(pi.transfer_price_cents, 0) as unit_price_cents,
    round(coalesce(t.total_qty, 0) * coalesce(pi.transfer_price_cents, 0))::int as line_total_cents
  from public.prep_items pi
  left join totals t on t.prep_item_id = pi.id
  where pi.active and coalesce(t.total_qty, 0) > 0;
end;
$$;

grant execute on function public.weekly_invoice(uuid, date, date) to authenticated;

-- ============================================================================
-- production_pnl(p_start_date, p_end_date)
--   For each prep item: total produced, total sent, computed COGS per unit
--   (from prep_item_recipe × ingredient cost_per_unit_cents),
--   transfer price, per-unit margin, margin %.
-- ============================================================================
create or replace function public.production_pnl(p_start_date date, p_end_date date)
returns table (
  prep_item_id uuid,
  qty_produced numeric,
  qty_sent_total numeric,
  computed_cogs_per_unit_cents numeric,
  transfer_price_cents int,
  margin_per_unit_cents numeric,
  margin_pct numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with prod as (
    select
      pl.prep_item_id,
      sum(pl.qty_prepped)::numeric as qty_produced,
      sum(pl.qty_sent_haw + pl.qty_sent_sy)::numeric as qty_sent_total
    from public.prep_log pl
    where pl.log_date between p_start_date and p_end_date
    group by pl.prep_item_id
  ),
  -- Compute COGS per unit of prep item: sum over recipe lines of
  --   (ingredient.cost_per_unit_cents × recipe.qty_per_yield) / yield_qty,
  -- where cost_per_unit is in cents per ingredient.pack_unit.
  -- Assume qty_unit matches the ingredient's pack_unit (g↔g, ml↔ml, etc.).
  cogs as (
    select
      pir.prep_item_id,
      sum(coalesce(ing.cost_per_unit_cents, 0) * pir.qty_per_yield) / nullif(max(pir.yield_qty), 0) as cogs_per_yield_unit
    from public.prep_item_recipe pir
    join public.ingredients ing on ing.id = pir.ingredient_id
    group by pir.prep_item_id
  )
  select
    pi.id as prep_item_id,
    coalesce(prod.qty_produced, 0)::numeric as qty_produced,
    coalesce(prod.qty_sent_total, 0)::numeric as qty_sent_total,
    coalesce(cogs.cogs_per_yield_unit, 0)::numeric as computed_cogs_per_unit_cents,
    coalesce(pi.transfer_price_cents, 0) as transfer_price_cents,
    (coalesce(pi.transfer_price_cents, 0) - coalesce(cogs.cogs_per_yield_unit, 0))::numeric as margin_per_unit_cents,
    case
      when coalesce(pi.transfer_price_cents, 0) = 0 then null
      else ((coalesce(pi.transfer_price_cents, 0) - coalesce(cogs.cogs_per_yield_unit, 0)) / pi.transfer_price_cents::numeric)
    end as margin_pct
  from public.prep_items pi
  left join prod on prod.prep_item_id = pi.id
  left join cogs on cogs.prep_item_id = pi.id
  where pi.active;
$$;

grant execute on function public.production_pnl(date, date) to authenticated;

-- ============================================================================
-- auto_advance_week()
--   Increments app_settings.latest_week_number and ensures a sales_weeks row
--   exists for the new week (Monday start, Sunday end).
-- ============================================================================
create or replace function public.auto_advance_week()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_week int;
  v_week_start date;
begin
  update public.app_settings
    set latest_week_number = latest_week_number + 1
    returning latest_week_number into v_new_week;

  v_week_start := date_trunc('week', current_date)::date;

  insert into public.sales_weeks (week_number, week_start_date, week_end_date)
  values (v_new_week, v_week_start, v_week_start + 6)
  on conflict (week_number) do nothing;
end;
$$;

grant execute on function public.auto_advance_week() to authenticated;

-- ============================================================================
-- pg_cron job: weekly auto-advance, Monday 03:00 AEST (= Sunday 17:00 UTC).
-- DST drift accepted for v1.
-- ============================================================================
do $$
declare
  v_existing_job_id bigint;
begin
  select jobid into v_existing_job_id from cron.job where jobname = 'piccolo-auto-advance-week';
  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;
  perform cron.schedule(
    'piccolo-auto-advance-week',
    '0 17 * * SUN',
    $cmd$ select public.auto_advance_week(); $cmd$
  );
end$$;
