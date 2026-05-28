-- Piccolo Production — v2 hardening Phase 1: backfill price + cost history.
--
-- Snapshot the current ingredients.cost_per_unit_cents and
-- prep_items.transfer_price_cents into the new history tables with
-- effective_from = '2026-01-01' and effective_to = NULL. This is the
-- "current" row for every entity. Subsequent edits will close-row + insert-row
-- via the settings UI (Phase 2.8).

-- =============================================================================
-- ingredient_cost_history backfill
-- =============================================================================

insert into public.ingredient_cost_history (ingredient_id, cost_per_unit_cents, effective_from, effective_to)
select
  i.id,
  i.cost_per_unit_cents,
  date '2026-01-01',
  null
from public.ingredients i
where i.cost_per_unit_cents is not null
  and not exists (
    select 1
    from public.ingredient_cost_history h
    where h.ingredient_id = i.id
      and h.effective_to is null
  );

-- =============================================================================
-- transfer_price_history backfill
-- =============================================================================

insert into public.transfer_price_history (prep_item_id, price_cents, effective_from, effective_to)
select
  p.id,
  p.transfer_price_cents,
  date '2026-01-01',
  null
from public.prep_items p
where p.transfer_price_cents is not null
  and not exists (
    select 1
    from public.transfer_price_history h
    where h.prep_item_id = p.id
      and h.effective_to is null
  );

-- =============================================================================
-- NOTE on prepared-ingredient recipes (Salsa Verde, Pickled Onions, Mayo,
-- Dressing, Salad Mix, Roasted Peppers): the Phase B seed already populated
-- prep_item_recipe for each of these with raw-ingredient lines and a yield_qty
-- + yield_unit. This is the canonical recipe data per BRIEF §4.8. We do NOT
-- rewrite those rows here — the new get_ingredient_cost() RPC walks them
-- recursively to derive the prepared cost, replicating the Excel workbook's
-- D101–D105 batch-cost pattern in SQL rather than per-cell formulas.
--
-- Cross-prep recursion (e.g. Salad Mix referencing Roasted Peppers as a child
-- prep item, not the raw 4.1kg tin) is a future seed change. We leave the
-- current Phase B seed unchanged to preserve numeric parity with v1.
-- =============================================================================
