-- 070_unique_receipt_nr_cleanup.sql
-- 1. Curatare duplicate in driver_cashin_receipts: pastram cea mai noua intrare
--    pentru fiecare receipt_nr (dupa ziua DESC, apoi created_at DESC).
-- 2. Adaugare UNIQUE constraint pe receipt_nr — un foaie = un sofer, mereu.

WITH ranked AS (
  SELECT id, receipt_nr,
         ROW_NUMBER() OVER (PARTITION BY receipt_nr ORDER BY ziua DESC, created_at DESC) AS rn
  FROM driver_cashin_receipts
)
DELETE FROM driver_cashin_receipts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE driver_cashin_receipts
  DROP CONSTRAINT IF EXISTS driver_cashin_receipts_ziua_receipt_nr_key;

ALTER TABLE driver_cashin_receipts
  ADD CONSTRAINT driver_cashin_receipts_receipt_nr_unique UNIQUE (receipt_nr);

COMMENT ON CONSTRAINT driver_cashin_receipts_receipt_nr_unique ON driver_cashin_receipts
  IS 'Un foaie de parcurs poate fi atribuit unei singure (sofer, zi) — niciodata reutilizat.';
