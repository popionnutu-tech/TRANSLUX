-- 408: Ce ne trebuie ca să trimitem MUTĂRILE în 1C (documentul «Перемещение»).
--
-- De ce mutarea e documentul cel mai urgent din cele trei: lipsa ei a produs chiar nepotrivirea pe care
-- contabilul a semnalat-o la proba de casare. La noi marfa trecuse din Magazin în Briceni, dar mutarea nu
-- ajungea la el — așa că piesele îi rămâneau în MAGAZIN TLX, iar casarea venea dintr-un depozit în care
-- avea zero.
--
-- Documentul lor face însă și altceva, ce nu bănuiam până am văzut un «Перемещение» real: nu doar
-- deplasează marfa dintr-un depozit în altul, ci o TRECE DE PE UN CONT CONTABIL PE ALTUL. Recepția pune
-- totul pe «ТоварыНаСкладах» (verificat pe două recepții reale, una chiar de piese); abia mutarea o duce pe
-- «ЗапасныеЧасти». Deci contul nu e o proprietate a documentului, ci a DEPOZITULUI — de aici coloana de
-- mai jos. Astăzi toate cele 94 de mutări merg Magazin → depozit intern, dar dacă mâine una se întoarce
-- invers, contul trebuie să se întoarcă cu ea; altfel am posta pe contul greșit, tăcut.
ALTER TABLE piese_warehouses ADD COLUMN IF NOT EXISTS cont_1c text;

UPDATE piese_warehouses SET cont_1c = 'ТоварыНаСкладах' WHERE id = 3 AND cont_1c IS NULL;  -- Magazin piese
UPDATE piese_warehouses SET cont_1c = 'ЗапасныеЧасти'  WHERE id IN (1, 2) AND cont_1c IS NULL;  -- Bălți, Briceni

-- Conținutul de exportat al unei mutări, ca NET pe piesă — aceeași regulă ca la eliberări (migr. 360):
-- o mutare poate conține și linii de corecție, iar o pereche care se anulează n-are ce căuta în
-- contabilitate. Suma se întoarce doar ca să fie VIZIBILĂ pe ecran; în fișier nu pleacă (vezi comentariul
-- din `piese-1c-perem.ts`: în documentul lor real `Сумма` e gol, costul îl calculează 1C).
CREATE OR REPLACE FUNCTION piese_1c_mutare_linii(p_doc bigint)
RETURNS TABLE(part_id bigint, part_name text, qty numeric, suma numeric, guid_1c uuid)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         SUM(l.qty)::numeric,
         ROUND(SUM(l.qty * COALESCE(l.unit_cost, 0))::numeric, 2),
         p.guid_1c
    FROM piese_stock_document_lines l
    JOIN piese_parts p ON p.id = l.part_id
   WHERE l.document_id = p_doc
   GROUP BY l.part_id, 2, p.guid_1c
  HAVING SUM(l.qty) > 0.0000001
   ORDER BY l.part_id;
$$;

-- Lista mutărilor cu starea de pregătire, ca la eliberări: motivul refuzului se vede ÎNAINTE de clic,
-- fiindcă un GUID lipsă nu e ceva ce depozitarul poate repara singur.
CREATE OR REPLACE FUNCTION piese_1c_mutari(p_limita int DEFAULT 100)
RETURNS TABLE(id bigint, data text, din text, spre text,
              linii int, suma numeric, gata boolean, motiv text, trimis boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY'),
         ws.name,
         wd.name,
         COALESCE(l.n, 0)::int,
         COALESCE(l.suma, 0)::numeric,
         (COALESCE(l.n, 0) > 0
          AND ws.guid_1c IS NOT NULL AND ws.cont_1c IS NOT NULL
          AND wd.id IS NOT NULL AND wd.guid_1c IS NOT NULL AND wd.cont_1c IS NOT NULL
          AND COALESCE(l.fara_guid, 0) = 0),
         CASE
           WHEN COALESCE(l.n, 0) = 0 THEN 'nimic de trimis — net zero'
           WHEN wd.id IS NULL THEN 'documentul nu are depozit de destinație'
           WHEN ws.guid_1c IS NULL THEN 'depozitul „' || ws.name || '" nu e legat de 1C'
           WHEN wd.guid_1c IS NULL THEN 'depozitul „' || wd.name || '" nu e legat de 1C'
           WHEN ws.cont_1c IS NULL THEN 'depozitul „' || ws.name || '" nu are cont contabil 1C'
           WHEN wd.cont_1c IS NULL THEN 'depozitul „' || wd.name || '" nu are cont contabil 1C'
           WHEN COALESCE(l.fara_guid, 0) > 0 THEN l.fara_guid || ' piese nu sunt legate de 1C'
           ELSE NULL
         END,
         d.guid_1c IS NOT NULL
    FROM piese_stock_documents d
    JOIN piese_warehouses ws ON ws.id = d.warehouse_id
    LEFT JOIN piese_warehouses wd ON wd.id = d.to_warehouse_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n,
             SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid
        FROM piese_1c_mutare_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'TRANSFER'
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

-- `ALTER DEFAULT PRIVILEGES` dă EXECUTE pe fiecare funcție nouă lui anon/authenticated (migr. 289).
REVOKE ALL ON FUNCTION piese_1c_mutare_linii(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_1c_mutari(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_mutare_linii(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_1c_mutari(int) TO service_role;
