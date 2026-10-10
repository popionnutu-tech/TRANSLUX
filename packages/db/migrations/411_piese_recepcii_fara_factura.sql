-- 411: Lista roșie — recepțiile cărora le lipsește factura fiscală. Plus o scăpare din migr. 409.
--
-- Factura fiscală nu vine odată cu marfa: Eduard a spus-o limpede (08.10) — intră piesele azi, hârtia
-- vine peste o zi sau peste o săptămână. Deci nu putem face câmpul obligatoriu la recepție; am bloca
-- intrarea mărfii pentru o hârtie care încă nu există.
--
-- Rămâne cealaltă cale: să nu se uite. Azi 22 din 38 de recepții confirmate n-au numărul facturii, iar
-- cea mai veche e din 20 iulie. Fără număr, documentul NU poate pleca în contabilitate.
--
-- Două trepte, fiindcă gravitatea diferă:
--   • ROȘU, lipsește numărul — documentul nu se poate trimite deloc;
--   • GALBEN, e numărul dar nu e data — se trimite, însă cu ziua intrării în depozit în loc de data
--     facturii. Dacă cele două cad în luni diferite (factura din 30.09, marfa pe 02.10), cheltuiala
--     intră la contabil în luna greșită.
CREATE OR REPLACE FUNCTION piese_recepcii_fara_factura(p_warehouse bigint DEFAULT NULL)
RETURNS TABLE(id bigint, data text, zile int, furnizor text, depozit text,
              serie text, numar text, are_data boolean, pozitii int, suma numeric, creator text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT d.id,
         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY'),
         (CURRENT_DATE - (d.created_at AT TIME ZONE 'Europe/Chisinau')::date)::int,
         f.name,
         w.name,
         NULLIF(btrim(COALESCE(d.invoice_series, '')), ''),
         NULLIF(btrim(COALESCE(d.invoice_number, '')), ''),
         d.invoice_date IS NOT NULL,
         l.n::int,
         l.suma::numeric,
         a.name
    FROM piese_stock_documents d
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    LEFT JOIN piese_suppliers f ON f.id = d.supplier_id
    LEFT JOIN admin_accounts a ON a.id = d.created_by_admin
    JOIN LATERAL (
      SELECT count(*) AS n, COALESCE(SUM(x.qty * COALESCE(x.unit_cost, 0)), 0) AS suma
        FROM piese_stock_document_lines x WHERE x.document_id = d.id
    ) l ON true
   WHERE d.doc_type = 'RECEIPT'
     AND d.status = 'CONFIRMED'
     -- „Sold inițial" nu e recepție de la furnizor, e stocul de pornire încărcat din Inventar: n-are
     -- factură fiscală și n-are de unde avea. Aceeași excludere ca în jurnalul de prihod.
     AND COALESCE(d.invoice_series, '') <> 'SOLD'
     AND (p_warehouse IS NULL OR d.warehouse_id = p_warehouse)
     AND (NULLIF(btrim(COALESCE(d.invoice_number, '')), '') IS NULL OR d.invoice_date IS NULL)
   -- Cele mai vechi primele: o factură de acum trei luni se găsește mai greu decât una de ieri, deci e
   -- cea care trebuie căutată întâi.
   ORDER BY d.created_at ASC, d.id ASC;
$$;

REVOKE ALL ON FUNCTION piese_recepcii_fara_factura(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_recepcii_fara_factura(bigint) TO service_role;

-- Și scăparea din migr. 409: exportul de recepții spre 1C nu excludea nici el soldul inițial. Azi n-are
-- ce strica — nu există încă niciun document SOLD — dar importul celor 3 314 poziții din IntelectSoft e
-- următorul pe listă, și ar fi apărut acolo ca o „recepție" uriașă fără furnizor și fără factură. Soldul
-- inițial se potrivește în contabilitate o singură dată, la pornire, nu ca document de recepție.
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
     AND COALESCE(d.invoice_series, '') <> 'SOLD'
   ORDER BY COALESCE(d.invoice_date, (d.created_at AT TIME ZONE 'Europe/Chisinau')::date) DESC, d.id DESC
   LIMIT GREATEST(p_limita, 1);
$$;
REVOKE ALL ON FUNCTION piese_1c_recepcii(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_recepcii(int) TO service_role;
