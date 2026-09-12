-- 343: Mutările pe mașină se văd și în ecranul Mutări.
--
-- Defectul din spatele incidentului 417/418. Migr. 319 le-a scos din lista de tranzit — corect, fiindcă pe
-- calea aceea n-au voie să fie confirmate (`piese_transfer_receive` le respinge cu FOR_VEHICLE). Efectul
-- neintenționat: marfa devine invizibilă exact în ecranul unde s-ar uita oricine. Cine primește n-o vede
-- deloc în Mutări, iar confirmarea stă în Rashod, la depozitul-destinație, după ce schimbi selectorul.
--
-- Eduard a căutat-o acolo, n-a găsit-o, și a eliberat piesa manual din Briceni — de unde stocul −1 și
-- acumulatorul de 10 585 lei ajuns pe autobuz cu cost zero.
--
-- Vederea capătă `to_name`, ca lista să poată spune ÎNCOTRO merge marfa. Adăugarea unei coloane e sigură
-- pentru apelantul existent (`transfersForVehicle` filtrează pe `to_warehouse_id` și citește pe nume).
DROP VIEW IF EXISTS piese_transfers_for_vehicle;

CREATE VIEW piese_transfers_for_vehicle AS
  SELECT d.id, d.warehouse_id AS from_warehouse_id, w.name AS from_name,
         d.to_warehouse_id, w2.name AS to_name,
         d.vehicle_id, v.plate AS vehicle_plate,
         d.mechanic_id, m.name AS mechanic_name, d.created_at,
         (SELECT count(*) FROM piese_stock_document_lines l WHERE l.document_id = d.id) AS line_count
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    JOIN piese_warehouses w2 ON w2.id = d.to_warehouse_id
    JOIN piese_vehicles v ON v.id = d.vehicle_id
    LEFT JOIN piese_mechanics m ON m.id = d.mechanic_id
   WHERE d.doc_type = 'TRANSFER' AND d.status = 'IN_TRANSIT' AND d.vehicle_id IS NOT NULL;

REVOKE ALL ON piese_transfers_for_vehicle FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_transfers_for_vehicle TO service_role;
