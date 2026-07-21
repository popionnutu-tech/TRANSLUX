-- 243: Piese — (A) adaos comercial 25% la TOATE grupele + (B) preț de vânzare rotunjit la NUMĂR ÎNTREG.
-- Cerut de Mariana. Regula: cost × (1 + adaos%) apoi rotunjit la întreg (ex. 151 × 1.25 = 188,75 → 189).
-- Aplicat pe prod prin Supabase MCP (efect instant — codul citește doar view-urile, fără deploy).

-- (A) Toate grupele de piese la 25% adaos.
UPDATE piese_part_groups SET markup_pct = 25;

-- (B) Rotunjire la întreg (round(...,0) în loc de round(...,2)) în ambele view-uri de preț de vânzare.
-- piese_part_sale_price = folosit de Căutare (cost mediu din toate recepțiile).
CREATE OR REPLACE VIEW piese_part_sale_price AS
 SELECT p.id AS part_id,
    g.markup_pct,
    a.avg_cost,
    round((a.avg_cost * (1::double precision + g.markup_pct / 100.0::double precision))::numeric, 0) AS sale_price
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
     LEFT JOIN LATERAL ( SELECT COALESCE(avg(m.unit_cost), 0::double precision) AS avg_cost
           FROM piese_stock_movements m
          WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT'::text AND m.unit_cost > 0::double precision) a ON true
  WHERE p.active;

-- piese_sale_parts = folosit de Magazin (cost mediu din depozitul SHOP).
CREATE OR REPLACE VIEW piese_sale_parts AS
 SELECT p.id,
    g.name_ro AS grp,
    p.manufacturer,
    p.model,
    g.markup_pct,
    round((COALESCE(( SELECT avg(m.unit_cost) AS avg
           FROM piese_stock_movements m
          WHERE m.part_id = p.id AND m.warehouse_id = (( SELECT piese_warehouses.id
                   FROM piese_warehouses
                  WHERE piese_warehouses.kind = 'SHOP'::text
                 LIMIT 1)) AND m.qty_delta > 0::double precision), 0::double precision) * (1::double precision + g.markup_pct / 100.0::double precision))::numeric, 0) AS price
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.is_for_sale AND p.active
  ORDER BY g.name_ro;
