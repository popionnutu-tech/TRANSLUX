-- 372: Căutarea pieselor care se bat cap în cap cu una pe care tocmai o scrii.
--
-- Eduard (05.10.2026): «если штрихкод существует в базе (либо код товара один и тот же) программа выдает
-- сообщение что товар с таким кодом или штрихкодом уже существует».
--
-- Azi catalogul are 164 de grupuri cu același articol (336 piese) și 30 de grupuri unde ȘI articolul, ȘI
-- denumirea coincid. Codul de bare e apărat de un indice unic, dar eroarea pe care o dă la salvare e
-- tehnică — omul nu află CARE piesă îl folosește deja, deci nu poate decide nimic.
--
-- Funcția nu interzice nimic: întoarce ce a găsit, iar ecranul arată. Două piese cu același articol sunt
-- uneori legitime (ambalaje diferite, calități diferite) — decizia e a omului, nu a programului.
CREATE OR REPLACE FUNCTION piese_cauta_duplicate(
  p_articol text DEFAULT NULL, p_coduri text[] DEFAULT '{}', p_exclude bigint DEFAULT NULL
) RETURNS TABLE(id bigint, nume text, articol text, cod_bare text, motiv text, stoc numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH cautat AS (
    SELECT lower(btrim(COALESCE(p_articol, ''))) AS art,
           ARRAY(SELECT lower(btrim(x)) FROM unnest(COALESCE(p_coduri, '{}')) x WHERE btrim(x) <> '') AS coduri
  ),
  -- Codul de bare e cheia TARE: are indice unic, deci o potrivire înseamnă conflict sigur la salvare.
  dupa_cod AS (
    SELECT b.part_id, 'cod de bare'::text AS motiv, b.barcode AS cod
      FROM piese_part_barcodes b, cautat c
     WHERE lower(b.barcode) = ANY (c.coduri)
  ),
  -- Articolul e cheia MOALE: nu e unic și uneori se repetă legitim.
  dupa_articol AS (
    SELECT p.id AS part_id, 'articol'::text AS motiv, NULL::text AS cod
      FROM piese_parts p, cautat c
     WHERE c.art <> '' AND lower(btrim(p.article_code)) = c.art AND p.active
       AND NOT EXISTS (SELECT 1 FROM dupa_cod d WHERE d.part_id = p.id)
  )
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         COALESCE(p.article_code, ''),
         COALESCE(t.cod, p.barcode, ''),
         t.motiv,
         -- Stocul total: o piesă cu marfă pe raft nu se unește la fel de ușor ca una goală.
         COALESCE((SELECT SUM(m.qty_delta) FROM piese_stock_movements m WHERE m.part_id = p.id), 0)::numeric
    FROM (SELECT * FROM dupa_cod UNION ALL SELECT * FROM dupa_articol) t
    JOIN piese_parts p ON p.id = t.part_id
   WHERE p_exclude IS NULL OR p.id <> p_exclude
   ORDER BY t.motiv, p.id
   LIMIT 20;
$$;

REVOKE ALL ON FUNCTION piese_cauta_duplicate(text, text[], bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_cauta_duplicate(text, text[], bigint) TO service_role;
