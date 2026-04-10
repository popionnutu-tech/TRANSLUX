-- 025: Add alighted column to counting_entries
-- Tracks how many passengers alighted at each stop (entered manually by operator)

ALTER TABLE counting_entries
  ADD COLUMN alighted integer NOT NULL DEFAULT 0;
