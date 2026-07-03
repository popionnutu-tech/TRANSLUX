-- 223: View-uri pentru „Asistentul de căutare piesă" (vânzător).
-- Aditiv, fără schemă nouă — reutilizează tabelele piese_* existente.

-- 0) Recreez piese_stock_rows adăugând group_id (pentru filtrul pe categorie din stoc/căutare).
--    Restul coloanelor rămân identice cu 201_piese_views_hardening.sql.
--    group_id intră în mijloc → CREATE OR REPLACE nu poate redenumi coloane; DROP+CREATE (fără dependenți).
DROP VIEW IF EXISTS piese_stock_rows;
CREATE VIEW piese_stock_rows AS
SELECT p.id AS part_id, w.id AS warehouse_id, g.id AS group_id, g.name_ro AS group_name, p.name_long,
  p.manufacturer, p.model, p.barcode, p.unit, w.name AS warehouse_name,
  loc.location_label, COALESCE(loc.min_qty,0) AS min_qty,
  cs.qty, CASE WHEN cs.qty>0 THEN cs.value/cs.qty ELSE 0 END AS avg_cost, cs.value
FROM piese_parts p
JOIN piese_part_groups g ON g.id=p.group_id
CROSS JOIN piese_warehouses w
LEFT JOIN piese_part_locations loc ON loc.part_id=p.id AND loc.warehouse_id=w.id
JOIN piese_current_stock cs ON cs.part_id=p.id AND cs.warehouse_id=w.id
WHERE p.active AND (cs.qty <> 0 OR loc.id IS NOT NULL);

-- 1) Ultimul furnizor + preț de achiziție per piesă: cel mai recent document RECEIPT.
--    Folosit când piesa NU e în stoc → „de unde o procurăm + la ce preț am luat-o ultima dată".
CREATE OR REPLACE VIEW piese_last_supplier AS
SELECT DISTINCT ON (l.part_id)
  l.part_id,
  d.supplier_id,
  s.name        AS supplier_name,
  l.unit_cost,
  d.created_at  AS received_at,
  d.invoice_series,
  d.invoice_number
FROM piese_stock_document_lines l
JOIN piese_stock_documents d ON d.id = l.document_id
LEFT JOIN piese_suppliers s ON s.id = d.supplier_id
WHERE d.doc_type = 'RECEIPT'
ORDER BY l.part_id, d.created_at DESC, d.id DESC, l.id DESC;

-- 2) Preț de vânzare generalizat pentru ORICE piesă activă (nu doar magazin/is_for_sale ca piese_sale_parts).
--    cost mediu de ACHIZIȚIE (doar mișcări RECEIPT — preț real plătit furnizorului) × (1 + adaos% al grupei).
--    Important: NU includem TRANSFER_IN / ADJUST_PLUS / DONOR_IN — acelea poartă cost FIFO din alt depozit
--    și ar dubla/umfla media. „Preț de achiziție" = ce am plătit la recepție, nu valoarea FIFO de stoc.
--    Adaosul comercial e per categorie (piese_part_groups.markup_pct) — sursa unică.
CREATE OR REPLACE VIEW piese_part_sale_price AS
SELECT
  p.id AS part_id,
  g.markup_pct,
  a.avg_cost,
  round((a.avg_cost * (1 + g.markup_pct / 100.0))::numeric, 2) AS sale_price
FROM piese_parts p
JOIN piese_part_groups g ON g.id = p.group_id
LEFT JOIN LATERAL (
  SELECT COALESCE(AVG(m.unit_cost), 0) AS avg_cost
  FROM piese_stock_movements m
  WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT' AND m.unit_cost > 0
) a ON true
WHERE p.active;

-- 3) Indexuri pentru căutarea interactivă (aditive, idempotente).
--    pg_trgm face ca `ilike '%termen%'` (wildcard la început) să fie index-assisted, nu seq scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_pparts_trgm_name    ON piese_parts USING gin (name_long gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pparts_trgm_model   ON piese_parts USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pparts_trgm_article ON piese_parts USING gin (article_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pparts_trgm_oem     ON piese_parts USING gin (oem_code gin_trgm_ops);
-- piese_last_supplier scanează liniile de recepție; FK-urile nu aveau index.
CREATE INDEX IF NOT EXISTS idx_pdocl_part      ON piese_stock_document_lines(part_id);
CREATE INDEX IF NOT EXISTS idx_pdocl_document  ON piese_stock_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_pdoc_type_created ON piese_stock_documents(doc_type, created_at DESC);
