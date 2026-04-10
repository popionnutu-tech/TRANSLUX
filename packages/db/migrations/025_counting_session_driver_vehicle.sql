-- 025_counting_session_driver_vehicle.sql
-- Allow operators to set/override driver and vehicle on counting sessions
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
