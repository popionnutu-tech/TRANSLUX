-- 380: Modul de plată și restul, la vânzare.
--
-- Magazinul trece integral pe programul nostru (Mariana, 06.10). Până acum ecranul de vânzare nu știa
-- NIMIC despre bani: nici cu ce s-a plătit, nici cât s-a dat, nici ce rest s-a întors. A mers fiindcă
-- prin modul nu s-a vândut niciodată nimic; de mâine e casa magazinului.
--
-- De ce contează dincolo de comoditate: casa de marcat cere modul de plată la închiderea bonului
-- (numerar / card sunt totaluri SEPARATE pe raportul Z). Fără el, raportul nostru de zi n-ar avea cum fi
-- pus alături de banda fiscală — iar nepotrivirea dintre ele e exact ce caută un control.
--
-- `incasat` se păstrează chiar dacă pare redundant: restul se poate recalcula din el, dar nu invers.
-- Dacă mâine casierul spune „am dat rest greșit", singura dovadă e cât a primit efectiv.
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS plata text;
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS incasat numeric;

ALTER TABLE piese_stock_documents DROP CONSTRAINT IF EXISTS piese_doc_plata_ok;
ALTER TABLE piese_stock_documents ADD CONSTRAINT piese_doc_plata_ok
  CHECK (plata IS NULL OR plata IN ('NUMERAR', 'CARD', 'TRANSFER'));

-- Raportul de zi al magazinului, pe moduri de plată — perechea raportului Z de pe aparat.
-- Ziua se taie după ora Chișinăului: o vânzare de la 21:30 aparține zilei în care s-a făcut, nu celei
-- următoare, cum ar ieși dacă am socoti în UTC.
CREATE OR REPLACE FUNCTION piese_raport_zi(p_wh bigint, p_zi date DEFAULT NULL)
RETURNS TABLE(plata text, bonuri int, suma numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(d.plata, 'NEPRECIZAT'),
         count(*)::int,
         COALESCE(SUM((SELECT SUM(abs(l.qty) * COALESCE(l.unit_price, 0))
                         FROM piese_stock_document_lines l WHERE l.document_id = d.id)), 0)::numeric
    FROM piese_stock_documents d
   WHERE d.doc_type = 'SALE' AND d.warehouse_id = p_wh
     AND (d.created_at AT TIME ZONE 'Europe/Chisinau')::date
         = COALESCE(p_zi, (now() AT TIME ZONE 'Europe/Chisinau')::date)
   GROUP BY 1 ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION piese_raport_zi(bigint, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_raport_zi(bigint, date) TO service_role;
