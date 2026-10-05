-- 378: „Sunt piese diferite" — grupuri scoase definitiv din lista de dubluri.
--
-- Întrebarea Marianei (05.10): «dacă avem aceeași piesă dar are producător diferit și cod de bare diferit
-- — rămân 2 denumiri sau se unesc în 1?» Răspunsul: s-ar uni, iar producătorul celei desființate s-ar
-- pierde. Iar ea vrea tocmai opusul: «nu îmi trebuie să le unească, fiindcă ulterior vreau să văd care e
-- mai bună — să am o analitică și pentru producător».
--
-- Exemplele din baza reală:
--   articolul `5W30`  → ulei Mobil ȘI ulei Motul
--   articolul `S1M46` → ulei hidraulic Castrol ȘI Shell
-- Codul descrie vâscozitatea, nu produsul. Unite, ar face imposibilă exact comparația pe care o vrea.
--
-- Fără posibilitatea de a spune „astea-s diferite", lista ar arăta mereu aceleași 164 de grupuri, iar
-- omul ar fi împins să unească doar ca s-o curețe. Un ecran care nu se poate termina nu se folosește.
CREATE TABLE IF NOT EXISTS piese_dubluri_ignorate (
  cheie       text PRIMARY KEY,
  motiv       text,
  admin_id    uuid REFERENCES admin_accounts(id),
  actor_label text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE piese_dubluri_ignorate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON piese_dubluri_ignorate FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON piese_dubluri_ignorate TO service_role;

CREATE OR REPLACE FUNCTION piese_dubluri_ignora(p_cheie text, p_motiv text DEFAULT NULL,
                                                p_admin uuid DEFAULT NULL, p_actor text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO piese_dubluri_ignorate(cheie, motiv, admin_id, actor_label)
  VALUES (lower(btrim(p_cheie)), p_motiv, p_admin, p_actor)
  ON CONFLICT (cheie) DO NOTHING;
  INSERT INTO piese_audit_log(user_id, admin_id, actor_label, action, entity, detail)
  VALUES (NULL, p_admin, p_actor, 'DUP_IGNORE', 'part',
          format('Articolul „%s" marcat ca piese DIFERITE, nu dubluri', p_cheie));
END $$;

-- Tipul întors se schimbă (apare `producatori_diferiti`), deci funcția se șterge întâi.
DROP FUNCTION IF EXISTS piese_dubluri(int);

CREATE FUNCTION piese_dubluri(p_limita int DEFAULT 200)
RETURNS TABLE(cheie text, fel text, part_id bigint, nume text, articol text, oem text,
              producator text, model text, grupa text, coduri text, stoc numeric,
              miscari int, completare int, sugerat boolean, producatori_diferiti boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH ramase AS (
    SELECT lower(btrim(p.article_code)) AS cheie, 'articol'::text AS fel, array_agg(p.id) AS ids
      FROM piese_parts p
     WHERE p.active AND p.merged_into IS NULL AND NULLIF(btrim(p.article_code), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM piese_dubluri_ignorate i WHERE i.cheie = lower(btrim(p.article_code)))
     GROUP BY 1 HAVING count(*) > 1
  ),
  membri AS (
    SELECT r.cheie, r.fel, p.id,
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
      FROM ramase r CROSS JOIN LATERAL unnest(r.ids) AS u(pid)
      JOIN piese_parts p ON p.id = u.pid
      JOIN piese_part_groups gr ON gr.id = p.group_id
  )
  SELECT m.cheie, m.fel, m.id, m.nume, m.articol, m.oem, m.producator, m.model, m.grupa,
         m.coduri, m.stoc, m.miscari, m.completare,
         m.id = (SELECT m2.id FROM membri m2 WHERE m2.cheie = m.cheie
                  ORDER BY (m2.miscari > 0) DESC, m2.completare DESC, m2.id ASC LIMIT 1) AS sugerat,
         -- Semnalul cel mai tare că NU e o dublură: produse de mărci diferite care împart un cod.
         (SELECT count(DISTINCT NULLIF(btrim(lower(m3.producator)), '')) FROM membri m3
           WHERE m3.cheie = m.cheie) > 1 AS producatori_diferiti
    FROM membri m
   WHERE m.cheie IN (SELECT DISTINCT cheie FROM membri ORDER BY cheie LIMIT GREATEST(p_limita, 1))
   ORDER BY m.cheie, sugerat DESC, m.id;
$$;

REVOKE ALL ON FUNCTION piese_dubluri(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_dubluri_ignora(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_dubluri(int) TO service_role;
GRANT EXECUTE ON FUNCTION piese_dubluri_ignora(text, text, uuid, text) TO service_role;
