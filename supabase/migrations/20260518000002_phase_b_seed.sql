-- Piccolo Production — Phase B seed
-- Idempotent via ON CONFLICT DO NOTHING + WHERE NOT EXISTS guards.
-- Sources: docs/excel-teardown/Settings.txt, Ingredient_Builds.txt,
--          Costing_&_Margins.txt, Sales_Input_-_HAW.txt.

-- ============================================================================
-- app_settings — one row sentinel
-- ============================================================================
insert into public.app_settings (singleton, latest_week_number, buffer_pct, waste_threshold_pct)
select true, 1, 0.10, 0.05
where not exists (select 1 from public.app_settings);

-- ============================================================================
-- stores
-- ============================================================================
insert into public.stores (code, name, address) values
  ('HAW', 'Hawthorn', null),
  ('SY',  'South Yarra', null)
on conflict (code) do nothing;

-- ============================================================================
-- suppliers
-- DOM is the alias supplier (workbook: DOM = Morabito for fresh produce).
-- ============================================================================
insert into public.suppliers (code, name, schedule_jsonb) values
  ('OROSO',    'Oroso',    '{"kind":"daily","lead_days":1,"thursday_covers":["Sat","Sun","Mon"]}'::jsonb),
  ('ARZ',      'ARZ',      '{"kind":"weekly","order_day":"Sun","delivery_day":"Mon"}'::jsonb),
  ('MORABITO', 'Morabito', '{"kind":"thrice_weekly","slots":[{"order":"Sun","delivery":"Mon"},{"order":"Tue","delivery":"Wed"},{"order":"Thu","delivery":"Fri"}],"garlic_mon_only":true}'::jsonb),
  ('DOM',      'DOM (Morabito proxy)', '{"kind":"thrice_weekly","slots":[{"order":"Sun","delivery":"Mon"},{"order":"Tue","delivery":"Wed"},{"order":"Thu","delivery":"Fri"}],"garlic_mon_only":true}'::jsonb),
  ('RUSTICA',  'Rustica',  '{"kind":"as_needed"}'::jsonb)
on conflict (code) do nothing;

-- ============================================================================
-- prep_items  (Settings rows 23-31, transfer prices rows 48-56)
-- transfer_price_cents = $ × 100
-- portion_g: per-panini gram serve (pcs items use 1 as placeholder for 1 piece)
-- ============================================================================
insert into public.prep_items (code, name, unit, portion_g, shelf_life_days, batch_size, batch_unit, frequency_label, transfer_price_cents) values
  ('cotoletta',          'Cotoletta (crumbed)', 'pcs', 1,   1, 1,  'pcs',   'Daily AM',          250),
  ('marinated_chicken',  'Marinated Chicken',   'pcs', 1,   4, 1,  'pcs',   'Daily, big Fri',    200),
  ('pickled_onions',     'Pickled Onions',      'kg',  45,  7, 20, 'kg',    '2x/week',           500),
  ('salsa_verde',        'Salsa Verde',         'kg',  40,  7, 20, 'L',     '2x/week',           800),
  ('tomatoes_cut',       'Tomatoes (Cut)',      'kg',  150, 1, 4,  'kg tub','Daily AM',          600),
  ('salad_mix',          'Salad Mix',           'kg',  140, 2, 1,  'batch', 'HAW 2d / SY daily', 1000),
  ('mayo',               'Mayo',                'kg',  20,  7, 10, 'kg',    '1x/week',           800),
  ('dressing',           'Dressing',            'L',   15,  7, 6,  'L',     '1x/week',           600),
  ('roasted_peppers',    'Roasted Peppers',     'kg',  85,  7, 48, 'kg',    '1-2x/week',         700)
on conflict (code) do nothing;

-- ============================================================================
-- menu_items  (Settings rows 14-19 for splits; sell prices from
-- Costing & Margins sheet rows 5/22/32/42/52/62)
-- ============================================================================
insert into public.menu_items (code, name, sell_price_cents, haw_split_pct, sy_split_pct) values
  ('cotoletta',       'COTOLETTA',       1750, 0.630, 0.370),  -- SOURCE: Costing & Margins F5
  ('caprese',         'CAPRESE',         1400, 0.623, 0.377),  -- SOURCE: Costing & Margins F22
  ('prosciutto',      'PROSCIUTTO',      1750, 0.658, 0.342),  -- SOURCE: Costing & Margins F32
  ('mortadella',      'MORTADELLA',      1650, 0.606, 0.394),  -- SOURCE: Costing & Margins F42
  ('the_deli',        'THE DELI',        1850, 0.595, 0.405),  -- SOURCE: Costing & Margins F52
  ('grilled_chicken', 'GRILLED CHICKEN', 1850, 0.515, 0.485)   -- SOURCE: Costing & Margins F62
on conflict (code) do nothing;

-- ============================================================================
-- ingredients  (Settings rows 61-100 — 40 rows; rows 101-105 are derived
-- prep-items that we model via prep_item_recipe instead.)
-- All prices in cents. Rows with no cost on the sheet stay NULL so Phase C
-- empty-cost alerts can fire.
-- ============================================================================
insert into public.ingredients (code, name, supplier_id, pack_desc, cost_per_pack_cents, pack_qty, pack_unit, last_cost_update_at) values
  ('chicken_breast',     'Chicken breast',     (select id from public.suppliers where code='OROSO'),    'per kg',       1200, 1000,  'g',     now()),
  ('panko',              'Panko breadcrumbs',  (select id from public.suppliers where code='ARZ'),      '10kg bag',     3695, 10000, 'g',     now()),
  ('plain_flour',        'Plain flour',        (select id from public.suppliers where code='ARZ'),      '12.5kg bag',   1590, 12500, 'g',     now()),
  ('parmesan',           'Parmesan',           (select id from public.suppliers where code='ARZ'),      'per kg (est)', 1200, 1000,  'g',     now()),
  ('eggs',               'Eggs',               (select id from public.suppliers where code='ARZ'),      '15 dozen tray',3051, 180,   'egg',   now()),
  ('milk',               'Milk',               (select id from public.suppliers where code='ARZ'),      '2L bottle (est)', 350, 2000, 'ml',   now()),
  ('dried_thyme',        'Dried thyme',        (select id from public.suppliers where code='ARZ'),      '500g',         625,  500,   'g',     now()),
  ('dried_oregano',      'Dried oregano',      (select id from public.suppliers where code='ARZ'),      '500g',         654,  500,   'g',     now()),
  ('garlic_powder',      'Garlic powder',      (select id from public.suppliers where code='ARZ'),      '500g (est)',   800,  500,   'g',     now()),
  ('fresh_parsley',      'Fresh parsley',      (select id from public.suppliers where code='MORABITO'), 'bunch',        250,  1,     'bunch', now()),
  ('dill',               'Dill',               (select id from public.suppliers where code='MORABITO'), 'bunch',        300,  1,     'bunch', now()),
  ('fresh_basil',        'Fresh basil',        (select id from public.suppliers where code='MORABITO'), 'bunch',        335,  1,     'bunch', now()),
  ('onions_red_peeled',  'Onions red peeled',  (select id from public.suppliers where code='MORABITO'), '10kg bag',     4200, 10000, 'g',     now()),
  ('blend_oil',          'Blend oil',          (select id from public.suppliers where code='ARZ'),      '18L',          8695, 18000, 'ml',    now()),
  ('white_vinegar',      'White vinegar',      (select id from public.suppliers where code='ARZ'),      '20L',          2075, 20000, 'ml',    now()),
  ('red_wine_vinegar',   'Red wine vinegar',   (select id from public.suppliers where code='ARZ'),      '5L',           1015, 5000,  'ml',    now()),
  ('evoo',               'EVOO',               (select id from public.suppliers where code='ARZ'),      '1L (est)',     1400, 1000,  'ml',    now()),
  ('sugar',              'Sugar',              (select id from public.suppliers where code='ARZ'),      '15kg (est)',   1800, 15000, 'g',     now()),
  ('gourmet_tomatoes',   'Gourmet tomatoes',   (select id from public.suppliers where code='MORABITO'), '10kg box',     4300, 10000, 'g',     now()),
  ('cherry_tomatoes',    'Cherry tomatoes',    (select id from public.suppliers where code='MORABITO'), 'per kg',       770,  1000,  'g',     now()),
  ('cucumber',           'Cucumber',           (select id from public.suppliers where code='MORABITO'), 'each ~300g',   200,  300,   'g',     now()),
  ('roasted_peppers_tin','Roasted peppers (tin)',(select id from public.suppliers where code='ARZ'),    '4.1kg tin',    2040, 4100,  'g',     now()),
  ('mayo_base',          'Mayo base',          (select id from public.suppliers where code='ARZ'),      '20kg tub',     8571, 20000, 'g',     now()),
  ('lemon_juice',        'Lemon juice',        (select id from public.suppliers where code='ARZ'),      '2L',           820,  2000,  'ml',    now()),
  ('honey',              'Honey',              (select id from public.suppliers where code='ARZ'),      '3kg (est)',    1800, 3000,  'g',     now()),
  ('salt',               'Salt',               (select id from public.suppliers where code='ARZ'),      '5kg (est)',    300,  5000,  'g',     now()),
  ('black_pepper',       'Black pepper',       (select id from public.suppliers where code='ARZ'),      '500g (est)',   1000, 500,   'g',     now()),
  ('fresh_garlic',       'Fresh garlic',       (select id from public.suppliers where code='MORABITO'), 'per kg (est)', 1500, 1000,  'g',     now()),
  ('lemons_fresh',       'Lemons fresh',       (select id from public.suppliers where code='MORABITO'), 'per kg (est)', 600,  1000,  'g',     now()),
  ('pistachios',         'Pistachios',         (select id from public.suppliers where code='ARZ'),      'per kg',       4909, 1000,  'g',     now()),
  -- empty-cost ingredients (flagged for Damian to fill in Phase C):
  ('focaccia_bread',     'Focaccia bread',     (select id from public.suppliers where code='RUSTICA'),  'per roll',     null, 1,     'roll',  null),
  ('mozzarella',         'Mozzarella',         null,                                                    'per kg',       null, 1000,  'g',     null),
  ('stracciatella',      'Stracciatella',      null,                                                    'per kg',       null, 1000,  'g',     null),
  ('provolone',          'Provolone',          null,                                                    'per kg',       null, 1000,  'g',     null),
  ('prosciutto_meat',    'Prosciutto meat',    null,                                                    'per kg',       null, 1000,  'g',     null),
  ('mortadella_meat',    'Mortadella meat',    null,                                                    'per kg',       null, 1000,  'g',     null),
  ('salami',             'Salami',             null,                                                    'per kg',       null, 1000,  'g',     null),
  ('rocket',             'Rocket',             null,                                                    'per kg',       null, 1000,  'g',     null),
  ('basil_pesto',        'Basil pesto',        null,                                                    'per kg',       null, 1000,  'g',     null),
  ('bruschetta_spread',  'Bruschetta spread',  null,                                                    'per kg',       null, 1000,  'g',     null)
on conflict (code) do nothing;

-- ============================================================================
-- addon_items  (Sales Input - HAW rows 13-16 plus Sales Input - SY)
-- ============================================================================
insert into public.addon_items (code, name, linked_prep_item_id, portion_g) values
  ('cotoletta_addon',      'Cotoletta Add-On',      (select id from public.prep_items where code='cotoletta'),       1),
  ('roasted_peppers_addon','Roasted Peppers Add-On',(select id from public.prep_items where code='roasted_peppers'), 85),
  ('pickled_onions_addon', 'Pickled Onions Add-On', (select id from public.prep_items where code='pickled_onions'),  45),
  ('tomatoes_addon',       'Tomatoes Add-On',       (select id from public.prep_items where code='tomatoes_cut'),    150)
on conflict (code) do nothing;

-- ============================================================================
-- prep_item_recipe  (from Ingredient_Builds.txt)
-- Insert via SELECT so we look up IDs by code. Use INSERT ... ON CONFLICT DO NOTHING
-- so re-runs are idempotent.
-- ============================================================================

-- Helper CTE pattern: build a values list, JOIN to lookup tables, INSERT.
-- COTOLETTA / CRUMB MIX — per 100 cotoletta pieces
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 100, 'pcs'
from (values
  ('cotoletta','plain_flour',   650.0,   'g'),
  ('cotoletta','eggs',          18.0,    'egg'),
  ('cotoletta','milk',          2000.0,  'ml'),
  ('cotoletta','panko',         2500.0,  'g'),
  ('cotoletta','parmesan',      80.0,    'g'),
  ('cotoletta','dried_thyme',   60.0,    'g'),
  ('cotoletta','dried_oregano', 60.0,    'g'),
  ('cotoletta','salt',          60.0,    'g'),
  ('cotoletta','garlic_powder', 30.0,    'g'),
  ('cotoletta','black_pepper',  4.0,     'g'),
  ('cotoletta','fresh_parsley', 2.0,     'bunch'),
  ('cotoletta','chicken_breast',20000.0, 'g')
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- SALSA VERDE — per 20L batch (~20kg)
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 20, 'L'
from (values
  ('salsa_verde','dill',          10.0,   'bunch'),
  ('salsa_verde','fresh_parsley', 10.0,   'bunch'),
  ('salsa_verde','fresh_basil',   10.0,   'bunch'),
  ('salsa_verde','blend_oil',     14000.0,'ml'),
  ('salsa_verde','white_vinegar', 2500.0, 'ml'),
  ('salsa_verde','salt',          100.0,  'g'),
  ('salsa_verde','lemon_juice',   150.0,  'ml'),
  ('salsa_verde','fresh_garlic',  50.0,   'g')      -- ~10 cloves
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- MARINATED CHICKEN / GC MARINADE — per 10 panini pieces
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 10, 'pcs'
from (values
  ('marinated_chicken','chicken_breast', 1500.0, 'g'),
  ('marinated_chicken','evoo',           60.0,   'ml'),
  ('marinated_chicken','lemons_fresh',   80.0,   'g'),    -- 1 lemon ~80g (zest source)
  ('marinated_chicken','lemon_juice',    40.0,   'ml'),
  ('marinated_chicken','fresh_garlic',   14.0,   'g'),
  ('marinated_chicken','salt',           15.0,   'g'),
  ('marinated_chicken','honey',          6.0,    'g'),
  ('marinated_chicken','dried_oregano',  4.0,    'g'),
  ('marinated_chicken','fresh_parsley',  0.15,   'bunch')  -- 15g / ~100g per bunch
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- SALAD MIX / PANZANELLA — per 10 panini serves
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 10, 'panini'
from (values
  ('salad_mix','cherry_tomatoes',    800.0, 'g'),
  ('salad_mix','cucumber',           300.0, 'g'),
  ('salad_mix','roasted_peppers_tin',200.0, 'g'),  -- TODO: ideally link to roasted_peppers prep, but cross-prep refs not modeled in v1
  ('salad_mix','onions_red_peeled',  80.0,  'g'),
  ('salad_mix','fresh_basil',        0.2,   'bunch') -- 20g
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- DRESSING — per 10 panini portions (Excel: "Per 10 (sep bottle)")
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 10, 'panini'
from (values
  ('dressing','evoo',             90.0, 'ml'),
  ('dressing','red_wine_vinegar', 36.0, 'ml'),
  ('dressing','fresh_garlic',     6.0,  'g'),
  ('dressing','salt',             12.0, 'g'),
  ('dressing','black_pepper',     2.0,  'g')
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- PICKLED ONIONS — per 20kg batch
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 20, 'kg'
from (values
  ('pickled_onions','onions_red_peeled', 20000.0, 'g'),
  ('pickled_onions','red_wine_vinegar',  10000.0, 'ml'),
  ('pickled_onions','sugar',             4000.0,  'g')
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- MAYO — per 10kg finished (4kg base)
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 10, 'kg'
from (values
  ('mayo','mayo_base',    4000.0, 'g'),
  ('mayo','fresh_basil',  1.0,    'bunch'),  -- 100g
  ('mayo','lemon_juice',  200.0,  'ml'),
  ('mayo','lemons_fresh', 400.0,  'g')       -- 5 lemons (~80g ea)
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- ROASTED PEPPERS — per 48kg batch (12 × 4kg tins)
insert into public.prep_item_recipe (prep_item_id, ingredient_id, qty_per_yield, qty_unit, yield_qty, yield_unit)
select p.id, i.id, v.qty, v.unit, 48, 'kg'
from (values
  ('roasted_peppers','roasted_peppers_tin', 49200.0, 'g'),  -- 12 × 4100g
  ('roasted_peppers','fresh_garlic',        480.0,   'g'),  -- 8 cloves/tin × 12 × ~5g
  ('roasted_peppers','fresh_basil',         3.6,     'bunch'),
  ('roasted_peppers','evoo',                3000.0,  'ml'),
  ('roasted_peppers','salt',                50.0,    'g')   -- few pinches per tin
) as v(prep_code, ing_code, qty, unit)
join public.prep_items p on p.code = v.prep_code
join public.ingredients i on i.code = v.ing_code
on conflict do nothing;

-- ============================================================================
-- menu_item_recipe  (from Costing_&_Margins.txt; rewritten to use prep_items
-- where they apply, so production_pnl can compute COGS cleanly via composition.)
-- ============================================================================

-- COTOLETTA panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread', null,            1.0,  'roll'),
  (2, null,             'cotoletta',     1.0,  'pcs'),
  (3, null,             'salsa_verde',   40.0, 'g'),
  (4, null,             'pickled_onions',45.0, 'g'),
  (5, 'rocket',         null,            15.0, 'g')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'cotoletta'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- CAPRESE panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread',    null, 1.0,   'roll'),
  (2, 'gourmet_tomatoes',  null, 150.0, 'g'),
  (3, 'mozzarella',        null, 60.0,  'g'),
  (4, 'basil_pesto',       null, 20.0,  'g'),
  (5, 'fresh_basil',       null, 0.1,   'bunch')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'caprese'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- PROSCIUTTO panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread',   null, 1.0,  'roll'),
  (2, 'prosciutto_meat',  null, 60.0, 'g'),
  (3, 'mozzarella',       null, 60.0, 'g'),
  (4, 'rocket',           null, 15.0, 'g'),
  (5, 'basil_pesto',      null, 20.0, 'g')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'prosciutto'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- MORTADELLA panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread',   null, 1.0,  'roll'),
  (2, 'mortadella_meat',  null, 60.0, 'g'),
  (3, 'stracciatella',    null, 60.0, 'g'),
  (4, 'pistachios',       null, 10.0, 'g'),
  (5, 'honey',            null, 10.0, 'g')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'mortadella'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- THE DELI panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread',     null, 1.0,  'roll'),
  (2, 'mortadella_meat',    null, 40.0, 'g'),
  (3, 'salami',             null, 30.0, 'g'),
  (4, 'provolone',          null, 40.0, 'g'),
  (5, 'bruschetta_spread',  null, 30.0, 'g')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'the_deli'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- GRILLED CHICKEN panini
insert into public.menu_item_recipe (menu_item_id, line_no, ingredient_id, prep_item_id, qty_per_serve, qty_unit)
select m.id, v.line_no, i.id, p.id, v.qty, v.unit
from (values
  (1, 'focaccia_bread', null,                 1.0,   'roll'),
  (2, null,             'marinated_chicken',  1.0,   'pcs'),
  (3, null,             'salad_mix',          140.0, 'g'),
  (4, null,             'mayo',               20.0,  'g'),
  (5, null,             'dressing',           15.0,  'ml')
) as v(line_no, ing_code, prep_code, qty, unit)
join public.menu_items m on m.code = 'grilled_chicken'
left join public.ingredients i on i.code = v.ing_code
left join public.prep_items p on p.code = v.prep_code
on conflict do nothing;

-- ============================================================================
-- sales_weeks — seed Week 1 (current go-live week starting Mon)
-- Empty sales_entries / addon_entries — Damian fills via /sales-input.
-- ============================================================================
insert into public.sales_weeks (week_number, week_start_date, week_end_date)
select 1, date_trunc('week', current_date)::date, (date_trunc('week', current_date) + interval '6 days')::date
where not exists (select 1 from public.sales_weeks where week_number = 1);
