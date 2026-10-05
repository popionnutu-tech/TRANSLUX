-- 375: Forma finală a cecului — cu prețul corect și cu depozitul.
--
-- Depozitul vine odată cu cecul, ca garda de acces să nu ceară încă o citire: un vânzător legat de un
-- depozit n-are de ce să vadă cecurile altuia, iar un drum în plus la bază cade exact în clipa în care
-- clientul așteaptă bonul la tejghea.
CREATE OR REPLACE FUNCTION piese_cec(p_doc bigint)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'doc_id',       d.id,
    'warehouse_id', d.warehouse_id,
    'serie',        COALESCE(d.invoice_series, ''),
    'numar',        COALESCE(d.invoice_number, ''),
    -- Ora locală, nu UTC: un cec emis după ora 21 ar fi purtat ziua următoare pe hârtie.
    'data',         to_char(d.created_at AT TIME ZONE 'Europe/Chisinau', 'DD.MM.YYYY HH24:MI'),
    'client',       COALESCE(cl.name, ''),
    'depozit',      COALESCE(w.name, ''),
    'linii',        COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
                'nume', COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
                'articol', COALESCE(p.article_code, ''),
                'um', COALESCE(p.unit, 'buc'),
                'cant', abs(l.qty),
                -- `unit_price`, NU `unit_cost`: pe linia de vânzare costul FIFO și prețul stau în coloane
                -- diferite, iar pe cec clientul trebuie să vadă prețul, nu cât ne-a costat pe noi.
                'pret', round(COALESCE(l.unit_price, 0)::numeric, 2),
                'suma', round((abs(l.qty) * COALESCE(l.unit_price, 0))::numeric, 2))
              ORDER BY l.id)
         FROM piese_stock_document_lines l
         JOIN piese_parts p ON p.id = l.part_id
        WHERE l.document_id = d.id), '[]'::jsonb),
    'total',        COALESCE((SELECT round(SUM(abs(l.qty) * COALESCE(l.unit_price, 0))::numeric, 2)
                                FROM piese_stock_document_lines l WHERE l.document_id = d.id), 0))
    FROM piese_stock_documents d
    LEFT JOIN piese_clients cl ON cl.id = d.client_id
    LEFT JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'SALE';
$$;
REVOKE ALL ON FUNCTION piese_cec(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_cec(bigint) TO service_role;
