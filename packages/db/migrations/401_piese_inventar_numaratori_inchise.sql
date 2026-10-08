-- 401: Vizualizarea unei numărători ÎNCHISE — ce s-a numărat, în ce celulă, și cât avea programul.
--
-- Cerut de Eduard (08.10): «Должна быть возможность просмотра этой инвентаризации и просмотра позиций».
-- Până acum, odată apăsat „Închide numărătoarea", ea dispărea din ecran. Rămânea doar documentul de
-- corecție, în lista de documente — fără celule, fără „ce s-a numărat unde", fără cine a numărat.
--
-- Partea neevidentă: cantitatea pe care o avea PROGRAMUL înainte de închidere nu se poate citi nicăieri.
-- Stocul de azi include deja corecția, plus tot ce s-a mișcat după. Dar se poate RECONSTRUI: liniile
-- documentului de corecție țin delta cu semn, deci „în program" = numărat − delta. De aceea `piese_inv_detalii`
-- face LEFT JOIN pe liniile documentului, nu pe stocul curent.
--
-- `diferente` din listă numără liniile documentului, nu pozițiile sesiunii: o numărătoare care a confirmat
-- tot ce era în program are poziții dar zero linii de document — și asta e informația utilă, nu un zero
-- care pare o eroare.
CREATE OR REPLACE FUNCTION piese_inv_istoric(p_wh bigint DEFAULT NULL, p_limit int DEFAULT 30)
RETURNS TABLE(session_id bigint, warehouse_id bigint, depozit text, status text, actor text,
              deschisa timestamptz, inchisa timestamptz, document_id bigint,
              pozitii int, diferente int, celule int)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT s.id, s.warehouse_id, w.name, s.status, s.actor_label,
         s.created_at, s.committed_at, s.document_id,
         (SELECT count(*)::int FROM piese_inventory_session_lines l WHERE l.session_id = s.id),
         COALESCE((SELECT count(*)::int FROM piese_stock_document_lines dl WHERE dl.document_id = s.document_id), 0),
         (SELECT count(DISTINCT l.location_label)::int FROM piese_inventory_session_lines l WHERE l.session_id = s.id)
    FROM piese_inventory_sessions s
    LEFT JOIN piese_warehouses w ON w.id = s.warehouse_id
   WHERE s.status <> 'OPEN' AND (p_wh IS NULL OR s.warehouse_id = p_wh)
   ORDER BY s.id DESC LIMIT GREATEST(1, LEAST(p_limit, 200));
$fn$;

CREATE OR REPLACE FUNCTION piese_inv_detalii(p_session bigint)
RETURNS TABLE(part_id bigint, nume text, articol text, unit text, adresa text,
              numarat numeric, delta numeric, in_program numeric)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $fn$
  SELECT l.part_id,
         COALESCE(NULLIF(btrim(p.name_ro), ''), p.name_long),
         COALESCE(p.article_code, ''), COALESCE(p.unit, 'buc'),
         l.location_label, l.counted_qty,
         COALESCE(dl.qty, 0),
         l.counted_qty - COALESCE(dl.qty, 0)
    FROM piese_inventory_session_lines l
    JOIN piese_parts p ON p.id = l.part_id
    LEFT JOIN piese_inventory_sessions s ON s.id = l.session_id
    LEFT JOIN piese_stock_document_lines dl ON dl.document_id = s.document_id AND dl.part_id = l.part_id
   WHERE l.session_id = p_session
   ORDER BY l.location_label, p.name_long;
$fn$;

REVOKE ALL ON FUNCTION piese_inv_istoric(bigint,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_istoric(bigint,int) TO service_role;
REVOKE ALL ON FUNCTION piese_inv_detalii(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_inv_detalii(bigint) TO service_role;
