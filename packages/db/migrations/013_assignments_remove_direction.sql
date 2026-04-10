-- Migration: Remove direction from daily_assignments
-- Assignments are now per round-trip (tur-retur), not per direction

-- 1. Deduplicate: if same route+date has two rows (one per direction), keep the oldest
DELETE FROM daily_assignments a
USING daily_assignments b
WHERE a.crm_route_id = b.crm_route_id
  AND a.assignment_date = b.assignment_date
  AND a.id != b.id
  AND a.created_at > b.created_at;

-- 2. Drop old unique constraint (crm_route_id, assignment_date, direction)
ALTER TABLE daily_assignments
  DROP CONSTRAINT IF EXISTS daily_assignments_crm_route_id_assignment_date_direction_key;

-- Also try the schedule_id variant from migration 010
ALTER TABLE daily_assignments
  DROP CONSTRAINT IF EXISTS daily_assignments_schedule_id_assignment_date_direction_key;

-- 3. Drop direction column
ALTER TABLE daily_assignments DROP COLUMN IF EXISTS direction;

-- 4. Add new unique constraint without direction
ALTER TABLE daily_assignments
  ADD CONSTRAINT daily_assignments_route_date_unique
  UNIQUE (crm_route_id, assignment_date);
