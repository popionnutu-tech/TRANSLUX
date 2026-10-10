-- 409: Recepțiile spre 1C — documentul «ПрихНалоговаяНакладная».
--
-- Înțelesul cifrelor nu e dedus, e verificat: documentul-model al contabilului s-a dovedit a fi EXACT
-- aceeași tranzacție pe care o avem și noi (documentul nostru 505) — Caraus E.D., 10 bucăți de «Резинка
-- лобового стекла». La el: СумЛей 3600, НДС 600, Ставка20, СуммаРозн 4500. La noi: 10 × 360 = 3600,
-- tva_cota 20, 10 × 450 = 4500. Trei lucruri se lămuresc din potrivirea asta:
--   • prețul introdus de Eduard e CU TVA (3600 la cotă 20 dă 600, adică 3600/6, nu 720);
--   • `СумЛей` e suma brută, iar `НДС` taxa dinăuntrul ei;
--   • prețul nostru de vânzare e chiar `СуммаРозн` al lui — cele două 4500 coincid la bănuț.
--
-- Furnizorul se sincronizează după COD FISCAL plus denumire, nu după GUID ca restul — așa e în documentul
-- lui. De aceea codul fiscal e o condiție de export, la fel de tare ca un GUID lipsă.
CREATE OR REPLACE FUNCTION piese_1c_recepcie_linii(p_doc bigint)
RETURNS TABLE(part_id bigint, part_name text, qty numeric, suma numeric,
              cota numeric, roznita numeric, guid_1c uuid)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         SUM(l.qty)::numeric,
         ROUND(SUM(l.qty * COALESCE(l.unit_cost, 0))::numeric, 2),
         p.tva_cota,
         -- Prețul de vânzare vine din UNICA sursă (migr. 391), ca să nu existe două prețuri pentru
         -- aceeași piesă: unul pe etichetă și altul în contabilitate.
         ROUND((SUM(l.qty) * COALESCE(sp.sale_price, 0))::numeric, 2),
         p.guid_1c
    FROM piese_stock_document_lines l
    JOIN piese_parts p ON p.id = l.part_id
    LEFT JOIN piese_part_sale_price sp ON sp.part_id = l.part_id
   WHERE l.document_id = p_doc
   GROUP BY l.part_id, 2, p.tva_cota, sp.sale_price, p.guid_1c
  HAVING SUM(l.qty) > 0.0000001
   ORDER BY l.part_id;
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
           -- Codul fiscal e cheia după care 1C recunoaște furnizorul. Lipsa lui nu dă eroare la import —
           -- i-ar crea contabilului un contragent NOU, dublat. De aceea refuzăm înainte.
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
      SELECT count(*)::int AS n,
             SUM(x.suma)::numeric AS suma,
             count(*) FILTER (WHERE x.guid_1c IS NULL)::int AS fara_guid,
             count(*) FILTER (WHERE round(x.cota) <> 20)::int AS cota_alta
        FROM piese_1c_recepcie_linii(d.id) x
    ) l ON true
   WHERE d.doc_type = 'RECEIPT'
   ORDER BY COALESCE(d.invoice_date, (d.created_at AT TIME ZONE 'Europe/Chisinau')::date) DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;

REVOKE ALL ON FUNCTION piese_1c_recepcie_linii(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_1c_recepcii(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_recepcie_linii(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_1c_recepcii(int) TO service_role;

-- Piesa din documentul-model are acum identificatorul ei din 1C, luat direct din fișierul contabilului:
-- «Резинка лобового стекла-315518.5439UWS» = 817437b5-97c3-11f0-8160-2cfda1bbfecf. Diferă de numele
-- nostru doar prin bara oblică — de reținut pentru legarea în masă a celorlalte: potrivirea trebuie să
-- ignore semnele de punctuație.
UPDATE piese_parts SET guid_1c = '817437b5-97c3-11f0-8160-2cfda1bbfecf'
 WHERE id = 17154 AND guid_1c IS NULL
   AND name_long = 'Резинка лобового стекла-315/518.5439UWS';
