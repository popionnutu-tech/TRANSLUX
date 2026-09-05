-- 318: Adaos comercial pe PIESĂ, nu doar pe grupă — plus prețul de raft vizibil la recepție.
--
-- Cerut de Eduard (Prihod, punctul 4): „В приходном документе наценка товара на магазин? Печать этикеток?"
--
-- Adaosul exista deja, dar doar pe GRUPĂ (`piese_part_groups.markup_pct`). Eduard cere „наценка ТОВАРА" —
-- adaosul mărfii, nu al categoriei. Are sens: într-o grupă intră și piese ieftine de rotație rapidă, și
-- piese scumpe rare; un singur procent pentru toate e o aproximare care nu se poate corecta nicăieri.
--
-- Coloana e NULLABLE și cade pe grupă. Așa nimic nu se schimbă pentru cele 10.523 de piese existente:
-- prețurile rămân exact cele de azi, iar excepția se setează doar unde chiar e nevoie. O coloană
-- NOT NULL cu implicit 0 ar fi pus tăcut toate piesele pe adaos zero.
alter table piese_parts add column if not exists markup_pct real;

comment on column piese_parts.markup_pct is
  'Adaos comercial % al acestei piese. NULL = se folosește adaosul grupei (piese_part_groups.markup_pct).';

-- Un adaos negativ ar însemna vânzare sub cost — dacă e vreodată intenționat, se face prin preț manual,
-- nu printr-un procent pe care nimeni nu-l vede în ecranul de grupe.
alter table piese_parts drop constraint if exists piese_parts_markup_ck;
alter table piese_parts add constraint piese_parts_markup_ck
  check (markup_pct is null or (markup_pct >= 0 and markup_pct <= 1000));

-- ── Cele două view-uri de preț citesc adaosul EFECTIV ─────────────────────────
-- `COALESCE(p.markup_pct, g.markup_pct)` — o singură regulă, în ambele locuri. Dacă ar fi aplicată doar
-- într-unul, eticheta tipărită și prețul din magazin ar arăta sume diferite pentru aceeași piesă.

CREATE OR REPLACE VIEW piese_part_sale_price AS
  SELECT p.id AS part_id,
    COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
    a.avg_cost,
    round((a.avg_cost * (1::double precision + (COALESCE(p.markup_pct, g.markup_pct) / 100.0::double precision)))::numeric, 0) AS sale_price
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(avg(m.unit_cost), 0::double precision) AS avg_cost
      FROM piese_stock_movements m
     WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT' AND m.unit_cost > 0::double precision
       AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                        WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')
  ) a ON true
  WHERE p.active;

-- Prețul de raft din magazin. Filtrul pe tipuri de mișcare vine din migr. 312: `RETURN_ISSUE` are
-- cantitate pozitivă dar nu e o intrare de marfă, deci n-are ce căuta în media costului de achiziție.
CREATE OR REPLACE VIEW piese_sale_parts AS
  SELECT p.id, g.name_ro AS grp, p.manufacturer, p.model,
    COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
    round(((COALESCE((SELECT avg(m.unit_cost)
             FROM piese_stock_movements m
            WHERE m.part_id = p.id
              AND m.warehouse_id = (SELECT piese_warehouses.id FROM piese_warehouses
                                     WHERE piese_warehouses.kind = 'SHOP' LIMIT 1)
              AND m.movement_type IN ('RECEIPT','TRANSFER_IN','DONOR_IN','ADJUST_PLUS')
              AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                               WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')),
            (0)::double precision) * ((1)::double precision + (COALESCE(p.markup_pct, g.markup_pct) / (100.0)::double precision))))::numeric, 0) AS price
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.is_for_sale AND p.active
  ORDER BY g.name_ro;

-- Formularul de piesă trebuie să VADĂ adaosul ca să nu-l șteargă: `updatePart` rescrie toate coloanele
-- editabile, deci un câmp care nu ajunge în formular se golește la prima salvare.
CREATE OR REPLACE VIEW piese_catalog_rows AS
  SELECT p.id, p.group_id, p.name_long, p.manufacturer, p.model, p.article_code, p.oem_code,
    p.barcode, p.unit, p.is_for_sale, p.active, p.created_at,
    g.name_ro AS group_name, p.name_ro, p.barcodes_all, p.markup_pct
  FROM piese_parts p
  JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.active;

-- ── Prețul de raft al pieselor dintr-o recepție ───────────────────────────────
-- Cerut ca să se poată tipări etichetele imediat după recepție: marfa se pune pe raft o singură dată, cu
-- eticheta pe ea, nu se caută a doua zi piesă cu piesă în Catalog.
--
-- Se întorc DOAR piesele marcate „de vânzare": pentru o piesă de uz intern nu există preț de raft, iar o
-- etichetă cu preț pe o piesă care nu se vinde ar induce în eroare.
--
-- Prețul e cel de DUPĂ recepție (media include deja mișcările tocmai scrise) — adică exact ce trebuie să
-- apară pe eticheta lipită acum.
-- Prețul de pe etichetă trebuie să fie EXACT prețul pe care îl încasează magazinul, deci se ia din
-- `piese_sale_parts` — sursa ecranului Magazin. Prima variantă folosea `piese_part_sale_price` (media
-- recepțiilor din TOATE depozitele), iar casa magazinului media din depozitul SHOP: două formule pentru
-- același lucru, care ar fi divergat la prima recepție într-un depozit intern.
--
-- `d.status = 'CONFIRMED'`: după o corecție (`piese_replace_receipt`), documentul vechi rămâne CANCELLED —
-- fără filtru, funcția întorcea liniile lui, la prețuri care nu mai reflectă documentul valabil.
--
-- `p_wh` reverifică depozitul ÎN RPC, ca `piese_return_issue` (migr. 311). Nu pentru ziua de azi — garda
-- din server action e corectă — ci fiindcă funcția e exportată din lib, iar un apelant viitor care uită
-- `assertWarehouseAllowed` ar produce tăcut un IDOR peste toate depozitele. Cu parametrul obligatoriu,
-- semnătura e cea care avertizează, nu un comentariu.
CREATE OR REPLACE FUNCTION piese_receipt_labels(p_doc bigint, p_wh bigint)
RETURNS TABLE(part_id bigint, name text, manufacturer text, article_code text,
              barcode text, unit text, qty numeric, price numeric, markup_pct real)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS name,
         COALESCE(p.manufacturer, '') AS manufacturer,
         COALESCE(p.article_code, '') AS article_code,
         COALESCE(NULLIF(btrim(p.barcode), ''), COALESCE(p.article_code, '')) AS barcode,
         COALESCE(p.unit, 'buc') AS unit,
         sum(l.qty)::numeric AS qty,
         sp.price,
         sp.markup_pct
    FROM piese_stock_document_lines l
    JOIN piese_stock_documents d ON d.id = l.document_id
    JOIN piese_parts p ON p.id = l.part_id
    LEFT JOIN piese_sale_parts sp ON sp.id = p.id
   WHERE l.document_id = p_doc
     AND d.doc_type = 'RECEIPT' AND d.status = 'CONFIRMED'
     -- `p_wh IS NOT NULL` explicit: cu NULL, comparația ar fi NULL și filtrul ar dispărea tăcut.
     AND p_wh IS NOT NULL AND d.warehouse_id = p_wh
     AND p.is_for_sale AND p.active
     AND l.reverses_line_id IS NULL
   GROUP BY p.id, sp.price, sp.markup_pct
   ORDER BY name;
$$;

REVOKE ALL ON FUNCTION piese_receipt_labels(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_labels(bigint, bigint) TO service_role;
