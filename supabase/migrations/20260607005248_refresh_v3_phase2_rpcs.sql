-- Piccolo Production v3 refresh — Phase 2: RPCs honour configurable forecast + per-ingredient split rules
-- Created 07/06/2026 per REFRESH-PLAN-2026-06-07.md

-- =============================================================================
-- sales_averages_4wk — REWRITTEN to read app_settings.window_weeks +
--                     app_settings.use_median + skip sales_weeks.exclude_from_avg.
-- Name kept for backwards compatibility; the "4wk" suffix is now configurable.
-- =============================================================================
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
  with cfg as (
    select coalesce(window_weeks, 4) as ww, coalesce(use_median, false) as med
    from public.app_settings limit 1
  )
  select
    se.menu_item_id,
    se.weekday,
    case
      when (select med from cfg)
        then percentile_cont(0.5) within group (order by se.qty)::numeric
      else avg(se.qty)::numeric
    end as avg_qty
  from public.sales_entries se
  join public.sales_weeks sw on sw.id = se.week_id
  where se.store_id = p_store_id
    and sw.week_number between
      (p_week_number - (select ww from cfg) + 1) and p_week_number
    and coalesce(sw.exclude_from_avg, false) = false
  group by se.menu_item_id, se.weekday;
$$;

grant execute on function public.sales_averages_4wk(uuid, int) to authenticated;

-- =============================================================================
-- combined_demand_by_weekday — same window/exclude/median treatment.
-- =============================================================================
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
  with cfg as (
    select coalesce(window_weeks, 4) as ww, coalesce(use_median, false) as med
    from public.app_settings limit 1
  ),
  weekday_list as (
    select unnest(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) as wd
  ),
  sales_avg as (
    select
      se.menu_item_id,
      se.weekday,
      case
        when (select med from cfg)
          then percentile_cont(0.5) within group (order by se.qty)::numeric
        else avg(se.qty)::numeric
      end as avg_qty
    from public.sales_entries se
    join public.sales_weeks sw on sw.id = se.week_id
    where sw.week_number between
      (p_week_number - (select ww from cfg) + 1) and p_week_number
      and coalesce(sw.exclude_from_avg, false) = false
    group by se.menu_item_id, se.weekday
  ),
  addon_avg as (
    select
      ae.addon_item_id,
      ae.weekday,
      case
        when (select med from cfg)
          then percentile_cont(0.5) within group (order by ae.qty)::numeric
        else avg(ae.qty)::numeric
      end as avg_qty
    from public.addon_entries ae
    join public.sales_weeks sw on sw.id = ae.week_id
    where sw.week_number between
      (p_week_number - (select ww from cfg) + 1) and p_week_number
      and coalesce(sw.exclude_from_avg, false) = false
    group by ae.addon_item_id, ae.weekday
  ),
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

-- =============================================================================
-- supplier_order_recommendation — REWRITTEN to honour per-ingredient split_rule.
-- Each ingredient now picks its own per-delivery multiplier based on its rule,
-- replacing the legacy supplier-level garlic_mon_only flag (which kept working
-- for fresh_garlic, but had no way to express the workbook's salad-veg 2/7-2/7-3/7
-- or tomato 1/3 patterns).
-- =============================================================================
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
    v_supplier_multiplier := 0; -- per-ingredient split_rule decides; see below.
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
  )
  select
    ing.id as ingredient_id,
    coalesce(iwn.need_qty, 0)::numeric as weekly_need,
    case
      -- thrice_weekly: pick per-ingredient fraction based on rule + weekday.
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
          -- 'equal_split' (default): ~2.5/7 across each delivery, matches legacy v2 behavior.
          else
            case when v_weekday_delivery in ('Mon','Wed','Fri') then 2.5 / 7 else 0.0 end
        end
      -- daily / weekly / as_needed: use supplier-level multiplier.
      else (coalesce(iwn.need_qty, 0) * v_supplier_multiplier / 7.0)
    end::numeric as recommended_qty,
    0::numeric as on_hand,
    case
      when v_kind = 'thrice_weekly' then
        v_supplier_note || ' (' || coalesce(ing.split_rule, 'equal_split') || ', ' || v_weekday_delivery || ')'
      else v_supplier_note
    end as calculation_note
  from public.ingredients ing
  left join ingredient_weekly_need iwn on iwn.ingredient_id = ing.id
  where ing.supplier_id = p_supplier_id;
end;
$$;

grant execute on function public.supplier_order_recommendation(uuid, date) to authenticated;
