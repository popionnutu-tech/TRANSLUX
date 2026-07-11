-- 234_piese_part_name_ro.sql
-- Denumire bilingvă la piese: adaugă `name_ro` (română). `name_long` rămâne primar (existent, în principal RU din 1C).
-- Scop: căutarea găsește piesa după ORICARE denumire (RO sau RU), fără transliterare. Datele RO se umplu într-o sesiune separată.
-- View-urile au liste EXPLICITE de coloane → CREATE OR REPLACE adăugând coloane NOI LA SFÂRȘIT (păstrează grant-urile;
-- ordinea/tipurile coloanelor existente rămân neschimbate, cerință a lui CREATE OR REPLACE VIEW).
BEGIN;

ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS name_ro TEXT;
COMMENT ON COLUMN piese_parts.name_ro IS
  'Denumirea în română (opțional). name_long = denumirea existentă (în principal RU din 1C). Căutarea caută pe ambele.';

-- Catalog: adaug name_ro la coadă.
CREATE OR REPLACE VIEW piese_catalog_rows AS
 SELECT p.id,
    p.group_id,
    p.name_long,
    p.manufacturer,
    p.model,
    p.article_code,
    p.oem_code,
    p.barcode,
    p.unit,
    p.is_for_sale,
    p.active,
    p.created_at,
    g.name_ro AS group_name,
    p.name_ro
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;

-- Stoc: adaug name_ro + article_code + oem_code la coadă (căutarea din Stoc are nevoie de articol/OEM).
CREATE OR REPLACE VIEW piese_stock_rows AS
 SELECT p.id AS part_id,
    w.id AS warehouse_id,
    g.id AS group_id,
    g.name_ro AS group_name,
    p.name_long,
    p.manufacturer,
    p.model,
    p.barcode,
    p.unit,
    w.name AS warehouse_name,
    loc.location_label,
    COALESCE(loc.min_qty, 0::real) AS min_qty,
    cs.qty,
        CASE
            WHEN cs.qty > 0::double precision THEN cs.value / cs.qty
            ELSE 0::real
        END AS avg_cost,
    cs.value,
    p.name_ro,
    p.article_code,
    p.oem_code
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
     CROSS JOIN piese_warehouses w
     LEFT JOIN piese_part_locations loc ON loc.part_id = p.id AND loc.warehouse_id = w.id
     JOIN piese_current_stock cs ON cs.part_id = p.id AND cs.warehouse_id = w.id
  WHERE p.active AND (cs.qty <> 0::double precision OR loc.id IS NOT NULL);

-- Index trigram pe name_ro (oglindește idx_pparts_trgm_name pe name_long, migr. 223). pg_trgm există deja.
CREATE INDEX IF NOT EXISTS idx_pparts_trgm_name_ro ON piese_parts USING gin (name_ro gin_trgm_ops);

COMMIT;
