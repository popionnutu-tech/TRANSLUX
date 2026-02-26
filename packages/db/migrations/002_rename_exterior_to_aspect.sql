-- Rename exterior_ok to aspect_ok (driver appearance instead of vehicle exterior)
ALTER TABLE reports RENAME COLUMN exterior_ok TO aspect_ok;
