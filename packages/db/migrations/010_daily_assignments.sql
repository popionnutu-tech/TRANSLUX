-- Daily driver/vehicle assignments to schedule routes
-- Replicates old CRM's n_rute_lde functionality

CREATE TABLE daily_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_date DATE NOT NULL,
  schedule_id INT NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL, -- 'CHISINAU_NORD' or 'NORD_CHISINAU'
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL, -- optional link to trips
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (schedule_id, assignment_date, direction)
);

CREATE INDEX idx_daily_assignments_date ON daily_assignments(assignment_date);
CREATE INDEX idx_daily_assignments_schedule_date ON daily_assignments(schedule_id, assignment_date);
