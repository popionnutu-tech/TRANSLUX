-- 394: Lista magazinului capătă denumirea piesei, articolul și codurile de bare.
--
-- Eduard, 07.10: «в продажу в поиске не находит по штрихкоду и коду». A scanat 8683658116501 și a primit
-- „Nimic găsit", deși piesa există, e bifată de vânzare și are codul înregistrat.
--
-- Cauza nu era căutarea, ci LISTA: `piese_sale_parts` întorcea doar `id, grупa, producător, model, adaos,
-- preț`. Nici denumirea, nici articolul, nici codurile. Ecranul Magazin filtrează în memorie după eticheta
-- afișată, iar eticheta — construită dintr-o funcție LOCALĂ a paginii, nu din cea comună — ieșea
-- „Кузов и ЛКМ — Taclar (312)": categoria și marca, fără marfă.
--
-- Deci vânzătorul nu doar că nu putea căuta după cod: nu vedea nici denumirea pieselor din listă. Cu 84 de
-- poziții în câteva categorii, alegerea era ghicitoare. Nu s-a observat până acum fiindcă prin ecranul
-- ăsta nu s-a vândut niciodată nimic — vânzările se fac în IntelectSoft, iar modulul are 0 documente SALE.
--
-- Partea de aplicație: pagina folosește acum `partLabel` comună (denumire — producător (model) · articol),
-- iar combobox-ul primește separat un text de CĂUTARE care conține și articolul, OEM-ul și toate codurile
-- de bare. Codurile nu intră în eticheta vizibilă — ar îneca denumirea — dar se caută după ele.
CREATE OR REPLACE VIEW piese_sale_parts AS
 SELECT p.id,
    g.name_ro AS grp,
    p.manufacturer,
    p.model,
    COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
    COALESCE(p.sale_price, 0::numeric) AS price,
    p.sale_price_at,
    p.sale_price_sursa,
    -- adăugate la coadă: `CREATE OR REPLACE VIEW` cere ca vechile coloane să rămână în aceeași ordine
    p.name_ro,
    p.name_long,
    p.article_code,
    p.oem_code,
    p.barcodes_all,
    p.is_used
   FROM piese_parts p
     JOIN piese_part_groups g ON g.id = p.group_id
  WHERE p.is_for_sale AND p.active
  ORDER BY g.name_ro;
