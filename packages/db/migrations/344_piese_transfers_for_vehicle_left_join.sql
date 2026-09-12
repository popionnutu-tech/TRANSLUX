-- 344: Vederea mutărilor pe mașină nu mai poate ascunde un rând cu destinație lipsă.
--
-- `to_warehouse_id` e nullable în `piese_stock_documents`. `piese_transfer_send` ridică BAD_WAREHOUSE pe
-- destinație NULL, deci practic nu se poate întâmpla — dar joinul era INNER pe o coloană fără NOT NULL,
-- într-o vedere care alimentează ȘI lista de confirmat din Rashod. Un singur rând scăpat cu destinație NULL
-- ar fi dispărut din AMBELE ecrane, cu marfa deja ieșită din depozitul-sursă: exact clasa de defect pe care
-- migr. 343 tocmai a reparat-o. `LEFT JOIN` costă zero.
--
-- Plus indexul care face planul determinist pentru lista nefiltrată: `ORDER BY created_at DESC LIMIT 100`
-- putea nimeri pe indexul general `(doc_type, created_at)` și, cum în regim normal se califică sub o sută
-- de rânduri, LIMIT-ul nu se umple niciodată — deci s-ar fi parcurs toată partiția TRANSFER. Costul ar fi
-- fost mai mare cu zero mutări în tranzit decât cu o sută, adică imposibil de observat la testare.
CREATE INDEX IF NOT EXISTS idx_pdoc_transit_vehicle_recent
  ON piese_stock_documents (created_at DESC, id DESC)
  WHERE doc_type = 'TRANSFER' AND status = 'IN_TRANSIT' AND vehicle_id IS NOT NULL;

DROP VIEW IF EXISTS piese_transfers_for_vehicle;

CREATE VIEW piese_transfers_for_vehicle AS
  SELECT d.id, d.warehouse_id AS from_warehouse_id, w.name AS from_name,
         d.to_warehouse_id, w2.name AS to_name,
         d.vehicle_id, v.plate AS vehicle_plate,
         d.mechanic_id, m.name AS mechanic_name, d.created_at,
         (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS line_count
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    LEFT JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
    JOIN piese_vehicles v ON v.id = d.vehicle_id
    LEFT JOIN piese_mechanics m ON m.id = d.mechanic_id
   WHERE d.doc_type = 'TRANSFER' AND d.status = 'IN_TRANSIT' AND d.vehicle_id IS NOT NULL;

REVOKE ALL ON piese_transfers_for_vehicle FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_transfers_for_vehicle TO service_role;
