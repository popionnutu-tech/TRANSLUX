-- 366: Lista eliberărilor cu starea lor de pregătire pentru 1C.
--
-- Se arată ÎNAINTE de a apăsa, nu după. „3 piese nelegate" citit dintr-o privire e altceva decât un buton
-- care refuză la al treilea clic — mai ales că motivul refuzului (un GUID lipsă) nu e ceva ce depozitarul
-- poate repara singur.
--
-- Totul într-o singură interogare, nu una per document: ecranul arată o sută de rânduri deodată.
CREATE OR REPLACE FUNCTION piese_1c_eliberari(p_limita int DEFAULT 100)
RETURNS TABLE(id bigint, data text, depozit text, masina text, lacatus text,
              linii int, suma numeric, gata boolean, motiv text, trimis boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY'),
         w.name,
         v.plate,
         m.name,
         COALESCE(l.n, 0)::int,
         COALESCE(l.suma, 0)::numeric,
         -- „Gata" înseamnă: are ce trimite ȘI tot ce trebuie e legat de 1C.
         (COALESCE(l.n, 0) > 0 AND w.guid_1c IS NOT NULL
          AND d.vehicle_id IS NOT NULL AND v.guid_1c_activitate IS NOT NULL
          AND COALESCE(l.fara_guid, 0) = 0),
         CASE
           WHEN COALESCE(l.n, 0) = 0 THEN 'totul a fost returnat — consum net zero'
           WHEN w.guid_1c IS NULL THEN 'depozitul „' || w.name || '" nu e legat de 1C'
           WHEN d.vehicle_id IS NULL THEN 'documentul nu are mașină'
           WHEN v.guid_1c_activitate IS NULL THEN 'mașina ' || v.plate || ' nu e în «вид деятельности» din 1C'
           WHEN COALESCE(l.fara_guid, 0) > 0 THEN l.fara_guid || ' piese nu sunt legate de 1C'
           ELSE NULL
         END,
         d.guid_1c IS NOT NULL
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    LEFT JOIN piese_vehicles v ON v.id = d.vehicle_id
    LEFT JOIN piese_mechanics m ON m.id = d.mechanic_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n,
             SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid
        FROM piese_1c_spisanie_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'ISSUE'
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

REVOKE ALL ON FUNCTION piese_1c_eliberari(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_eliberari(int) TO service_role;
