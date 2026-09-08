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

-- ── Adaos pe TOATĂ factura, DOAR la magazin ──────────────────────────────────
-- Adaosul trăiește pe PIESĂ (migr. 318), iar prețul de raft se recalculează singur din el. Aici se aplică
-- pieselor unei recepții dintr-un singur pas: la o factură de 30 de poziții se punea de 30 de ori.
--
-- `w.kind = 'SHOP'` E OBLIGATORIU. Fără el, o recepție într-un depozit INTERN rescria `markup_pct`, care
-- e o coloană GLOBALĂ — deci un depozitar din Bălți, completând firesc câmpul „Adaos" pentru eticheta lui
-- (unde adaosul nici măcar nu se afișează), rescria tăcut prețurile de vânzare ale magazinului. Funcția
-- soră `piese_receipt_mark_for_sale` avea deja condiția; absența ei aici a fost o scăpare, nu o decizie.
--
-- `status = 'CONFIRMED'`: după o corecție, documentul vechi rămâne CANCELLED — adaosul n-are ce căuta
-- pe un document care nu mai e valabil.
--
-- Autorul se scrie ca `admin_id` + `actor_label`, nu ca `user_id`: conturile administrative sunt UUID,
-- iar coloana veche e BIGINT (utilizatori Telegram). Migr. 291 a introdus perechea asta tocmai fiindcă
-- modificările fără autor s-au dovedit inutile la investigație — iar asta e o schimbare de PREȚURI.
CREATE OR REPLACE FUNCTION piese_receipt_set_markup(
  p_doc bigint, p_wh bigint, p_markup real, p_admin uuid, p_actor text
) RETURNS integer LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL THEN RAISE EXCEPTION 'DOC_MISMATCH'; END IF;
  IF p_markup IS NOT NULL AND (p_markup < 0 OR p_markup > 1000) THEN RAISE EXCEPTION 'BAD_MARKUP'; END IF;
  PERFORM 1 FROM piese_stock_documents d JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'RECEIPT' AND d.status = 'CONFIRMED'
     AND d.warehouse_id = p_wh AND w.kind = 'SHOP';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_SHOP'; END IF;

  UPDATE piese_parts p SET markup_pct = p_markup
   WHERE p.id IN (SELECT l.part_id FROM piese_stock_document_lines l
                   WHERE l.document_id = p_doc AND l.reverses_line_id IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO piese_audit_log(admin_id, actor_label, action, entity, entity_id, detail)
    VALUES(p_admin, p_actor, 'MARKUP', 'receipt', p_doc,
           'Adaos ' || COALESCE(p_markup::text || '%', 'ca la grupă') || ' pe ' || v_n || ' piese');
  RETURN v_n;
END $$;

DROP FUNCTION IF EXISTS piese_receipt_set_markup(bigint, bigint, real, bigint);
REVOKE ALL ON FUNCTION piese_receipt_set_markup(bigint, bigint, real, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_set_markup(bigint, bigint, real, uuid, text) TO service_role;

-- ── „De vânzare" automat la recepția în magazin ───────────────────────────────
-- Marfa care intră în magazin e prin definiție marfă de vânzare. Bifa manuală per piesă se uita, iar
-- fără ea eticheta cu preț nu se tipărea deloc — omul afla asta abia în fața imprimantei.
--
-- Ridică un flag GLOBAL pe piesă, deci PUBLICĂ marfa în magazin: de aceea lasă urmă. Fără jurnal, nimeni
-- n-ar fi putut spune cine a scos la vânzare o piesă ținută pentru uz intern.
CREATE OR REPLACE FUNCTION piese_receipt_mark_for_sale(
  p_doc bigint, p_wh bigint, p_admin uuid, p_actor text
) RETURNS integer LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF p_doc IS NULL OR p_wh IS NULL THEN RETURN 0; END IF;
  PERFORM 1 FROM piese_stock_documents d JOIN piese_warehouses w ON w.id = d.warehouse_id
   WHERE d.id = p_doc AND d.doc_type = 'RECEIPT' AND d.status = 'CONFIRMED'
     AND d.warehouse_id = p_wh AND w.kind = 'SHOP';
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE piese_parts p SET is_for_sale = true
   WHERE p.is_for_sale = false
     AND p.id IN (SELECT l.part_id FROM piese_stock_document_lines l
                   WHERE l.document_id = p_doc AND l.reverses_line_id IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    INSERT INTO piese_audit_log(admin_id, actor_label, action, entity, entity_id, detail)
      VALUES(p_admin, p_actor, 'FOR_SALE', 'receipt', p_doc,
             v_n || ' piese marcate „de vânzare" la recepția în magazin');
  END IF;
  RETURN v_n;
END $$;

DROP FUNCTION IF EXISTS piese_receipt_mark_for_sale(bigint, bigint);
REVOKE ALL ON FUNCTION piese_receipt_mark_for_sale(bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_receipt_mark_for_sale(bigint, bigint, uuid, text) TO service_role;
