-- Vehicles registry (nomenclator auto)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link reports to vehicles
ALTER TABLE reports ADD COLUMN vehicle_id UUID REFERENCES vehicles(id);
CREATE INDEX idx_reports_vehicle ON reports(vehicle_id);
