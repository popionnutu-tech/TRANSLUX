-- 373: Conținutul cecului unei vânzări.
--
-- Eduard (05.10.2026): «сделать возможность распечатывать чек с наименованием товара и ценой».
-- Azi, după vânzare, apare doar un mesaj verde „Чек #N emis" — nimic de dat clientului în mână.
--
-- Antetul și liniile într-un singur apel: cecul se tipărește imediat după vânzare, iar două drumuri la
-- bază ar fi însemnat o pauză exact în clipa în care clientul așteaptă la tejghea.
--
-- ATENȚIE: forma de AICI ia `unit_cost` — greșit. Corectat în migr. 374; forma finală e în 375.
CREATE OR REPLACE FUNCTION piese_cec(p_doc bigint)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'doc_id', d.id, 'serie', COALESCE(d.invoice_series, ''), 'numar', COALESCE(d.invoice_number, ''),
    'data', to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY HH24:MI'),
    'client', COALESCE(cl.name, ''), 'depozit', COALESCE(w.name, ''),
    'linii', COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
                'nume', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
                'articol', COALESCE(p.article_code, ''), 'um', COALESCE(p.unit, 'buc'),
                'cant', abs(l.qty), 'pret', round(l.unit_cost::numeric, 2),
                'suma', round((abs(l.qty) * l.unit_cost)::numeric, 2)) ORDER BY l.id)
         FROM piese_stock_document_lines l JOIN piese_parts p ON p.id = l.part_id
        WHERE l.document_id = d.id), '[]'::jsonb),
    'total', COALESCE((SELECT round(SUM(abs(l.qty) * l.unit_cost)::numeric, 2)
                         FROM piese_stock_document_lines l WHERE l.document_id = d.id), 0))
    FROM piese_stock_documents d
    LEFT JOIN piese_clients cl ON cl.id = d.client_id
    LEFT JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'SALE';
$$;
REVOKE ALL ON FUNCTION piese_cec(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_cec(bigint) TO service_role;
