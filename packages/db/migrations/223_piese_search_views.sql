-- 223: View-uri pentru „Asistentul de căutare piesă" (vânzător).
-- Aditiv, fără schemă nouă — reutilizează tabelele piese_* existente.

-- 0) Recreez piese_stock_rows adăugând group_id (pentru filtrul pe categorie din stoc/căutare).
--    Restul coloanelor rămân identice cu 201_piese_views_hardening.sql.
CREATE OR REPLACE VIEW piese_stock_rows AS
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
--    cost mediu de achiziție (toate intrările, orice depozit) × (1 + adaos% al grupei).
--    Adaosul comercial e per categorie (piese_part_groups.markup_pct) — sursa unică.
CREATE OR REPLACE VIEW piese_part_sale_price AS
SELECT
  p.id AS part_id,
  g.markup_pct,
  COALESCE((
    SELECT AVG(m.unit_cost) FROM piese_stock_movements m
    WHERE m.part_id = p.id AND m.qty_delta > 0 AND m.unit_cost > 0
  ), 0) AS avg_cost,
  round((COALESCE((
    SELECT AVG(m.unit_cost) FROM piese_stock_movements m
    WHERE m.part_id = p.id AND m.qty_delta > 0 AND m.unit_cost > 0
  ), 0) * (1 + g.markup_pct / 100.0))::numeric, 2) AS sale_price
FROM piese_parts p
JOIN piese_part_groups g ON g.id = p.group_id
WHERE p.active;
