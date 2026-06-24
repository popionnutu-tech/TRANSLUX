-- ============================================================================
-- MODUL PIESE — view-uri de citire + întărire (RLS, index, lock FIFO)
-- (capturează în repo ce a fost aplicat live: piese_views + piese_hardening)
-- ============================================================================

-- View-uri de citire (stratul de aplicație citește din ele)
CREATE OR REPLACE VIEW piese_stock_rows AS
SELECT p.id AS part_id, w.id AS warehouse_id, g.name_ro AS group_name, p.name_long,
  p.manufacturer, p.model, p.barcode, p.unit, w.name AS warehouse_name,
  loc.location_label, COALESCE(loc.min_qty,0) AS min_qty,
  cs.qty, CASE WHEN cs.qty>0 THEN cs.value/cs.qty ELSE 0 END AS avg_cost, cs.value
FROM piese_parts p
JOIN piese_part_groups g ON g.id=p.group_id
CROSS JOIN piese_warehouses w
LEFT JOIN piese_part_locations loc ON loc.part_id=p.id AND loc.warehouse_id=w.id
JOIN piese_current_stock cs ON cs.part_id=p.id AND cs.warehouse_id=w.id
WHERE p.active AND (cs.qty <> 0 OR loc.id IS NOT NULL);

CREATE OR REPLACE VIEW piese_catalog_rows AS
SELECT p.*, g.name_ro AS group_name FROM piese_parts p JOIN piese_part_groups g ON g.id=p.group_id WHERE p.active;

CREATE OR REPLACE VIEW piese_locations_full AS
SELECT loc.warehouse_id, loc.location_label, p.id AS part_id, g.name_ro AS group_name, p.name_long, cs.qty
FROM piese_part_locations loc
JOIN piese_parts p ON p.id=loc.part_id
JOIN piese_part_groups g ON g.id=p.group_id
JOIN piese_current_stock cs ON cs.part_id=p.id AND cs.warehouse_id=loc.warehouse_id
WHERE p.active;

CREATE OR REPLACE VIEW piese_low_stock AS
SELECT p.id AS part_id, g.name_ro AS group_name, p.name_long, w.name AS warehouse_name, loc.min_qty, cs.qty
FROM piese_part_locations loc
JOIN piese_parts p ON p.id=loc.part_id
JOIN piese_part_groups g ON g.id=p.group_id
JOIN piese_warehouses w ON w.id=loc.warehouse_id
JOIN piese_current_stock cs ON cs.part_id=p.id AND cs.warehouse_id=loc.warehouse_id
WHERE loc.min_qty>0 AND cs.qty<=loc.min_qty;

CREATE OR REPLACE VIEW piese_recent_docs AS
SELECT d.id, d.doc_type, d.status, d.created_at, w.name AS warehouse_name, w2.name AS to_warehouse_name,
  (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id=d.id) AS line_count
FROM piese_stock_documents d
LEFT JOIN piese_warehouses w ON w.id=d.warehouse_id
LEFT JOIN piese_warehouses w2 ON w2.id=d.to_warehouse_id
ORDER BY d.created_at DESC, d.id DESC;

-- RLS pe toate tabelele piese_* (anon nu vede nimic; service_role trece peste) — aliniere cu regula TRANSLUX (015_enable_rls)
ALTER TABLE piese_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_part_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_part_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_mechanics ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_breakdown_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_stock_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_stock_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_fifo_alloc ENABLE ROW LEVEL SECURITY;
ALTER TABLE piese_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ploc_warehouse ON piese_part_locations(warehouse_id);

-- NOTĂ: funcția piese_create_issue a fost re-creată cu `FOR UPDATE` pe piesă (anti-oversell la concurență);
-- vezi definiția aplicată live în migrația piese_hardening (identică cu cea din 200 + linia PERFORM ... FOR UPDATE).
-- OPTIMIZARE VIITOARE (la 3000+ piese): materialized view piese_current_stock_mv (refresh după RPC) — vezi review.
