-- Update all route prices to 0.94 lei/km (was 0.9)
-- Special case: Balti <-> Chisinau = 105 lei (fixed)
BEGIN;

-- 1. Recalculate all prices at 0.94 lei/km
UPDATE route_km_pairs
SET price = ROUND(km * 0.94);

-- 2. Override Balti <-> Chisinau to fixed 105 lei (both directions, all tariffs)
UPDATE route_km_pairs
SET price = 105
WHERE (from_stop = 'balti' AND to_stop = 'chisinau')
   OR (from_stop = 'chisinau' AND to_stop = 'balti');

COMMIT;
