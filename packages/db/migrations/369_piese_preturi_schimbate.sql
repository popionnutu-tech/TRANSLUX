-- 369: Lista „s-a schimbat prețul — retipărește eticheta".
--
-- Condiția fără de care regula de preț e periculoasă, nu utilă. De la migr. 367, prețul se schimbă SINGUR
-- la recepție, fără ca cineva să apese ceva. Eticheta de pe raft rămâne cea veche, iar clientul vede un
-- preț pe raft și altul la casă — exact genul de neconcordanță pe care nimeni n-o observă până nu se
-- ceartă cineva la tejghea.
--
-- Vechiul preț se ia din JURNAL: coloana din `piese_parts` știe doar valoarea de acum.
CREATE OR REPLACE VIEW piese_preturi_schimbate AS
  SELECT p.id                                   AS part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS nume,
         COALESCE(p.article_code, '')           AS articol,
         COALESCE(p.barcode, '')                AS cod_bare,
         p.sale_price                           AS pret_nou,
         -- „1763" din «Preț de vânzare 1763 → 2500 (…)». Dacă formatul urmei se schimbă vreodată, aici
         -- iese NULL, nu un număr greșit.
         NULLIF(substring(a.detail from 'Preț de vânzare ([0-9.]+) →'), '')::numeric AS pret_vechi,
         a.created_at                           AS cand,
         (a.created_at AT TIME ZONE 'Europe/Chisinau')::date AS ziua
    FROM piese_audit_log a
    JOIN piese_parts p ON p.id = a.entity_id AND p.active
   WHERE a.action = 'PRICE_UP' AND a.entity = 'part'
   ORDER BY a.created_at DESC;

REVOKE ALL ON piese_preturi_schimbate FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_preturi_schimbate TO service_role;
