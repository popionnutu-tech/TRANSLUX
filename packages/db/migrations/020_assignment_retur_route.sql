-- Allow assigning a different retur route to a daily assignment.
-- When NULL, the driver does the retur for the same route (current behavior).
-- When set, the driver does the retur for the referenced route instead.
ALTER TABLE daily_assignments
  ADD COLUMN retur_route_id INT REFERENCES crm_routes(id);

CREATE INDEX idx_daily_assignments_retur_route
  ON daily_assignments(retur_route_id, assignment_date)
  WHERE retur_route_id IS NOT NULL;
