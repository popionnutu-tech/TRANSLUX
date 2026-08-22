-- 263: ordinea opririlor în crm_stop_fares era dată de `id`, nu de o coloană
--
-- Consecință: o oprire nouă la mijlocul rutei era imposibilă — id-ul serial o punea
-- mereu la sfârșit, iar căutarea publică (`goingNorth = from.id > to.id`) inversa direcția.
-- Blocurile de id sunt compacte (fără goluri), deci nu exista loc de inserare.
--
-- Soluție: coloană explicită `stop_order`, pas 10, în ordinea actuală a id-urilor.
-- Comportamentul rămâne identic; se eliberează loc pentru opriri noi între cele existente.

ALTER TABLE crm_stop_fares ADD COLUMN IF NOT EXISTS stop_order integer;

UPDATE crm_stop_fares f
SET stop_order = t.rn * 10
FROM (
  SELECT id, row_number() OVER (PARTITION BY crm_route_id ORDER BY id) AS rn
  FROM crm_stop_fares
) t
WHERE t.id = f.id;

ALTER TABLE crm_stop_fares ALTER COLUMN stop_order SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_stop_fares_route_order_idx
  ON crm_stop_fares (crm_route_id, stop_order);
