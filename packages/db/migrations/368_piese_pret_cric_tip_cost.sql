-- 368: Cricul de preț — conversia costului la `numeric`.
--
-- `piese_stock_movements.unit_cost` e `real` (virgulă mobilă), nu `numeric`. Fără conversie, nici
-- `piese_cost_ok`, nici `piese_pret_candidat` nu se potrivesc ca tip, iar declanșatorul cădea la PRIMA
-- recepție — adică ar fi blocat recepțiile în magazin, nu doar calculul prețului.
--
-- Prins la prima probă. Conversia se face explicit, la intrarea în calcul.
CREATE OR REPLACE FUNCTION piese_pret_cric() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_shop bigint; v_cost numeric; v_nou numeric; v_vechi numeric;
BEGIN
  IF NEW.movement_type NOT IN ('RECEIPT','TRANSFER_IN','DONOR_IN') THEN RETURN NEW; END IF;
  v_cost := NEW.unit_cost::numeric;
  IF NEW.qty_delta <= 0 OR NOT piese_cost_ok(v_cost) THEN RETURN NEW; END IF;

  SELECT id INTO v_shop FROM piese_warehouses WHERE kind = 'SHOP' LIMIT 1;
  IF v_shop IS NULL OR NEW.warehouse_id <> v_shop THEN RETURN NEW; END IF;

  v_nou := piese_pret_candidat(NEW.part_id, v_cost);
  SELECT sale_price INTO v_vechi FROM piese_parts WHERE id = NEW.part_id;

  -- Inima regulii: doar în sus. Egal nu e o schimbare, deci nu se scrie nimic.
  IF v_nou IS NULL OR v_nou <= COALESCE(v_vechi, 0) THEN RETURN NEW; END IF;

  UPDATE piese_parts
     SET sale_price = v_nou, sale_price_at = now(), sale_price_sursa = 'receptie'
   WHERE id = NEW.part_id;

  -- Urma: prețul s-a schimbat SINGUR, fără ca cineva să apese ceva. Dacă n-ar rămâne scris, nimeni n-ar
  -- putea explica peste o lună de ce piesa costă altceva.
  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
  VALUES (NULL, 'PRICE_UP', 'part', NEW.part_id,
          format('Preț de vânzare %s → %s (cost %s, recepție în magazin)',
                 COALESCE(v_vechi, 0), v_nou, round(v_cost, 2)));
  RETURN NEW;
END $$;
