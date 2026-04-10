-- Migration 022: Update departure times from Chișinău (trips table)
-- Only affects operator bot + admin reports (direction CHISINAU_BALTI)
-- Does NOT affect public site (crm_routes unchanged)

BEGIN;

-- 7:30 → 7:35
UPDATE trips SET departure_time = '07:35:00'
WHERE departure_time = '07:30:00' AND direction = 'CHISINAU_BALTI';

-- 10:00 → 10:10
UPDATE trips SET departure_time = '10:10:00'
WHERE departure_time = '10:00:00' AND direction = 'CHISINAU_BALTI';

-- 10:30 → 10:40
UPDATE trips SET departure_time = '10:40:00'
WHERE departure_time = '10:30:00' AND direction = 'CHISINAU_BALTI';

-- 11:00 → 11:20
UPDATE trips SET departure_time = '11:20:00'
WHERE departure_time = '11:00:00' AND direction = 'CHISINAU_BALTI';

-- 11:30 → 11:55
UPDATE trips SET departure_time = '11:55:00'
WHERE departure_time = '11:30:00' AND direction = 'CHISINAU_BALTI';

-- 12:00 → 15:55
UPDATE trips SET departure_time = '15:55:00'
WHERE departure_time = '12:00:00' AND direction = 'CHISINAU_BALTI';

-- 16:10 → 16:20
UPDATE trips SET departure_time = '16:20:00'
WHERE departure_time = '16:10:00' AND direction = 'CHISINAU_BALTI';

-- 16:40 → 16:45
UPDATE trips SET departure_time = '16:45:00'
WHERE departure_time = '16:40:00' AND direction = 'CHISINAU_BALTI';

-- 17:10 → 17:20
UPDATE trips SET departure_time = '17:20:00'
WHERE departure_time = '17:10:00' AND direction = 'CHISINAU_BALTI';

-- 17:35 → 18:10
UPDATE trips SET departure_time = '18:10:00'
WHERE departure_time = '17:35:00' AND direction = 'CHISINAU_BALTI';

-- 18:05 → 17:50
UPDATE trips SET departure_time = '17:50:00'
WHERE departure_time = '18:05:00' AND direction = 'CHISINAU_BALTI';

-- 18:15 → 18:30
UPDATE trips SET departure_time = '18:30:00'
WHERE departure_time = '18:15:00' AND direction = 'CHISINAU_BALTI';

-- 18:45 → 18:55
UPDATE trips SET departure_time = '18:55:00'
WHERE departure_time = '18:45:00' AND direction = 'CHISINAU_BALTI';

-- 19:20 → 19:25
UPDATE trips SET departure_time = '19:25:00'
WHERE departure_time = '19:20:00' AND direction = 'CHISINAU_BALTI';

COMMIT;
