-- 356: Identificarea piesei după codul scanat — exact sau deloc.
--
-- Varianta din aplicație (`.ilike` pe cod de bare, apoi `.eq` pe cod de articol, ambele cu `.limit(1)`)
-- avea trei defecte, toate găsite la review și toate cu același rezultat: bucăți numărate intră pe
-- articolul GREȘIT, iar diferența iese la iveală peste luni, ca lipsă inexplicabilă.
--
--  1. În `ilike`, `%` și `_` sunt jokeri, iar codul venea nefiltrat de la scaner. Un cod care conține `_`
--     potrivea codul altei piese de aceeași lungime. (Azi există UN cod de bare cu astfel de caracter din
--     9440 — deci rar, dar tăcut.)
--  2. `ilike` nu poate folosi `idx_ppbc_code_ci` (btree pe `lower(barcode)`), deci fiecare bip scana toate
--     cele ~9400 de coduri. Cu `lower(...) = lower(...)` e index scan: 0,09 ms în loc de scanare completă.
--  3. `article_code` NU e unic — azi 161 de coduri sunt purtate de mai multe piese active — iar `.limit(1)`
--     fără ORDER BY alegea arbitrar între ele. Cu modelul б/у (migr. 345), piesa uzată e un articol separat
--     care poartă în mod normal același cod ca cea nouă, deci situația se înrăutățește.
--
-- De aceea funcția întoarce TOATE potrivirile: mai mult de una înseamnă „întreabă omul", nu „ghicește".
-- Codul de bare are prioritate și e unic; codul de articol e doar a doua cheie, pentru piesele vechi care
-- n-au primit niciodată cod de bare și al căror articol omul îl tastează de pe eticheta de raft.
CREATE INDEX IF NOT EXISTS idx_pparts_article_ci
  ON piese_parts (lower(btrim(article_code))) WHERE active;

CREATE OR REPLACE FUNCTION piese_part_by_code(p_code text)
RETURNS TABLE(id bigint, name text, article text, unit text, via text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH c AS (SELECT lower(btrim(COALESCE(p_code, ''))) AS code),
  bc AS (
    SELECT p.id, p.is_used, p.name_ro, p.name_long, p.article_code, p.unit
      FROM c JOIN piese_part_barcodes b ON lower(b.barcode) = c.code
      JOIN piese_parts p ON p.id = b.part_id
     WHERE c.code <> '' AND p.active
  ),
  art AS (
    SELECT p.id, p.is_used, p.name_ro, p.name_long, p.article_code, p.unit
      FROM c JOIN piese_parts p ON lower(btrim(p.article_code)) = c.code
     WHERE c.code <> '' AND p.active AND NOT EXISTS (SELECT 1 FROM bc)
  )
  SELECT x.id,
         CASE WHEN x.is_used THEN 'б/у · ' ELSE '' END
           || COALESCE(NULLIF(btrim(x.name_ro), ''), x.name_long) AS name,
         COALESCE(x.article_code, '') AS article,
         COALESCE(x.unit, 'buc') AS unit,
         x.via
    FROM (SELECT *, 'barcode' AS via FROM bc
          UNION ALL
          SELECT *, 'article' AS via FROM art) x
   ORDER BY x.via, x.id
   LIMIT 10;
$$;

REVOKE ALL ON FUNCTION piese_part_by_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_part_by_code(text) TO service_role;
