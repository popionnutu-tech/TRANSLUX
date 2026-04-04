-- Migration 023: Link trips to crm_routes for Chișinău operator bot
-- Adds crm_route_id to trips table, populates mapping for CHISINAU_BALTI direction only
-- Does NOT affect public site, grafic, or Bălți operators

BEGIN;

-- 1. Add column
ALTER TABLE trips ADD COLUMN IF NOT EXISTS crm_route_id INT REFERENCES crm_routes(id);

-- 2. Populate mapping (CHISINAU_BALTI trips only)
UPDATE trips SET crm_route_id = 11 WHERE departure_time = '06:55:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 12 WHERE departure_time = '07:35:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 13 WHERE departure_time = '08:15:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 10 WHERE departure_time = '08:50:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 15 WHERE departure_time = '09:30:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 14 WHERE departure_time = '10:10:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 16 WHERE departure_time = '10:40:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 1  WHERE departure_time = '11:20:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 6  WHERE departure_time = '11:55:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 20 WHERE departure_time = '12:30:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 18 WHERE departure_time = '13:00:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 22 WHERE departure_time = '13:30:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 17 WHERE departure_time = '13:55:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 19 WHERE departure_time = '14:20:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 24 WHERE departure_time = '14:50:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 23 WHERE departure_time = '15:15:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 27 WHERE departure_time = '15:40:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 3  WHERE departure_time = '15:55:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 25 WHERE departure_time = '16:20:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 28 WHERE departure_time = '16:45:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 26 WHERE departure_time = '17:20:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 5  WHERE departure_time = '17:50:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 29 WHERE departure_time = '18:10:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 7  WHERE departure_time = '18:30:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 21 WHERE departure_time = '18:55:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 9  WHERE departure_time = '19:25:00' AND direction = 'CHISINAU_BALTI';
UPDATE trips SET crm_route_id = 8  WHERE departure_time = '20:00:00' AND direction = 'CHISINAU_BALTI';

COMMIT;
