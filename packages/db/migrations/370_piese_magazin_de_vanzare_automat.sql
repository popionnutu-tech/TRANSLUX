-- 370: Marfa care intră în MAGAZIN devine automat „de vânzare".
--
-- Eduard (05.10.2026): «можно сделать по умолчанию все запчасти на магазин имеют автоматически галочку
-- de vinzare». Întemeiat: 41 de piese au intrat vreodată în magazin, dar doar 5 erau bifate. Restul de 36
-- stăteau fizic pe raft fără să poată fi vândute din program — și nimeni n-avea de unde ști care-s.
--
-- Declanșator SEPARAT de cel al prețului (migr. 367-368), deși se aprind la același eveniment: fiecare
-- face un singur lucru. Legate într-unul, o schimbare viitoare la preț ar fi riscat bifa, și invers.
--
-- Piesele б/у sunt EXCLUSE deliberat. Decizia Marianei (14.09): «vor fi pentru uz intern la moment».
-- Dacă vreodată se vinde una, bifa se pune cu mâna — pasul acela e tocmai decizia, nu o formalitate.
CREATE OR REPLACE FUNCTION piese_magazin_de_vanzare() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_shop bigint;
BEGIN
  IF NEW.movement_type NOT IN ('RECEIPT','TRANSFER_IN','DONOR_IN') OR NEW.qty_delta <= 0 THEN RETURN NEW; END IF;
  SELECT id INTO v_shop FROM piese_warehouses WHERE kind = 'SHOP' LIMIT 1;
  IF v_shop IS NULL OR NEW.warehouse_id <> v_shop THEN RETURN NEW; END IF;

  UPDATE piese_parts SET is_for_sale = true
   WHERE id = NEW.part_id AND NOT is_for_sale AND NOT COALESCE(is_used, false);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_piese_magazin_de_vanzare ON piese_stock_movements;
CREATE TRIGGER trg_piese_magazin_de_vanzare AFTER INSERT ON piese_stock_movements
  FOR EACH ROW EXECUTE FUNCTION piese_magazin_de_vanzare();

-- Recuperarea celor rămase în urmă. Reversibil — bifa se poate scoate oricând din Catalog.
UPDATE piese_parts p SET is_for_sale = true
 WHERE NOT p.is_for_sale AND NOT COALESCE(p.is_used, false) AND p.active
   AND EXISTS (SELECT 1 FROM piese_stock_movements m JOIN piese_warehouses w ON w.id = m.warehouse_id
                WHERE m.part_id = p.id AND w.kind = 'SHOP'
                  AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN') AND m.qty_delta > 0);
