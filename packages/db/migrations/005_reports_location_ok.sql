-- Add location_ok column to track geo-zone compliance per report
ALTER TABLE reports ADD COLUMN location_ok BOOLEAN;
