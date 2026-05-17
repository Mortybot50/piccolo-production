-- Piccolo Production — v2 hardening Phase 1: rewritten RPCs.
--
--   * get_ingredient_cost(kind, id, as_of)  — recursive, cycle-detected
--   * compute_cogs(kind, id, as_of)         — one shared engine for menu+prep
--   * daily_prep_plan(date)                 — REWRITTEN to apply prep_plan_overrides
--   * supplier_order_recommendation(...)    — REWRITTEN to be recipe-driven,
--                                              preserving MORABITO garlic_mon_only
--   * weekly_invoice(...)                   — REWRITTEN to use effective-dated
--                                              transfer prices from history table
--
-- production_pnl is dropped (compute_cogs replaces its cost math; queries that
-- need produced/sent quantities can read prep_log directly).

-- =============================================================================
-- _unit_conv(qty, from_unit, to_unit) — internal helper
--   Converts numeric qty across food-prep units. Returns NULL when there is
--   no defined conversion (caller decides how to handle the gap).
-- =============================================================================

create or replace function public._unit_conv(p_qty numeric, p_from text, p_to text)
returns numeric
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_from is null or p_to is null then null
    when p_from = p_to then p_qty
    when p_from = 'g'  and p_to = 'kg' then p_qty / 1000.0
    when p_from = 'kg' and p_to = 'g'  then p_qty * 1000.0
    when p_from = 'ml' and p_to = 'L'  then p_qty / 1000.0
    when p_from = 'L'  and p_to = 'ml' then p_qty * 1000.0
    else null
  end;
$$;

grant execute on function public._unit_conv(numeric, text, text) to authenticated;

-- =============================================================================
-- get_ingredient_cost(p_kind, p_id, p_as_of_date, p_path) — recursive
--
--   p_kind = 'raw'  → reads ingredient_cost_history. Returns cents-per-pack-unit
--                     where pack_unit is ingredients.pack_unit (g, ml, bunch...).
--   p_kind = 'prep' → walks prep_item_recipe recursively. Returns cents-per-1-
--                     prep-item-base-unit, where base unit = prep_items.unit.
--   p_path          — internal; tracks the chain of prep_item_ids to detect
--                     cycles. Raises EXCEPTION when a cycle is found.
-- =============================================================================

create or replace function public.get_ingredient_cost(
  p_kind text,
  p_id uuid,
  p_as_of_date date default current_date,
  p_path uuid[] default '{}'::uuid[]
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_cost numeric;
  v_yield_qty numeric;
  v_yield_unit text;
  v_prep_unit text;
  v_yield_in_prep_unit numeric;
  v_batch_cost numeric := 0;
  v_line_cost numeric;
  v_child_natural_unit text;
  v_line_qty_in_child_unit numeric;
  r record;
begin
  if p_kind = 'raw' then
    select cost_per_unit_cents
      into v_cost
    from public.ingredient_cost_history
    where ingredient_id = p_id
      and effective_from <= p_as_of_date
      and (effective_to is null or effective_to > p_as_of_date)
    order by effective_from desc
    limit 1;
    return coalesce(v_cost, 0)::numeric;

  elsif p_kind = 'prep' then
    if p_id = any(p_path) then
      raise exception 'cyclic recipe detected; prep_item_id % already in path %', p_id, p_path
        using errcode = 'P0001';
    end if;

    select unit into v_prep_unit from public.prep_items where id = p_id;
    if v_prep_unit is null then
      return 0;
    end if;

    -- All lines for one prep share the same yield_qty + yield_unit.
    select yield_qty, yield_unit
      into v_yield_qty, v_yield_unit
    from public.prep_item_recipe
    where prep_item_id = p_id
    limit 1;

    if v_yield_qty is null or v_yield_qty = 0 then
      return 0;
    end if;

    for r in
      select * from public.prep_item_recipe where prep_item_id = p_id
    loop
      if r.ingredient_id is not null then
        -- Raw ingredient: cost-per-ingredient-pack-unit × qty_per_yield
        -- (assume qty_unit == ingredients.pack_unit; matches v1 production_pnl
        --  contract and the Phase B seed).
        v_line_cost := public.get_ingredient_cost('raw', r.ingredient_id, p_as_of_date, p_path || p_id)
                       * r.qty_per_yield;
      else
        -- Child prep item: cost-per-child-base-unit × qty_per_yield-in-child-units.
        select unit into v_child_natural_unit from public.prep_items where id = r.child_prep_item_id;
        v_line_qty_in_child_unit := coalesce(
          public._unit_conv(r.qty_per_yield, r.qty_unit, v_child_natural_unit),
          r.qty_per_yield  -- best-effort: assume already in child's unit
        );
        v_line_cost := public.get_ingredient_cost('prep', r.child_prep_item_id, p_as_of_date, p_path || p_id)
                       * v_line_qty_in_child_unit;
      end if;
      v_batch_cost := v_batch_cost + coalesce(v_line_cost, 0);
    end loop;

    -- Convert yield to prep_items.unit so callers get cost-per-1-prep-base-unit.
    v_yield_in_prep_unit := coalesce(
      public._unit_conv(v_yield_qty, v_yield_unit, v_prep_unit),
      v_yield_qty  -- best-effort
    );

    return (v_batch_cost / nullif(v_yield_in_prep_unit, 0))::numeric;
  end if;

  return 0;
end;
$$;

grant execute on function public.get_ingredient_cost(text, uuid, date, uuid[]) to authenticated;

-- =============================================================================
-- compute_cogs(p_kind, p_id, p_as_of_date)
--
--   p_kind = 'menu_item' → sum over menu_item_recipe of (qty_per_serve ×
--                          cost-per-1-target-base-unit, unit-converted).
--   p_kind = 'prep_item' → delegates to get_ingredient_cost('prep', id, asof).
--   Returns cents per single serve (menu) or per single prep-base-unit (prep).
-- =============================================================================

create or replace function public.compute_cogs(
  p_kind text,
  p_id uuid,
  p_as_of_date date default current_date
)
returns numeric
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total numeric := 0;
  v_line_cost numeric;
  v_ing_pack_unit text;
  v_prep_natural_unit text;
  v_line_qty_in_target_unit numeric;
  r record;
begin
  if p_kind = 'prep_item' then
    return public.get_ingredient_cost('prep', p_id, p_as_of_date, '{}'::uuid[]);
  elsif p_kind = 'menu_item' then
    for r in
      select * from public.menu_item_recipe where menu_item_id = p_id order by line_no
    loop
      if r.ingredient_id is not null then
        select pack_unit into v_ing_pack_unit from public.ingredients where id = r.ingredient_id;
        v_line_qty_in_target_unit := coalesce(
          public._unit_conv(r.qty_per_serve, r.qty_unit, v_ing_pack_unit),
          r.qty_per_serve
        );
        v_line_cost := public.get_ingredient_cost('raw', r.ingredient_id, p_as_of_date, '{}'::uuid[])
                       * v_line_qty_in_target_unit;
      else
        select unit into v_prep_natural_unit from public.prep_items where id = r.prep_item_id;
        v_line_qty_in_target_unit := coalesce(
          public._unit_conv(r.qty_per_serve, r.qty_unit, v_prep_natural_unit),
          r.qty_per_serve
        );
        v_line_cost := public.get_ingredient_cost('prep', r.prep_item_id, p_as_of_date, '{}'::uuid[])
                       * v_line_qty_in_target_unit;
      end if;
      v_total := v_total + coalesce(v_line_cost, 0);
    end loop;
    return v_total;
  end if;
  return 0;
end;
$$;

grant execute on function public.compute_cogs(text, uuid, date) to authenticated;

-- =============================================================================
-- transfer_price_as_of(p_prep_item_id, p_as_of_date)
--   Returns the transfer price (cents) effective on the given date, falling
--   back to prep_items.transfer_price_cents when no history row matches.
-- =============================================================================

create or replace function public.transfer_price_as_of(p_prep_item_id uuid, p_as_of_date date)
returns int
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (select price_cents
       from public.transfer_price_history
       where prep_item_id = p_prep_item_id
         and effective_from <= p_as_of_date
         and (effective_to is null or effective_to > p_as_of_date)
       order by effective_from desc
       limit 1),
    (select transfer_price_cents from public.prep_items where id = p_prep_item_id),
    0
  )::int;
$$;

grant execute on function public.transfer_price_as_of(uuid, date) to authenticated;

-- =============================================================================
-- daily_prep_plan(p_date) — REWRITTEN to apply prep_plan_overrides
-- =============================================================================

drop function if exists public.daily_prep_plan(date);

create or replace function public.daily_prep_plan(p_date date)
returns table (
  prep_item_id uuid,
  panini_avg numeric,
  addon_avg numeric,
  catering_qty numeric,
  calculated_total numeric,
  calculated_haw numeric,
  calculated_sy numeric,
  override_total numeric,
  override_haw numeric,
  override_sy numeric,
  effective_total numeric,
  effective_haw numeric,
  effective_sy numeric,
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
  v_weekday := trim(to_char(p_date, 'Dy'));

  return query
  with demand as (
    select cd.prep_item_id, sum(cd.demand_qty)::numeric as qty
    from public.combined_demand_by_weekday(v_week_number) cd
    where cd.weekday = v_weekday
    group by cd.prep_item_id
  ),
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
  split_weights as (
    select
      mr.prep_item_id,
      avg(mi.haw_split_pct)::numeric as haw_pct,
      avg(mi.sy_split_pct)::numeric  as sy_pct
    from public.menu_item_recipe mr
    join public.menu_items mi on mi.id = mr.menu_item_id
    where mr.prep_item_id is not null
    group by mr.prep_item_id
  ),
  ovr as (
    select prep_item_id, override_total, override_haw, override_sy
    from public.prep_plan_overrides
    where plan_date = p_date
  ),
  base as (
    select
      pi.id as prep_item_id,
      coalesce(d.qty, 0)::numeric as panini_avg,
      0::numeric as addon_avg,
      coalesce(cd.qty, 0)::numeric as catering_qty,
      ((coalesce(d.qty, 0) + coalesce(cd.qty, 0)) * (1 + coalesce(v_buffer, 0.10)))::numeric as calculated_total,
      coalesce(sw.haw_pct, 0.5) as haw_pct,
      coalesce(sw.sy_pct,  0.5) as sy_pct,
      pi.unit as unit
    from public.prep_items pi
    left join demand d on d.prep_item_id = pi.id
    left join catering_demand cd on cd.prep_item_id = pi.id
    left join split_weights sw on sw.prep_item_id = pi.id
    where pi.active
  )
  select
    b.prep_item_id,
    b.panini_avg,
    b.addon_avg,
    b.catering_qty,
    b.calculated_total,
    (b.calculated_total * b.haw_pct)::numeric as calculated_haw,
    (b.calculated_total * b.sy_pct)::numeric  as calculated_sy,
    o.override_total,
    o.override_haw,
    o.override_sy,
    coalesce(o.override_total, b.calculated_total)::numeric as effective_total,
    coalesce(o.override_haw,  b.calculated_total * b.haw_pct)::numeric as effective_haw,
    coalesce(o.override_sy,   b.calculated_total * b.sy_pct)::numeric  as effective_sy,
    b.unit
  from base b
  left join ovr o on o.prep_item_id = b.prep_item_id;
end;
$$;

grant execute on function public.daily_prep_plan(date) to authenticated;

-- =============================================================================
-- store_order_recommendation(p_store_id, p_for_date) — REWRITTEN with override
-- =============================================================================

drop function if exists public.store_order_recommendation(uuid, date);

create or replace function public.store_order_recommendation(p_store_id uuid, p_for_date date)
returns table (
  prep_item_id uuid,
  forecast numeric,
  with_buffer numeric,
  on_hand numeric,
  calculated_qty numeric,
  override_qty numeric,
  effective_qty numeric
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
    select distinct on (sc.prep_item_id) sc.prep_item_id, sc.qty_on_hand
    from public.stock_counts sc
    where sc.count_date <= p_for_date
    order by sc.prep_item_id, sc.count_date desc, sc.counted_at desc
  ),
  ovr as (
    select prep_item_id, override_qty
    from public.store_order_overrides
    where store_id = p_store_id and for_date = p_for_date
  )
  select
    pi.id as prep_item_id,
    (coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5))::numeric as forecast,
    (coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5) * (1 + coalesce(v_buffer, 0.10)))::numeric as with_buffer,
    coalesce(ls.qty_on_hand, 0)::numeric as on_hand,
    greatest(
      0,
      coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5) * (1 + coalesce(v_buffer, 0.10))
      - coalesce(ls.qty_on_hand, 0)
    )::numeric as calculated_qty,
    o.override_qty,
    coalesce(
      o.override_qty,
      greatest(
        0,
        coalesce(c.demand_qty, 0) * coalesce(s.pct, 0.5) * (1 + coalesce(v_buffer, 0.10))
        - coalesce(ls.qty_on_hand, 0)
      )
    )::numeric as effective_qty
  from public.prep_items pi
  left join combined c on c.prep_item_id = pi.id
  left join split s on s.prep_item_id = pi.id
  left join latest_stock ls on ls.prep_item_id = pi.id
  left join ovr o on o.prep_item_id = pi.id
  where pi.active;
end;
$$;

grant execute on function public.store_order_recommendation(uuid, date) to authenticated;

-- =============================================================================
-- supplier_order_recommendation(p_supplier_id, p_delivery_date) — REWRITTEN
--
-- Same shape as v1 (Morabito garlic_mon_only retained) but cleaner: drives
-- ingredient need from prep_item_recipe yields × weekly demand. The Morabito
-- garlic_mon_only / OROSO Thursday-covers-3-days rules stay encoded in the
-- supplier.schedule_jsonb config; the function reads them rather than
-- hard-coding ratios in SQL.
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
  v_multiplier numeric := 1;
  v_note text;
  v_garlic_mon_only boolean := false;
  v_skip_garlic_today boolean := false;
begin
  select latest_week_number, buffer_pct into v_week_number, v_buffer
    from public.app_settings limit 1;
  select schedule_jsonb into v_schedule from public.suppliers where id = p_supplier_id;

  v_kind := coalesce(v_schedule->>'kind', 'as_needed');
  v_weekday_delivery := trim(to_char(p_delivery_date, 'Dy'));
  v_weekday_order := trim(to_char(p_delivery_date - interval '1 day', 'Dy'));
  v_garlic_mon_only := coalesce((v_schedule->>'garlic_mon_only')::boolean, false);
  v_skip_garlic_today := v_garlic_mon_only and v_weekday_delivery <> 'Mon';

  if v_kind = 'daily' then
    if v_weekday_order = 'Thu' then
      v_multiplier := 3;
      v_note := 'Thursday order covers Sat+Sun+Mon (3x)';
    else
      v_multiplier := 1;
      v_note := 'Daily next-day delivery';
    end if;
  elsif v_kind = 'weekly' then
    v_multiplier := 7;
    v_note := 'Weekly order - covers 7 days';
  elsif v_kind = 'thrice_weekly' then
    v_multiplier := 2.5;
    v_note := 'Thrice-weekly - ~2.5 day coverage';
  else
    v_multiplier := 1;
    v_note := 'As-needed';
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
      when v_skip_garlic_today and ing.code = 'fresh_garlic' then 0::numeric
      else (coalesce(iwn.need_qty, 0) * v_multiplier / 7.0)::numeric
    end as recommended_qty,
    0::numeric as on_hand,
    case
      when v_skip_garlic_today and ing.code = 'fresh_garlic'
        then v_note || ' (garlic deferred to Monday delivery)'
      else v_note
    end as calculation_note
  from public.ingredients ing
  left join ingredient_weekly_need iwn on iwn.ingredient_id = ing.id
  where ing.supplier_id = p_supplier_id;
end;
$$;

grant execute on function public.supplier_order_recommendation(uuid, date) to authenticated;

-- =============================================================================
-- weekly_invoice(p_store_id, p_week_start, p_week_end) — REWRITTEN
--
-- Uses transfer_price_as_of(prep_item_id, log_date) per prep_log row to honour
-- effective-dated transfer prices. Existing v1 behaviour (current price for
-- everything) preserved when no history rows are inserted prior to p_week_end.
-- =============================================================================

drop function if exists public.weekly_invoice(uuid, date, date);

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
  with per_day as (
    -- Per (prep_item, log_date) sum × transfer_price_as_of(prep, log_date).
    select
      pl.prep_item_id,
      pl.log_date,
      sum(case
            when v_store_code = 'HAW' then pl.qty_sent_haw
            when v_store_code = 'SY'  then pl.qty_sent_sy
            else 0
          end)::numeric as day_qty
    from public.prep_log pl
    where pl.log_date between p_week_start and p_week_end
    group by pl.prep_item_id, pl.log_date
  ),
  per_day_priced as (
    select
      pd.prep_item_id,
      pd.day_qty,
      public.transfer_price_as_of(pd.prep_item_id, pd.log_date) as price_cents
    from per_day pd
    where pd.day_qty > 0
  ),
  rolled as (
    select
      pdp.prep_item_id,
      sum(pdp.day_qty)::numeric as qty,
      -- "Display" price = the price at the END of the week (most invoice-readers
      -- expect a single number per row, even when daily prices differed).
      public.transfer_price_as_of(pdp.prep_item_id, p_week_end) as display_unit_price,
      sum(pdp.day_qty * pdp.price_cents)::numeric as line_total
    from per_day_priced pdp
    group by pdp.prep_item_id
  )
  select
    pi.id as prep_item_id,
    coalesce(r.qty, 0)::numeric as qty,
    coalesce(r.display_unit_price, 0)::int as unit_price_cents,
    round(coalesce(r.line_total, 0))::int as line_total_cents
  from public.prep_items pi
  left join rolled r on r.prep_item_id = pi.id
  where pi.active and coalesce(r.qty, 0) > 0;
end;
$$;

grant execute on function public.weekly_invoice(uuid, date, date) to authenticated;

-- =============================================================================
-- production_pnl is superseded by compute_cogs + prep_log direct queries.
-- Drop the v1 function to make the new contract authoritative.
-- =============================================================================

drop function if exists public.production_pnl(date, date);
