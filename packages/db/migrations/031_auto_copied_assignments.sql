-- Mark auto-copied daily assignments (from /api/cron/copy-assignments)
-- so the dispatcher grafic hides them and sees empty slots,
-- while the public site still uses them as fallback.

ALTER TABLE daily_assignments
  ADD COLUMN IF NOT EXISTS auto_copied BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_daily_assignments_auto_copied
  ON daily_assignments(assignment_date)
  WHERE auto_copied = true;
