-- 367: Prețul de vânzare devine o valoare MEMORATĂ, cu regula „urcă, nu coboară".
--
-- Regula cerută de Eduard și confirmată de Mariana (25.09.2026):
--   • vine marfă cu cost MAI MARE → prețul nou se aplică la TOT, inclusiv stocului de pe raft;
--   • vine marfă cu cost MAI MIC  → prețul rămâne cel vechi (adaosul pe bucățile noi iese mai mare).
-- Întrebată explicit dacă prețul coboară după ce se epuizează marfa scumpă (cum spusese Eduard pe 12.09:
-- «не понижает цену пока не уйдет товар по старой цене»), Mariana a răspuns: «ramine sus».
-- Deci NU coboară singur niciodată.
--
-- DE CE E O SCHIMBARE DE FOND: până acum prețul nu era păstrat nicăieri. `piese_sale_parts` îl RECALCULA
-- la fiecare citire, ca medie a costurilor de intrare × adaos. O formulă nu poate „rămâne": media se
-- mișcă singură la fiecare recepție, în sus și în jos. Ca să existe un „preț existent" pe care să-l
-- păstrăm, prețul trebuie să fie o valoare scrisă.
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS sale_price numeric;
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS sale_price_at timestamptz;
-- De unde vine prețul curent: 'receptie' (cricul), 'adaos', 'manual', 'initial'.
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS sale_price_sursa text;

-- `markup_pct` e `real`, deci fără cast explicit tot calculul alunecă în virgulă mobilă și `round(...,0)`
-- nici nu există pentru acel tip. Banii se calculează în `numeric`.
CREATE OR REPLACE FUNCTION piese_pret_candidat(p_part bigint, p_cost numeric)
RETURNS numeric LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT round(COALESCE(p_cost, 0) * (1 + COALESCE(p.markup_pct, g.markup_pct, 0)::numeric / 100.0), 0)
    FROM piese_parts p JOIN piese_part_groups g ON g.id = p.group_id
   WHERE p.id = p_part;
$$;

-- Sămânța: prețurile de azi, calculate după formula veche, devin prețurile memorate. Fără pasul ăsta,
-- magazinul ar fi rămas o zi fără prețuri.
UPDATE piese_parts p
   SET sale_price = s.price, sale_price_at = now(), sale_price_sursa = 'initial'
  FROM piese_sale_parts s
 WHERE s.id = p.id AND s.price > 0 AND p.sale_price IS NULL;

-- Cricul stă pe REGISTRUL DE MIȘCĂRI, nu în `piese_create_receipt`: aici se prind toate căile prin care
-- marfa ajunge în magazin — recepție, mutare dintr-un depozit intern, intrare de piesă б/у.
-- Forma finală a funcției e în migr. 368 (conversia costului la `numeric`).
CREATE OR REPLACE FUNCTION piese_pret_cric() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_shop bigint; v_nou numeric; v_vechi numeric;
BEGIN
  IF NEW.movement_type NOT IN ('RECEIPT','TRANSFER_IN','DONOR_IN') THEN RETURN NEW; END IF;
  IF NEW.qty_delta <= 0 OR NOT piese_cost_ok(NEW.unit_cost) THEN RETURN NEW; END IF;
  SELECT id INTO v_shop FROM piese_warehouses WHERE kind = 'SHOP' LIMIT 1;
  IF v_shop IS NULL OR NEW.warehouse_id <> v_shop THEN RETURN NEW; END IF;
  v_nou := piese_pret_candidat(NEW.part_id, NEW.unit_cost);
  SELECT sale_price INTO v_vechi FROM piese_parts WHERE id = NEW.part_id;
  IF v_nou IS NULL OR v_nou <= COALESCE(v_vechi, 0) THEN RETURN NEW; END IF;
  UPDATE piese_parts SET sale_price = v_nou, sale_price_at = now(), sale_price_sursa = 'receptie'
   WHERE id = NEW.part_id;
  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
  VALUES (NULL, 'PRICE_UP', 'part', NEW.part_id,
          format('Preț de vânzare %s → %s (cost %s, recepție în magazin)', COALESCE(v_vechi,0), v_nou, NEW.unit_cost));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_piese_pret_cric ON piese_stock_movements;
CREATE TRIGGER trg_piese_pret_cric AFTER INSERT ON piese_stock_movements
  FOR EACH ROW EXECUTE FUNCTION piese_pret_cric();

-- Vederea magazinului citește acum prețul MEMORAT. Coloanele vechi rămân toate, ca ecranele să nu se rupă.
CREATE OR REPLACE VIEW piese_sale_parts AS
  SELECT p.id, g.name_ro AS grp, p.manufacturer, p.model,
         COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
         COALESCE(p.sale_price, 0)::numeric AS price,
         p.sale_price_at, p.sale_price_sursa
    FROM piese_parts p JOIN piese_part_groups g ON g.id = p.group_id
   WHERE p.is_for_sale AND p.active
   ORDER BY g.name_ro;

REVOKE ALL ON FUNCTION piese_pret_candidat(bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_pret_candidat(bigint, numeric) TO service_role;
REVOKE ALL ON piese_sale_parts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_sale_parts TO service_role;
