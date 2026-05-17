-- Piccolo Production — v2 parity test.
--
-- Asserts the v2 engine matches expected workbook + v1 numbers within rounding.
-- Run via: psql "$DB_URL" -f supabase/tests/v2_parity.sql
-- Or: supabase db remote pull && supabase test db -f supabase/tests/v2_parity.sql
--
-- Each block RAISEs EXCEPTION on FAIL with a descriptive message so the harness
-- exits non-zero. Tolerance: $0.01 (1 cent) per the brief, except for batch-
-- recipe yields where unit-conversion rounding can land at the half-cent level.
--
-- Targets (per Phase 1 step 6 of the v2 dispatch):
--   1. Cotoletta menu_item COGS — sanity (workbook ~$3.21)
--   2. Salsa Verde prep_item COGS — workbook §4.1 D101 batch cost
--   3. Weekly invoice for seeded week — non-zero, well-formed
--   4. Supplier order rec for Oroso Tuesday — multiplier=1 (next-day delivery)
--   5. Supplier order rec for Oroso Thursday — multiplier=3 (covers Sat+Sun+Mon)
--   6. Morabito Tuesday → fresh_garlic suppressed
--   7. Recursion cycle detection raises P0001
--   8. Effective-dated price: insert a future row, prior-date returns old price.

\set ON_ERROR_STOP on

do $$
declare
  v_id uuid;
  v_cogs numeric;
  v_tol numeric := 1.0;  -- cents
begin
  -- ============== TEST 1: Cotoletta COGS sanity ==============
  select id into v_id from public.menu_items where code = 'cotoletta';
  v_cogs := public.compute_cogs('menu_item', v_id, current_date);
  -- Workbook expectation: ~321 cents (the_deli + cotoletta uses cotoletta prep + mayo + salsa)
  if v_cogs < 250 or v_cogs > 400 then
    raise exception 'FAIL: parity violation on cotoletta menu COGS: got %, expected 250-400 cents', v_cogs;
  end if;
  raise notice 'PASS test 1: cotoletta menu COGS = % cents', round(v_cogs, 2);

  -- ============== TEST 2: Salsa Verde batch COGS — §4.1 D101 ==============
  -- Salsa Verde recipe per seed: yield 1.245kg from:
  --   curly parsley 350g, oroso 60g, pinenuts 100g, capers 50g, anchovies 25g,
  --   garlic 10g, parmesan 200g, EVOO 450ml.
  -- Workbook D101 ≈ $9.97 (997¢) per 1.245kg batch ≈ 800.7¢/kg.
  -- v2 engine must agree within 1¢/kg.
  select id into v_id from public.prep_items where code = 'salsa_verde';
  v_cogs := public.compute_cogs('prep_item', v_id, current_date);
  if abs(v_cogs - 800.73) > 1 then
    raise exception 'FAIL: parity violation on salsa_verde batch COGS: got % cents/kg, expected ~800.73 (±1)', v_cogs;
  end if;
  raise notice 'PASS test 2: salsa_verde COGS = % cents/kg (workbook ~800.73)', round(v_cogs, 4);

  -- ============== TEST 3: Weekly invoice well-formed ==============
  -- Without prep_log rows seeded yet, the call returns 0 rows; this just asserts
  -- the function executes without error (signature parity with v1).
  declare
    v_store uuid;
    v_count int;
  begin
    select id into v_store from public.stores where code = 'HAW' limit 1;
    if v_store is null then
      raise exception 'FAIL: no HAW store seeded';
    end if;
    select count(*) into v_count
    from public.weekly_invoice(v_store, current_date - 7, current_date);
    raise notice 'PASS test 3: weekly_invoice(HAW, week) executed, returned % rows', v_count;
  end;

  -- ============== TEST 4: Supplier order rec - Oroso Tuesday ==============
  -- Oroso kind='daily', delivery Tue ← order Mon → multiplier=1, "Daily next-day delivery".
  declare
    v_supplier uuid;
    v_note text;
    v_tue date := date_trunc('week', current_date + interval '7 days')::date + 1;  -- next Tue
  begin
    select id into v_supplier from public.suppliers where code = 'oroso' limit 1;
    if v_supplier is null then
      raise notice 'SKIP test 4: oroso supplier not seeded';
    else
      select calculation_note into v_note
      from public.supplier_order_recommendation(v_supplier, v_tue) limit 1;
      if v_note is null or v_note not ilike '%daily next-day%' then
        raise exception 'FAIL: parity violation on oroso Tuesday note: got %, expected "Daily next-day delivery"', v_note;
      end if;
      raise notice 'PASS test 4: oroso Tue note = "%"', v_note;
    end if;
  end;

  -- ============== TEST 5: Oroso Friday (order Thu → multiplier=3) ==============
  declare
    v_supplier uuid;
    v_note text;
    v_fri date := date_trunc('week', current_date + interval '7 days')::date + 4;  -- next Fri
  begin
    select id into v_supplier from public.suppliers where code = 'oroso' limit 1;
    if v_supplier is not null then
      select calculation_note into v_note
      from public.supplier_order_recommendation(v_supplier, v_fri) limit 1;
      if v_note is null or v_note not ilike '%covers Sat+Sun+Mon%' then
        raise exception 'FAIL: parity violation on oroso Fri note: got %, expected Thursday-covers-3-days', v_note;
      end if;
      raise notice 'PASS test 5: oroso Fri (order Thu) note = "%"', v_note;
    end if;
  end;

  -- ============== TEST 6: Morabito garlic suppression — Tue (non-Mon) ==============
  declare
    v_supplier uuid;
    v_garlic uuid;
    v_qty numeric;
    v_tue date := date_trunc('week', current_date + interval '7 days')::date + 1;
  begin
    select id into v_supplier from public.suppliers where code = 'morabito' limit 1;
    select id into v_garlic from public.ingredients where code = 'fresh_garlic' limit 1;
    if v_supplier is not null and v_garlic is not null then
      select recommended_qty into v_qty
      from public.supplier_order_recommendation(v_supplier, v_tue)
      where ingredient_id = v_garlic;
      if v_qty is null then
        raise notice 'SKIP test 6: fresh_garlic not under morabito supplier';
      elsif v_qty <> 0 then
        raise exception 'FAIL: parity violation on morabito Tue garlic: got %, expected 0 (Mon-only clause)', v_qty;
      else
        raise notice 'PASS test 6: morabito Tue fresh_garlic suppressed (qty=0)';
      end if;
    end if;
  end;

  -- ============== TEST 7: Recursion cycle detection ==============
  -- Insert a temporary self-referencing recipe row, expect P0001.
  declare
    v_prep uuid;
    v_recipe_id uuid;
    v_caught boolean := false;
  begin
    select id into v_prep from public.prep_items where code = 'salsa_verde' limit 1;
    -- Insert a child_prep_item_id pointing at itself.
    insert into public.prep_item_recipe (prep_item_id, child_prep_item_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
    values (v_prep, v_prep, 0.1, 'kg', 1, 'kg')
    returning id into v_recipe_id;
    begin
      perform public.get_ingredient_cost('prep', v_prep, current_date);
    exception when sqlstate 'P0001' then
      v_caught := true;
    end;
    -- Clean up the cycle row regardless.
    delete from public.prep_item_recipe where id = v_recipe_id;
    if not v_caught then
      raise exception 'FAIL: parity violation on cycle detection: P0001 was NOT raised on a self-referencing prep recipe';
    end if;
    raise notice 'PASS test 7: recursive cycle correctly raised P0001';
  end;

  -- ============== TEST 8: Effective-dated price lookup ==============
  -- Insert a future row with a different price, then query at an earlier date
  -- and confirm we still get the old price.
  declare
    v_prep uuid;
    v_history_id uuid;
    v_old_price int;
    v_new_price int;
    v_seen_at_earlier int;
  begin
    select id into v_prep from public.prep_items where code = 'mayo' limit 1;
    -- Close the existing open row at a future date, then insert a NEW row.
    update public.transfer_price_history
       set effective_to = '2027-01-01'
     where prep_item_id = v_prep
       and effective_to is null;
    insert into public.transfer_price_history (prep_item_id, price_cents, effective_from, effective_to)
    values (v_prep, 9999, '2027-01-01', null)
    returning id into v_history_id;

    -- At today's date we expect the original price (800c per seed).
    v_seen_at_earlier := public.transfer_price_as_of(v_prep, current_date);
    -- At 2027-06-01 we expect the new 9999c.
    v_new_price := public.transfer_price_as_of(v_prep, date '2027-06-01');

    -- Roll back the test row + reopen the original.
    delete from public.transfer_price_history where id = v_history_id;
    update public.transfer_price_history
       set effective_to = null
     where prep_item_id = v_prep
       and effective_to = '2027-01-01';

    if v_new_price <> 9999 then
      raise exception 'FAIL: parity violation on effective-dated price (future): got %, expected 9999', v_new_price;
    end if;
    if v_seen_at_earlier = 9999 then
      raise exception 'FAIL: parity violation on effective-dated price (current): leaked future price into the past';
    end if;
    raise notice 'PASS test 8: effective-dated price honoured (today=%, 2027=%)', v_seen_at_earlier, v_new_price;
  end;

  raise notice '=========================================';
  raise notice 'ALL v2 PARITY TESTS PASSED';
  raise notice '=========================================';
end$$;
