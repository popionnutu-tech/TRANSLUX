-- Add reclama (advertisement) compliance columns (Chișinău only)
ALTER TABLE reports ADD COLUMN reclama_ok BOOLEAN;
ALTER TABLE reports ADD COLUMN reclama_deadline DATE;
