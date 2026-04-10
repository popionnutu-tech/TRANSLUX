-- Fix: trip_id should be nullable (matches original migration 010 design)
-- Without this fix, upsertAssignment fails silently because the column
-- does not accept NULL and the web UI doesn't include trip_id in inserts.
ALTER TABLE daily_assignments ALTER COLUMN trip_id DROP NOT NULL;
