-- Phase G — MORABITO garlic clause.
-- Fresh garlic must only be ordered on Monday-delivery slots. The supplier's
-- schedule_jsonb carries `"garlic_mon_only": true`. When delivery date is not
-- a Monday, exclude any ingredient whose code contains 'garlic'.
--
-- Implementation: replace supplier_order_recommendation, adding the filter
-- inside the final SELECT.

create or replace function public.supplier_order_recommendation(
  p_supplier_id uuid,
  p_delivery_date date
)
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
  v_delivery_weekday text;
  v_multiplier numeric := 1;
  v_note text;
  v_garlic_mon_only boolean;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;
  select schedule_jsonb into v_schedule from public.suppliers where id = p_supplier_id;
  v_kind := coalesce(v_schedule->>'kind', 'as_needed');
  v_garlic_mon_only := coalesce((v_schedule->>'garlic_mon_only')::boolean, false);
  v_weekday := trim(to_char(p_delivery_date - interval '1 day', 'Dy'));
  v_delivery_weekday := trim(to_char(p_delivery_date, 'Dy'));

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
    v_multiplier := 2.5;
    v_note := 'Thrice-weekly — ~2.5 day coverage';
  else
    v_multiplier := 1;
    v_note := 'As-needed';
  end if;

  if v_garlic_mon_only and v_delivery_weekday <> 'Mon' then
    v_note := v_note || ' · garlic excluded (Mon only)';
  end if;

  return query
  with weekly_prep_demand as (
    select cd.prep_item_id,
           sum(cd.demand_qty * (1 + coalesce(v_buffer, 0.10)))::numeric as weekly_qty
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
    group by pir.ingredient_id
  )
  select
    ing.id as ingredient_id,
    coalesce(iwn.need_qty, 0)::numeric as weekly_need,
    (coalesce(iwn.need_qty, 0) * v_multiplier / 7.0)::numeric as recommended_qty,
    0::numeric as on_hand,
    v_note as calculation_note
  from public.ingredients ing
  left join ingredient_weekly_need iwn on iwn.ingredient_id = ing.id
  where ing.supplier_id = p_supplier_id
    and not (v_garlic_mon_only
             and v_delivery_weekday <> 'Mon'
             and ing.code ilike '%garlic%');
end;
$$;

grant execute on function public.supplier_order_recommendation(uuid, date) to authenticated;
