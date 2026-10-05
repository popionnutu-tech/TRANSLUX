-- 371: Sămânța de preț pentru piesele bifate „de vânzare" în migr. 370.
--
-- Scăpare prinsă imediat după 370: sămânța din migr. 367 se uita la `piese_sale_parts`, care filtrează
-- `is_for_sale`. Migr. 370 a bifat 36 de piese NOI — toate ar fi ajuns în lista magazinului cu prețul gol,
-- fiindcă sămânța rulase înainte ca ele să existe în acea listă.
--
-- Efectul vizibil ar fi fost: 38 de piese în magazin, toate cu „— lei". Vânzătorul le-ar fi văzut pe ecran
-- și ar fi fost nevoit să întrebe prețul pentru fiecare.
--
-- Prețul se calculează din costul mediu al intrărilor ÎN MAGAZIN — aceeași formulă pe care o folosea
-- vederea veche. De aici încolo intră regula „urcă, nu coboară" (migr. 367).
UPDATE piese_parts p
   SET sale_price = piese_pret_candidat(p.id, c.cost_mediu),
       sale_price_at = now(),
       sale_price_sursa = 'initial'
  FROM (
    SELECT m.part_id, AVG(m.unit_cost)::numeric AS cost_mediu
      FROM piese_stock_movements m
      JOIN piese_warehouses w ON w.id = m.warehouse_id
     WHERE w.kind = 'SHOP' AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN')
     GROUP BY m.part_id
  ) c
 WHERE c.part_id = p.id
   AND p.is_for_sale AND p.active
   AND p.sale_price IS NULL
   AND c.cost_mediu > 0;
