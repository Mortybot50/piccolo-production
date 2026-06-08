-- Piccolo Production v3 refresh — Phase 4 follow-up: stock_counts uniqueness.
-- The original schema allowed multiple stock_count rows per (date, prep_item),
-- with "latest" semantics. The new /stocktake page upserts by
-- (count_date, prep_item_id), so we need a unique constraint to support it.
--
-- Table was empty when this ran (verified live).
alter table public.stock_counts
  add constraint stock_counts_date_prep_item_unique unique (count_date, prep_item_id);
