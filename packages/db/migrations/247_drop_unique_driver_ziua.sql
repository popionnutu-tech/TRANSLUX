-- 247: pasul 2 din «foaie per rută» (vezi 246_foaie_per_ruta.sql).
--
-- Se aplică DOAR după ce codul nou (setCashinReceipt/setFoaie fără upsert pe
-- (driver_id, ziua)) e live pe Vercel — codul vechi făcea upsert cu
-- onConflict 'driver_id,ziua' și ar primi 42P10 fără constraint-ul ăsta.
-- Până la aplicare, a doua foaie a unui șofer primește 23505 (mesaj clar),
-- nimic nu se pierde.
--
-- Unicitatea rămâne asigurată de uq_dcr_driver_ziua_ruta
-- (driver_id, ziua, COALESCE(crm_route_id, -1)) + UNIQUE(receipt_nr) global.

ALTER TABLE public.driver_cashin_receipts
  DROP CONSTRAINT IF EXISTS driver_cashin_receipts_driver_id_ziua_key;
