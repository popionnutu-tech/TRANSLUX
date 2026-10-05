-- 376: Lista dublurilor din catalog, pentru ecranul de verificare.
--
-- Eduard a cerut avertisment la introducere (migr. 372); Mariana a propus pasul următor: un buton în
-- Catalog care arată dublurile, iar el alege pe loc care rămâne. «Dacă îi dau o listă, el ar trebui întâi
-- s-o analizeze, apoi să facă schimbări, pe urmă se mai încurcă.» Un om care corectează cu piesele în
-- față greșește mai puțin decât unul care citește un fișier și apoi caută fiecare poziție.
--
-- MOMENTUL CONTEAZĂ. Azi, din 164 de grupuri cu articol repetat, în NICIUNUL nu există istoric pe mai
-- multe piese: 161 n-au istoric deloc, iar 3 au o singură piesă cu mișcări. Deci nu e nimic de mutat —
-- nici stoc, nici straturi FIFO. Din clipa în care se primește marfă pe ambele piese ale unui grup,
-- unirea devine o operație care mută bani. Acum e gratis.
--
-- Câștig lateral: niciuna dintre cele 336 de piese implicate nu e legată de 1C, tocmai fiindcă articolul
-- repetat le făcea ambigue la potrivire (migr. 359). După unire se vor putea lega.
ALTER TABLE piese_parts ADD COLUMN IF NOT EXISTS merged_into bigint REFERENCES piese_parts(id);
CREATE INDEX IF NOT EXISTS idx_pparts_merged_into ON piese_parts(merged_into) WHERE merged_into IS NOT NULL;

-- `completare` numără câmpurile pline — exact criteriul formulat de Mariana: «ar șterge acea piesă care
-- nu are informația completă».
CREATE OR REPLACE FUNCTION piese_dubluri(p_limita int DEFAULT 200)
RETURNS TABLE(cheie text, fel text, part_id bigint, nume text, articol text, oem text,
              producator text, model text, grupa text, coduri text, stoc numeric,
              miscari int, completare int, sugerat boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH grupuri AS (
    SELECT lower(btrim(article_code)) AS cheie, 'articol'::text AS fel, array_agg(id) AS ids
      FROM piese_parts
     WHERE active AND merged_into IS NULL AND NULLIF(btrim(article_code), '') IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1
  ),
  membri AS (
    SELECT g.cheie, g.fel, p.id,
           COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS nume,
           COALESCE(p.article_code, '') AS articol,
           COALESCE(p.oem_code, '') AS oem,
           COALESCE(p.manufacturer, '') AS producator,
           COALESCE(p.model, '') AS model,
           COALESCE(gr.name_ro, '') AS grupa,
           COALESCE((SELECT string_agg(b.barcode, ', ' ORDER BY b.is_primary DESC, b.barcode)
                       FROM piese_part_barcodes b WHERE b.part_id = p.id), '') AS coduri,
           COALESCE((SELECT SUM(m.qty_delta) FROM piese_stock_movements m WHERE m.part_id = p.id), 0)::numeric AS stoc,
           COALESCE((SELECT count(*) FROM piese_stock_movements m WHERE m.part_id = p.id), 0)::int AS miscari,
           (CASE WHEN NULLIF(btrim(p.oem_code), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN NULLIF(btrim(p.manufacturer), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN NULLIF(btrim(p.model), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN NULLIF(btrim(p.name_ro), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN EXISTS (SELECT 1 FROM piese_part_barcodes b WHERE b.part_id = p.id) THEN 1 ELSE 0 END)::int AS completare
      FROM grupuri g, LATERAL unnest(g.ids) pid
      JOIN piese_parts p ON p.id = pid
      JOIN piese_part_groups gr ON gr.id = p.group_id
  )
  SELECT m.cheie, m.fel, m.id, m.nume, m.articol, m.oem, m.producator, m.model, m.grupa,
         m.coduri, m.stoc, m.miscari, m.completare,
         -- Sugestia: cea cu ISTORIC are întâietate (acolo stau mișcările, care nu se pot muta), apoi cea
         -- mai completă, apoi cea mai veche. Doar o sugestie — alegerea rămâne a omului.
         m.id = (SELECT m2.id FROM membri m2 WHERE m2.cheie = m.cheie
                  ORDER BY (m2.miscari > 0) DESC, m2.completare DESC, m2.id ASC LIMIT 1) AS sugerat
    FROM membri m
   WHERE m.cheie IN (SELECT DISTINCT cheie FROM membri ORDER BY cheie LIMIT GREATEST(p_limita, 1))
   ORDER BY m.cheie, sugerat DESC, m.id;
$$;

REVOKE ALL ON FUNCTION piese_dubluri(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_dubluri(int) TO service_role;
