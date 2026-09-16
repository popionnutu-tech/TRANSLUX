-- 360: Ce mai lipsea ca să putem compune documentul 1C `VS_СписаниеЗапчастей`.
--
-- (1) Mașina are nevoie de DOUĂ GUID-uri, nu de unul. În documentul-model apare o dată ca
--     `ТранспортноеСредство` (ОсновныеСредства) și o dată ca `ВидыДеятельности` — alt catalog, alt GUID,
--     aceeași mașină. Confirmat de contabilă (16.09): «вид деятельности — se pune numarul masinii», iar
--     în fișier valoarea chiar e „458 BRAX".
ALTER TABLE piese_vehicles ADD COLUMN IF NOT EXISTS guid_1c_activitate uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pveh_guid1c_act
  ON piese_vehicles(guid_1c_activitate) WHERE guid_1c_activitate IS NOT NULL;

-- (2) Documentul însuși are nevoie de un GUID STABIL. Regulile 1C sincronizează după identificator: cu
--     același GUID, o reexportare ACTUALIZEAZĂ documentul; cu unul nou, îl dublează.
ALTER TABLE piese_stock_documents ADD COLUMN IF NOT EXISTS guid_1c uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pdoc_guid1c
  ON piese_stock_documents(guid_1c) WHERE guid_1c IS NOT NULL;

CREATE OR REPLACE FUNCTION piese_1c_doc_guid(p_doc bigint)
RETURNS uuid LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE g uuid;
BEGIN
  SELECT guid_1c INTO g FROM piese_stock_documents WHERE id = p_doc FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_DOC'; END IF;
  IF g IS NOT NULL THEN RETURN g; END IF;
  g := gen_random_uuid();
  UPDATE piese_stock_documents SET guid_1c = g WHERE id = p_doc;
  RETURN g;
END $$;

-- (3) Conținutul de exportat al unei eliberări, ca NET pe piesă.
--
-- Un document de eliberare poate conține stornări: returul de la lăcătuș intră ca linie NEGATIVĂ pe
-- ACELAȘI document (migr. 299). Azi 3 documente din 258 au astfel de linii, iar toate trei se anulează
-- complet (+1 și −1 pe aceeași piesă). Exportate ca atare, ar fi produs în contabilitate documente cu
-- rânduri negative sau cu zero — adică un consum care nu a existat. Se exportă doar ce a rămas consumat;
-- un document integral anulat nu produce niciun rând, deci nici fișier.
CREATE OR REPLACE FUNCTION piese_1c_spisanie_linii(p_doc bigint)
RETURNS TABLE(part_id bigint, part_name text, qty numeric, suma numeric, guid_1c uuid)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT l.part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         SUM(l.qty)::numeric,
         ROUND(SUM(l.qty * l.unit_cost)::numeric, 2),
         p.guid_1c
    FROM piese_stock_document_lines l
    JOIN piese_parts p ON p.id = l.part_id
   WHERE l.document_id = p_doc
   GROUP BY l.part_id, 2, p.guid_1c
  HAVING SUM(l.qty) > 0.0000001
   ORDER BY l.part_id;
$$;

REVOKE ALL ON FUNCTION piese_1c_doc_guid(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION piese_1c_spisanie_linii(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_1c_doc_guid(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION piese_1c_spisanie_linii(bigint) TO service_role;
