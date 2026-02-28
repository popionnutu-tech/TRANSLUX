-- Add location and late submission tracking to reports
ALTER TABLE reports
  ADD COLUMN location_lat DOUBLE PRECISION,
  ADD COLUMN location_lon DOUBLE PRECISION,
  ADD COLUMN location_distance_m INTEGER,
  ADD COLUMN location_ok BOOLEAN,
  ADD COLUMN minutes_late INTEGER;
