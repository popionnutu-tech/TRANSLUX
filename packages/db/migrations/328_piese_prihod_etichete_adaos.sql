-- 328: Etichete pentru orice depozit, adaos pe toată factura, „de vânzare" automat la magazin.
--
-- Feedback-ul lui Eduard din 08.09, pe ecranul Prihod:
--   „ДУМАЮ ГАЛОЧКА DEVINZARE ДОЛЖНА СТОЯТЬ АВТОМАТИЧЕСКИ ДЛЯ ПРИХОДА НА МАГАЗИН · процент наценки на
--    всю накладную · Чтобы была возможность распечатывать ценники с ценой для прихода. Для других
--    депозитов тоже должна быть возможность распечатать ценник из прихода без цены. На ценнике должна
--    также быть дата прихода. Цифры штрихкода на ценнике их нету, только штрихкод."

-- ── Etichete pentru ORICE depozit, nu doar pentru magazin ─────────────────────
-- Migr. 318 întorcea doar piesele `is_for_sale`, presupunând că eticheta e mereu una de preț. Greșit:
-- la un depozit intern eticheta e de RAFT — spune ce e piesa și unde stă, fără preț. Filtrul pe
-- `is_for_sale` făcea ca la Bălți sau Briceni foaia să iasă goală.
--
-- Prețul apare doar când recepția e în MAGAZIN. `is_shop` iese explicit, ca ecranul să nu ghicească din
-- absența prețului: o piesă de magazin fără recepții cu cost are tot preț NULL, dar acolo lipsa e o
-- problemă de date, nu natura etichetei.
--
-- `received_at` — data recepției, cerută explicit: pe raft se vede cât de veche e marfa.
DROP FUNCTION IF EXISTS piese_receipt_labels(bigint, bigint);

CREATE OR REPLACE FUNCTION piese_receipt_labels(p_doc bigint, p_wh bigint)
RETURNS TABLE(part_id bigint, name text, manufacturer text, article_code text,
              barcode text, unit text, qty numeric, price numeric, markup_pct real,
              received_at timestamptz, is_shop boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long) AS name,
         COALESCE(p.manufacturer, '') AS manufacturer,
         COALESCE(p.article_code, '') AS article_code,
         COALESCE(NULLIF(btrim(p.barcode), ''), COALESCE(p.article_code, '')) AS barcode,
         COALESCE(p.unit, 'buc') AS unit,
         sum(l.qty)::numeric AS qty,
         CASE WHEN w.kind = 'SHOP' THEN max(sp.price) ELSE NULL END AS price,
         CASE WHEN w.kind = 'SHOP' THEN max(sp.markup_pct) ELSE NULL END AS markup_pct,
         d.created_at AS received_at,
         (w.kind = 'SHOP') AS is_shop
    FROM piese_stock_document_lines l
    JOIN piese_stock_documents d ON d.id = l.document_id
    JOIN piese_warehouses w ON w.id = d.warehouse_id
    JOIN piese_parts p ON p.id = l.part_id
    LEFT JOIN piese_sale_parts sp ON sp.id = p.id
   WHERE l.document_id = p_doc
     AND d.doc_type = 'RECEIPT' AND d.status = 'CONFIRMED'
     AND p_wh IS NOT NULL AND d.warehouse_id = p_wh
     AND p.active
     AND l.reverses_line_id IS NULL
   GROUP BY p.id, d.created_at, w.kind
   ORDER BY name;
$$;

REVOKE ALL ON FUNCTION piese_receipt_labels(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_labels(bigint, bigint) TO service_role;

-- ── Adaos pe TOATĂ factura ────────────────────────────────────────────────────
-- Adaosul trăiește pe PIESĂ (migr. 318), iar prețul de raft se recalculează singur din el. Aici se aplică
-- pieselor de pe o recepție dintr-un singur pas: la o factură de 30 de poziții se punea de 30 de ori.
CREATE OR REPLACE FUNCTION piese_receipt_set_markup(p_doc bigint, p_wh bigint, p_markup real, p_user bigint)
RETURNS integer LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  IF p_markup IS NOT NULL AND (p_markup < 0 OR p_markup > 1000) THEN RAISE EXCEPTION 'BAD_MARKUP'; END IF;
  -- Documentul decide depozitul, ca peste tot în modul: `p_wh` e depozitul pentru care apelantul a trecut
  -- de gardă, iar dacă documentul nu e al lui, operațiunea nu are ce căuta acolo.
  PERFORM 1 FROM piese_stock_documents
   WHERE id = p_doc AND doc_type = 'RECEIPT' AND warehouse_id = p_wh;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;

  UPDATE piese_parts p SET markup_pct = p_markup
   WHERE p.id IN (SELECT l.part_id FROM piese_stock_document_lines l
                   WHERE l.document_id = p_doc AND l.reverses_line_id IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO piese_audit_log(user_id, action, entity, entity_id, detail)
    VALUES(p_user, 'MARKUP', 'receipt', p_doc,
           'Adaos ' || COALESCE(p_markup::text, 'grupă') || '% pe ' || v_n || ' piese');
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION piese_receipt_set_markup(bigint, bigint, real, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_set_markup(bigint, bigint, real, bigint) TO service_role;

-- ── „De vânzare" automat la recepția în magazin ───────────────────────────────
-- Marfa care intră în magazin e prin definiție marfă de vânzare. Bifa manuală per piesă se uita, iar
-- fără ea eticheta cu preț nu se tipărea deloc — omul descoperea asta abia în fața imprimantei.
--
-- Atinge DOAR recepțiile în magazin și DOAR piesele nebifate; pentru orice alt depozit iese cu 0, fără
-- să modifice nimic. Nu e o condiție a recepției, ci o comoditate: dacă eșuează, marfa e deja în stoc.
CREATE OR REPLACE FUNCTION piese_receipt_mark_for_sale(p_doc bigint, p_wh bigint)
RETURNS integer LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL THEN RETURN 0; END IF;
  PERFORM 1 FROM piese_stock_documents d JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'RECEIPT' AND d.warehouse_id = p_wh AND w.kind = 'SHOP';
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE piese_parts p SET is_for_sale = true
   WHERE p.is_for_sale = false
     AND p.id IN (SELECT l.part_id FROM piese_stock_document_lines l
                   WHERE l.document_id = p_doc AND l.reverses_line_id IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION piese_receipt_mark_for_sale(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_mark_for_sale(bigint, bigint) TO service_role;
