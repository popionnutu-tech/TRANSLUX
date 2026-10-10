-- 410: Un document ANULAT nu are ce căuta în contabilitate.
--
-- Scăpare a mea la migrațiile 408-409: listele de export filtrau pe tipul documentului, dar nu pe starea
-- lui. Avem 6 recepții ANULATE, cu liniile intacte (anularea se face prin mișcări inverse, nu prin
-- ștergerea liniilor) — adică apăreau în listă ca oricare alta și ar fi plecat în 1C ca recepții reale.
-- Una dintre ele, 415, e chiar aceeași factură AAZ 2286024 introdusă de două ori: trimisă, i-ar fi dublat
-- contabilului marfa de 23 233 lei, iar la noi stocul e corect. Exact genul de eroare care nu se vede
-- până la inventar.
--
-- Aceeași gardă lipsea și la eliberări (migr. 366), deși acolo n-a avut ce strica: toate cele 91 sunt
-- confirmate. O punem oricum — ce lipsește azi din noroc, mâine lipsește din greșeală.
--
-- Mutarea „în drum" (IN_TRANSIT) nu se trimite nici ea: marfa n-a ajuns încă la destinație, iar
-- «Перемещение» la ei e o mutare încheiată.
CREATE OR REPLACE FUNCTION piese_1c_eliberari(p_limita int DEFAULT 100)
RETURNS TABLE(id bigint, data text, depozit text, masina text, lacatus text,
              linii int, suma numeric, gata boolean, motiv text, trimis boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY'),
         w.name, v.plate, m.name,
         COALESCE(l.n, 0)::int,
         COALESCE(l.suma, 0)::numeric,
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
      SELECT count(*)::int AS n, SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid
        FROM piese_1c_spisanie_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'ISSUE' AND d.status = 'CONFIRMED'
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

CREATE OR REPLACE FUNCTION piese_1c_mutari(p_limita int DEFAULT 100)
RETURNS TABLE(id bigint, data text, din text, spre text,
              linii int, suma numeric, gata boolean, motiv text, trimis boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY'),
         ws.name, wd.name,
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
      SELECT count(*)::int AS n, SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid
        FROM piese_1c_mutare_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'TRANSFER' AND d.status = 'CONFIRMED'
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

CREATE OR REPLACE FUNCTION piese_1c_recepcii(p_limita int DEFAULT 100)
RETURNS TABLE(id bigint, data text, furnizor text, factura text, depozit text,
              linii int, suma numeric, gata boolean, motiv text, trimis boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(COALESCE(d.invoice_date, (d.created_at AT TIME ZONE 'Europe/Chisinau')::date), 'DD.MM.YYYY'),
         f.name,
         btrim(COALESCE(d.invoice_series, '') || ' ' || COALESCE(d.invoice_number, '')),
         w.name,
         COALESCE(l.n, 0)::int,
         COALESCE(l.suma, 0)::numeric,
         (COALESCE(l.n, 0) > 0
          AND w.guid_1c IS NOT NULL AND w.cont_1c IS NOT NULL
          AND f.id IS NOT NULL AND f.idno ~ '^[0-9]{13}$'
          AND NULLIF(btrim(COALESCE(d.invoice_number, '')), '') IS NOT NULL
          AND COALESCE(l.fara_guid, 0) = 0
          AND COALESCE(l.cota_alta, 0) = 0),
         CASE
           WHEN COALESCE(l.n, 0) = 0 THEN 'nimic de trimis — net zero'
           WHEN f.id IS NULL THEN 'documentul nu are furnizor'
           WHEN f.idno IS NULL OR btrim(f.idno) = '' THEN 'furnizorul „' || f.name || '" nu are cod fiscal'
           WHEN f.idno !~ '^[0-9]{13}$' THEN 'codul fiscal al „' || f.name || '" nu are 13 cifre (' || f.idno || ')'
           WHEN NULLIF(btrim(COALESCE(d.invoice_number, '')), '') IS NULL THEN 'lipsește numărul facturii fiscale'
           WHEN w.guid_1c IS NULL THEN 'depozitul „' || w.name || '" nu e legat de 1C'
           WHEN w.cont_1c IS NULL THEN 'depozitul „' || w.name || '" nu are cont contabil 1C'
           WHEN COALESCE(l.fara_guid, 0) > 0 THEN l.fara_guid || ' piese nu sunt legate de 1C'
           WHEN COALESCE(l.cota_alta, 0) > 0 THEN l.cota_alta || ' piese au altă cotă TVA decât 20% — cere identificatorul cotei'
           ELSE NULL
         END,
         d.guid_1c IS NOT NULL
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    LEFT JOIN piese_suppliers f ON f.id = d.supplier_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n, SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid,
             count(*) FILTER (WHERE round(x.cota) <> 20)::int AS cota_alta
        FROM piese_1c_recepcie_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'RECEIPT' AND d.status = 'CONFIRMED'
   ORDER BY COALESCE(d.invoice_date, (d.created_at AT TIME ZONE 'Europe/Chisinau')::date) DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

REVOKE ALL ON FUNCTION piese_1c_eliberari(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_1c_mutari(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_1c_recepcii(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_eliberari(int) TO service_role;
GRANT EXECUTE ON FUNCTION piese_1c_mutari(int) TO service_role;
GRANT EXECUTE ON FUNCTION piese_1c_recepcii(int) TO service_role;
