-- 066_route_display_name.sql
-- Pentru rutele suburban: afișează "Centru - Sat final" (folosind dest_to_ro
-- ca centru și dest_from_ro ca sat final), nu doar "Briceni" pentru toate.
-- Dacă suburban are >6 opriri (eventual în viitor), include și un sat
-- intermediar major: "Centru - Sat intermediar - Sat final".
-- Pentru interurban, păstrăm dest_to_ro (deja are formă "Chișinău - Endpoint").

CREATE OR REPLACE FUNCTION public.get_grafic_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_routes         jsonb;
  v_orphan_num     jsonb;
  v_orphan_inc     jsonb;
  v_confirmation   jsonb;
BEGIN
  WITH
  foaie_last_owner AS (
    SELECT DISTINCT ON (receipt_nr) receipt_nr, driver_id
    FROM driver_cashin_receipts
    ORDER BY receipt_nr, ziua DESC
  ),
  explicit_attributions AS (
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           dcr.receipt_nr AS foaie_nr, 'explicit'::text AS source
    FROM daily_assignments da
    JOIN driver_cashin_receipts dcr
      ON dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date
  ),
  implied_raw AS (
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           t.sofer_id AS foaie_nr
    FROM daily_assignments da
    JOIN tomberon.transactions t ON t.ziua = da.assignment_date
    JOIN foaie_last_owner flo ON flo.receipt_nr = t.sofer_id AND flo.driver_id = da.driver_id
    WHERE NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr
                      WHERE dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date)
    AND NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr_other
                    WHERE dcr_other.receipt_nr = t.sofer_id AND dcr_other.ziua = da.assignment_date)
  ),
  implied_attributions AS (
    SELECT DISTINCT ON (assignment_id)
      assignment_id, driver_id, ziua, foaie_nr, 'implied'::text AS source
    FROM implied_raw
    ORDER BY assignment_id, foaie_nr
  ),
  effective_attributions AS (
    SELECT * FROM explicit_attributions
    UNION ALL
    SELECT * FROM implied_attributions
  ),
  -- Stops aggregated per route (pentru afișare nume + găsire sat intermediar)
  route_stops AS (
    SELECT
      crm_route_id,
      COUNT(*) AS stop_count,
      (array_agg(name_ro ORDER BY id))[GREATEST(2, COUNT(*)::int / 2)] AS middle_stop
    FROM crm_stop_fares
    GROUP BY crm_route_id
  ),
  tomberon_per_foaie AS (
    SELECT t.sofer_id AS foaie_nr, t.ziua,
      SUM(COALESCE(t.suma_numerar,0))::numeric          AS incasare_numerar,
      SUM(COALESCE(t.diagrama_suma,0))::numeric         AS incasare_diagrama,
      SUM(COALESCE(t.ligotniki0_suma,0))::numeric       AS ligotniki0_suma,
      SUM(COALESCE(t.ligotniki_vokzal_suma,0))::numeric AS ligotniki_vokzal_suma,
      SUM(COALESCE(t.dt_suma,0))::numeric               AS dt_suma,
      SUM(COALESCE(t.dop_rashodi,0))::numeric           AS dop_rashodi,
      COUNT(*)::int                                       AS plati,
      string_agg(DISTINCT NULLIF(t.comment,''),           ' | ') AS comment,
      string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ')  AS fiscal_nrs
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  routes_view AS (
    SELECT
      da.id AS assignment_id, da.crm_route_id, da.assignment_date AS ziua,
      CASE
        WHEN cr.route_type = 'suburban' AND COALESCE(rs.stop_count, 0) > 6 AND rs.middle_stop IS NOT NULL
          THEN cr.dest_to_ro || ' - ' || rs.middle_stop || ' - ' || cr.dest_from_ro
        WHEN cr.route_type = 'suburban'
          THEN cr.dest_to_ro || ' - ' || cr.dest_from_ro
        ELSE cr.dest_to_ro
      END AS route_name,
      cr.time_nord,
      COALESCE(cr_retur.time_chisinau, cr.time_chisinau) AS time_chisinau,
      da.driver_id, d.full_name AS driver_name,
      v.plate_number AS vehicle_plate, vr.plate_number AS vehicle_plate_retur,
      ea.foaie_nr, ea.source AS foaie_source,
      cs.id AS counting_session_id, cs.tur_total_lei, cs.retur_total_lei, cs.status AS counting_status,
      (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS numarare_lei,
      COALESCE(tpf.incasare_numerar, 0) AS incasare_numerar,
      COALESCE(tpf.incasare_diagrama, 0) AS incasare_diagrama,
      COALESCE(tpf.ligotniki0_suma, 0) AS ligotniki0_suma,
      COALESCE(tpf.ligotniki_vokzal_suma, 0) AS ligotniki_vokzal_suma,
      COALESCE(tpf.dt_suma, 0) AS dt_suma,
      COALESCE(tpf.dop_rashodi, 0) AS dop_rashodi,
      COALESCE(tpf.incasare_numerar, 0) + COALESCE(tpf.incasare_diagrama, 0) AS incasare_lei,
      tpf.comment AS incasare_comment, COALESCE(tpf.plati, 0) AS plati, tpf.fiscal_nrs,
      EXISTS (SELECT 1 FROM route_cancellations rc WHERE rc.crm_route_id = da.crm_route_id AND rc.ziua = da.assignment_date) AS cancelled
    FROM daily_assignments da
    LEFT JOIN crm_routes cr ON cr.id = da.crm_route_id
    LEFT JOIN crm_routes cr_retur ON cr_retur.id = da.retur_route_id
    LEFT JOIN drivers d ON d.id = da.driver_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    LEFT JOIN vehicles vr ON vr.id = da.vehicle_id_retur
    LEFT JOIN effective_attributions ea ON ea.assignment_id = da.id
    LEFT JOIN counting_sessions cs ON cs.crm_route_id = da.crm_route_id AND cs.assignment_date = da.assignment_date
    LEFT JOIN tomberon_per_foaie tpf ON tpf.foaie_nr = ea.foaie_nr AND tpf.ziua = da.assignment_date
    LEFT JOIN route_stops rs ON rs.crm_route_id = da.crm_route_id
    WHERE da.assignment_date BETWEEN p_from AND p_to
  ),
  routes_status AS (
    SELECT rv.*,
      ((rv.incasare_numerar + rv.incasare_diagrama) + rv.ligotniki0_suma + rv.dop_rashodi - rv.numarare_lei) AS diff,
      CASE
        WHEN rv.cancelled THEN 'cancelled'
        WHEN rv.driver_id IS NULL THEN 'no_driver'
        WHEN rv.foaie_nr IS NULL AND rv.numarare_lei = 0 AND rv.incasare_lei = 0 THEN 'empty'
        WHEN rv.foaie_nr IS NULL AND rv.numarare_lei > 0 THEN 'no_foaie'
        WHEN rv.numarare_lei = 0 AND rv.incasare_lei = 0 THEN 'no_data'
        WHEN rv.numarare_lei > 0 AND rv.incasare_lei = 0 THEN 'no_incasare'
        WHEN rv.numarare_lei = 0 AND rv.incasare_lei > 0 THEN 'no_numarare'
        WHEN rv.numarare_lei > 0 AND ABS((rv.incasare_numerar + rv.incasare_diagrama) + rv.ligotniki0_suma + rv.dop_rashodi - rv.numarare_lei) / rv.numarare_lei <= 0.05 THEN 'ok'
        WHEN ((rv.incasare_numerar + rv.incasare_diagrama) + rv.ligotniki0_suma + rv.dop_rashodi) < rv.numarare_lei THEN 'underpaid'
        ELSE 'overpaid'
      END AS status
    FROM routes_view rv
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'assignment_id', rs.assignment_id, 'crm_route_id', rs.crm_route_id, 'ziua', rs.ziua,
      'route_name', rs.route_name, 'time_nord', rs.time_nord, 'time_chisinau', rs.time_chisinau,
      'driver_id', rs.driver_id, 'driver_name', rs.driver_name,
      'vehicle_plate', rs.vehicle_plate, 'vehicle_plate_retur', rs.vehicle_plate_retur,
      'foaie_nr', rs.foaie_nr, 'foaie_source', rs.foaie_source, 'cancelled', rs.cancelled,
      'counting_session_id', rs.counting_session_id, 'counting_status', rs.counting_status,
      'tur_total_lei', rs.tur_total_lei, 'retur_total_lei', rs.retur_total_lei,
      'numarare_lei', ROUND(rs.numarare_lei, 2),
      'incasare_numerar', ROUND(rs.incasare_numerar, 2),
      'incasare_diagrama', ROUND(rs.incasare_diagrama, 2),
      'ligotniki0_suma', ROUND(rs.ligotniki0_suma, 2),
      'ligotniki_vokzal_suma', ROUND(rs.ligotniki_vokzal_suma, 2),
      'dt_suma', ROUND(rs.dt_suma, 2),
      'dop_rashodi', ROUND(rs.dop_rashodi, 2),
      'incasare_lei', ROUND(rs.incasare_lei, 2),
      'plati', rs.plati, 'comment', rs.incasare_comment, 'fiscal_nrs', rs.fiscal_nrs,
      'diff', ROUND(rs.diff, 2), 'status', rs.status
    ) ORDER BY rs.ziua DESC, rs.time_nord NULLS LAST, rs.route_name
  ), '[]'::jsonb) INTO v_routes
  FROM routes_status rs;

  WITH cs_orphans AS (
    SELECT cs.id AS session_id, cs.crm_route_id,
      cr.dest_to_ro AS route_name, cr.time_nord,
      cs.assignment_date AS ziua, cs.driver_id, d.full_name AS driver_name,
      cs.tur_total_lei, cs.retur_total_lei,
      (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS total_lei,
      cs.status AS counting_status,
      CASE
        WHEN cs.driver_id IS NULL THEN 'no_driver'
        WHEN NOT EXISTS (SELECT 1 FROM daily_assignments da
                         WHERE da.crm_route_id = cs.crm_route_id AND da.assignment_date = cs.assignment_date) THEN 'no_grafic'
        ELSE NULL
      END AS reason
    FROM counting_sessions cs
    LEFT JOIN crm_routes cr ON cr.id = cs.crm_route_id
    LEFT JOIN drivers d ON d.id = cs.driver_id
    WHERE (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0)) > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'session_id', o.session_id, 'crm_route_id', o.crm_route_id,
      'route_name', o.route_name, 'time_nord', o.time_nord, 'ziua', o.ziua,
      'driver_id', o.driver_id, 'driver_name', o.driver_name,
      'tur_total_lei', o.tur_total_lei, 'retur_total_lei', o.retur_total_lei,
      'total_lei', ROUND(o.total_lei, 2), 'counting_status', o.counting_status,
      'reason', o.reason
    ) ORDER BY o.ziua DESC, o.time_nord NULLS LAST), '[]'::jsonb) INTO v_orphan_num
  FROM cs_orphans o WHERE o.reason IS NOT NULL;

  WITH foaie_last_owner_all AS (
    SELECT DISTINCT ON (receipt_nr) receipt_nr, driver_id
    FROM driver_cashin_receipts
    ORDER BY receipt_nr, ziua DESC
  ),
  ir AS (
    SELECT t.sofer_id AS receipt_nr, t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS cash,
           SUM(COALESCE(t.suma_incash,0))::numeric  AS incash,
           COUNT(*)::int                              AS plati,
           SUM(COALESCE(t.ligotniki0_suma,0))::numeric AS ligotniki0,
           SUM(COALESCE(t.diagrama_suma,0))::numeric  AS diagrama,
           SUM(COALESCE(t.ligotniki_vokzal_suma,0))::numeric AS ligotniki_vokzal,
           SUM(COALESCE(t.dt_suma,0))::numeric AS dt,
           SUM(COALESCE(t.dop_rashodi,0))::numeric AS dop_rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ') AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t
    GROUP BY t.sofer_id, t.ziua
  ),
  matches AS (
    SELECT ir.*,
      EXISTS(SELECT 1 FROM driver_cashin_receipts r WHERE r.receipt_nr = ir.receipt_nr AND r.ziua = ir.ziua) AS exact_match,
      EXISTS(SELECT 1 FROM foaie_last_owner_all flo
             JOIN daily_assignments da ON da.driver_id = flo.driver_id AND da.assignment_date = ir.ziua
             WHERE flo.receipt_nr = ir.receipt_nr
             AND NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr
                             WHERE dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date)
             AND NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr_other
                             WHERE dcr_other.receipt_nr = ir.receipt_nr AND dcr_other.ziua = ir.ziua)) AS implied_match,
      (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE r.receipt_nr = ir.receipt_nr) AS grafic_count,
      CASE WHEN ir.receipt_nr ~ '^[0-9]+$' THEN true ELSE false END AS valid_format,
      EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr
             WHERE ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'receipt_nr', m.receipt_nr, 'ziua', m.ziua,
      'category', CASE WHEN NOT m.valid_format THEN 'INVALID_FORMAT'
                       WHEN m.grafic_count = 0 THEN 'NO_FOAIE'
                       ELSE 'DATA_GRESITA' END,
      'plati', m.plati, 'incasare_lei', ROUND((m.cash + m.diagrama)::numeric, 2),
      'breakdown', jsonb_build_object(
        'numerar', ROUND(m.cash::numeric, 2),
        'diagrama', ROUND(m.diagrama::numeric, 2),
        'ligotniki0_suma', ROUND(m.ligotniki0::numeric, 2),
        'ligotniki_vokzal_suma', ROUND(m.ligotniki_vokzal::numeric, 2),
        'dt_suma', ROUND(m.dt::numeric, 2),
        'dop_rashodi', ROUND(m.dop_rashodi::numeric, 2),
        'comment', m.comment, 'fiscal_nr', m.fiscal_nr
      ),
      'foaie_history',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('ziua', ev.ziua, 'driver_id', ev.driver_id, 'driver_name', ev.driver_name, 'source', ev.source) ORDER BY ev.ziua DESC, ev.prio), '[]'::jsonb)
         FROM (
           SELECT r.ziua, r.driver_id, d.full_name AS driver_name, 'grafic'::text AS source, 1 AS prio
           FROM driver_cashin_receipts r LEFT JOIN drivers d ON d.id = r.driver_id WHERE r.receipt_nr = m.receipt_nr
           UNION ALL
           SELECT ovr.ziua, ovr.driver_id, d.full_name, 'override'::text, 2
           FROM tomberon_payment_overrides ovr LEFT JOIN drivers d ON d.id = ovr.driver_id
           WHERE ovr.receipt_nr = m.receipt_nr AND ovr.action = 'ASSIGN'
           UNION ALL
           SELECT DISTINCT t.ziua, NULL::uuid, NULL::text, 'kiosk'::text, 3
           FROM tomberon.transactions t WHERE t.sofer_id = m.receipt_nr
         ) ev LIMIT 20),
      'duplicate_candidates', CASE WHEN m.grafic_count >= 1 THEN
        (SELECT jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', d.full_name, 'ziua', r.ziua) ORDER BY r.ziua DESC)
         FROM driver_cashin_receipts r LEFT JOIN drivers d ON d.id = r.driver_id WHERE r.receipt_nr = m.receipt_nr)
      ELSE NULL END
    ) ORDER BY m.ziua DESC, (m.cash + m.diagrama) DESC), '[]'::jsonb) INTO v_orphan_inc
  FROM matches m
  WHERE NOT m.has_override AND NOT m.exact_match AND NOT m.implied_match;

  IF p_from = p_to THEN
    SELECT jsonb_build_object(
      'confirmed_by_id', c.confirmed_by, 'confirmed_by_name', a.name,
      'confirmed_at', c.confirmed_at, 'note', c.note,
      'has_new_payments_after', EXISTS(SELECT 1 FROM tomberon.transactions t WHERE t.ziua = p_from AND t.synced_at > c.confirmed_at)
    ) INTO v_confirmation
    FROM incasare_day_confirmations c LEFT JOIN admin_accounts a ON a.id = c.confirmed_by WHERE c.ziua = p_from;
  END IF;

  RETURN jsonb_build_object('routes', v_routes, 'orphan_numerar', v_orphan_num,
                            'orphan_incasare', v_orphan_inc,
                            'confirmation', COALESCE(v_confirmation, 'null'::jsonb));
END;
$function$;
