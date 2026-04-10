-- Add separate vehicle for return trip (retur)
-- When NULL, the tur vehicle is used for both directions
ALTER TABLE daily_assignments
  ADD COLUMN vehicle_id_retur UUID REFERENCES vehicles(id);
