-- 239: Atribuire foaie → rută deterministă (anti-dublare) pentru șoferi cu 2 rute/zi.
--
-- Problemă: get_grafic_report lega foaia de rută doar după (șofer + zi). Când un șofer
-- are 2 atribuiri în aceeași zi (2 rute) și o singură foaie, foaia se atribuia la AMBELE
-- rute → aceeași sumă apărea de 2 ori în „Pe rute sumar" (dublare de bani).
--
-- Soluție: o foaie se atribuie unei SINGURE rute. Alegerea:
--   1) override manual (foaie → rută) al evaluatorului, dacă există;
--   2) altfel atribuirea explicită (foaie din /grafic) înaintea celei implicite;
--   3) altfel, determinist, ruta cu crm_route_id minim.
-- Ruta rămasă fără foaie apare „fără foaie" (status), semnalată pentru corecție.
--
-- Restul funcției (numărare, statusuri, orphans, confirmare) rămâne NESCHIMBAT.

-- Tabel de override manual: fixează o foaie pe o rută anume într-o zi.
CREATE TABLE IF NOT EXISTS public.foaie_route_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziua          date NOT NULL,                         -- ziua atribuirii (grafic day)
  foaie_nr      text NOT NULL CHECK (foaie_nr <> ''),  -- norm_foaie
  crm_route_id  int  NOT NULL REFERENCES crm_routes(id),
  note          text,
  created_by    uuid REFERENCES admin_accounts(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES admin_accounts(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ziua, foaie_nr)
);

COMMENT ON TABLE public.foaie_route_overrides IS
  'Atribuire manuală foaie → rută pentru zilele cu șofer pe 2 rute. Sursă unică folosită de get_grafic_report (și, ulterior, get_casier_document).';

-- RLS deny-all (fără politici): datele sunt corecturi financiare. Serverul admin scrie cu
-- service_role (ocolește RLS), iar get_grafic_report e SECURITY DEFINER (ocolește RLS la citire),
-- deci nimic nu se strică; se închide doar accesul prin cheia anon publică (REST auto-generat).
ALTER TABLE public.foaie_route_overrides ENABLE ROW LEVEL SECURITY;

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
    SELECT DISTINCT ON (norm_foaie(receipt_nr)) norm_foaie(receipt_nr) AS receipt_nr, driver_id
    FROM driver_cashin_receipts ORDER BY norm_foaie(receipt_nr), ziua DESC
  ),
  explicit_attributions AS (
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           da.crm_route_id,
           norm_foaie(dcr.receipt_nr) AS foaie_nr, 'explicit'::text AS source
    FROM daily_assignments da
    JOIN driver_cashin_receipts dcr ON dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date
  ),
  implied_raw AS (
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           da.crm_route_id, norm_foaie(t.sofer_id) AS foaie_nr
    FROM daily_assignments da
    JOIN tomberon.transactions t ON t.ziua = da.assignment_date
    JOIN foaie_last_owner flo ON flo.receipt_nr = norm_foaie(t.sofer_id) AND flo.driver_id = da.driver_id
    WHERE NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr
                      WHERE dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date)
    AND NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr_other
                    WHERE norm_foaie(dcr_other.receipt_nr) = norm_foaie(t.sofer_id) AND dcr_other.ziua = da.assignment_date)
  ),
  implied_attributions AS (
    SELECT DISTINCT ON (assignment_id) assignment_id, driver_id, ziua, crm_route_id, foaie_nr, 'implied'::text AS source
    FROM implied_raw ORDER BY assignment_id, foaie_nr
  ),
  effective_attributions AS (
    SELECT * FROM explicit_attributions UNION ALL SELECT * FROM implied_attributions
  ),
  -- base_pairs mutat ÎNAINTEA dedup-ului: dedup trebuie să prefere atribuirile care
  -- chiar apar în raport (altfel foaia se leagă de o rută filtrată afară → bani dispăruți).
  base_pairs AS (
    SELECT da.crm_route_id, da.assignment_date AS ziua, da.id AS assignment_id
    FROM daily_assignments da
    JOIN crm_routes cr ON cr.id = da.crm_route_id
    WHERE da.assignment_date BETWEEN p_from AND p_to
      AND (
        cr.route_type != 'suburban'
        OR NOT EXISTS (SELECT 1 FROM crm_route_schedules crs WHERE crs.route_id = da.crm_route_id AND crs.active = true)
        OR EXISTS (SELECT 1 FROM crm_route_schedules crs WHERE crs.route_id = da.crm_route_id AND crs.active = true
                   AND EXTRACT(ISODOW FROM da.assignment_date)::int = ANY(crs.days_of_week))
      )
    UNION
    SELECT cr.id, gs.d::date, NULL::uuid
    FROM crm_routes cr
    CROSS JOIN generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs(d)
    WHERE cr.active = true AND cr.route_type = 'suburban'
      AND EXISTS (SELECT 1 FROM crm_route_schedules crs WHERE crs.route_id = cr.id AND crs.active = true
                  AND EXTRACT(ISODOW FROM gs.d::date)::int = ANY(crs.days_of_week))
      AND NOT EXISTS (SELECT 1 FROM daily_assignments da WHERE da.crm_route_id = cr.id AND da.assignment_date = gs.d::date)
  ),
  -- O foaie se atribuie unei SINGURE rute (anti-dublare). Precedență:
  --   1) atribuirea care e ÎN raport (base_pairs) — ca să nu dispară banii;
  --   2) override manual (foaie → rută);
  --   3) foaie explicită (din /grafic) înaintea celei implicite;
  --   4) crm_route_id minim; 5) assignment_id (tiebreak determinist final).
  effective_dedup AS (
    SELECT DISTINCT ON (ea.foaie_nr, ea.ziua)
           ea.assignment_id, ea.driver_id, ea.ziua, ea.foaie_nr, ea.source
    FROM effective_attributions ea
    LEFT JOIN foaie_route_overrides fro
      ON fro.ziua = ea.ziua AND norm_foaie(fro.foaie_nr) = ea.foaie_nr
    ORDER BY ea.foaie_nr, ea.ziua,
             (EXISTS (SELECT 1 FROM base_pairs bp WHERE bp.assignment_id = ea.assignment_id)) DESC,
             (CASE WHEN fro.crm_route_id = ea.crm_route_id THEN 0 ELSE 1 END),
             (ea.source = 'explicit') DESC,
             ea.crm_route_id,
             ea.assignment_id
  ),
  route_stops AS (
    SELECT crm_route_id, COUNT(*) AS stop_count,
      (array_agg(name_ro ORDER BY id))[GREATEST(2, COUNT(*)::int / 2)] AS middle_stop
    FROM crm_stop_fares GROUP BY crm_route_id
  ),
  kiosk_effective AS (
    SELECT DISTINCT ON (t.id)
      t.id, norm_foaie(t.sofer_id) AS sofer_id, t.ziua AS kiosk_ziua,
      r.ziua AS effective_ziua,
      t.suma_numerar, t.diagrama_suma, t.ligotniki0_suma, t.ligotniki_vokzal_suma,
      t.dt_suma, t.dop_rashodi, t.suma_incash, t.comment, t.fiscal_receipt_nr
    FROM tomberon.transactions t
    LEFT JOIN driver_cashin_receipts r ON norm_foaie(r.receipt_nr) = norm_foaie(t.sofer_id)
    ORDER BY t.id, ABS(r.ziua - t.ziua) NULLS LAST
  ),
  tomberon_per_foaie AS (
    SELECT k.sofer_id AS foaie_nr, k.effective_ziua AS ziua,
      SUM(COALESCE(k.suma_numerar,0))::numeric          AS incasare_numerar,
      SUM(COALESCE(k.diagrama_suma,0))::numeric         AS incasare_diagrama,
      SUM(COALESCE(k.ligotniki0_suma,0))::numeric       AS ligotniki0_suma,
      SUM(COALESCE(k.ligotniki_vokzal_suma,0))::numeric AS ligotniki_vokzal_suma,
      SUM(COALESCE(k.dt_suma,0))::numeric               AS dt_suma,
      SUM(COALESCE(k.dop_rashodi,0))::numeric           AS dop_rashodi,
      COUNT(*)::int                                       AS plati,
      string_agg(DISTINCT NULLIF(k.comment,''),           ' | ') AS comment,
      string_agg(DISTINCT NULLIF(k.fiscal_receipt_nr,''), ', ')  AS fiscal_nrs
    FROM kiosk_effective k
    WHERE k.effective_ziua IS NOT NULL
      AND k.effective_ziua BETWEEN p_from AND p_to
    GROUP BY k.sofer_id, k.effective_ziua
  ),
  routes_view AS (
    SELECT
      bp.assignment_id, bp.crm_route_id, bp.ziua,
      COALESCE(bp.assignment_id::text, 'route-' || bp.crm_route_id || '-' || bp.ziua) AS row_key,
      CASE
        WHEN cr.route_type = 'suburban' AND COALESCE(rs.stop_count, 0) > 6 AND rs.middle_stop IS NOT NULL
          THEN cr.dest_to_ro || ' - ' || rs.middle_stop || ' - ' || cr.dest_from_ro
        WHEN cr.route_type = 'suburban' THEN cr.dest_to_ro || ' - ' || cr.dest_from_ro
        ELSE cr.dest_to_ro
      END AS route_name,
      cr.time_nord,
      COALESCE(cr_retur.time_chisinau, cr.time_chisinau) AS time_chisinau,
      da.driver_id, d.full_name AS driver_name,
      v.plate_number AS vehicle_plate, vr.plate_number AS vehicle_plate_retur,
      ea.foaie_nr, ea.source AS foaie_source,
      cs.id AS counting_session_id, cs.tur_total_lei, cs.retur_total_lei, cs.status AS counting_status,
      cs.tur_single_lei, cs.retur_single_lei,
      (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS numarare_lei,
      CASE
        WHEN cs.tur_single_lei IS NULL AND cs.retur_single_lei IS NULL THEN NULL
        ELSE (COALESCE(cs.tur_single_lei,0) + COALESCE(cs.retur_single_lei,0))::numeric
      END AS numarare_single_lei,
      COALESCE(tpf.incasare_numerar, 0) AS incasare_numerar,
      COALESCE(tpf.incasare_diagrama, 0) AS incasare_diagrama,
      COALESCE(tpf.ligotniki0_suma, 0) AS ligotniki0_suma,
      COALESCE(tpf.ligotniki_vokzal_suma, 0) AS ligotniki_vokzal_suma,
      COALESCE(tpf.dt_suma, 0) AS dt_suma,
      COALESCE(tpf.dop_rashodi, 0) AS dop_rashodi,
      COALESCE(tpf.incasare_numerar, 0) + COALESCE(tpf.incasare_diagrama, 0) AS incasare_lei,
      tpf.comment AS incasare_comment, COALESCE(tpf.plati, 0) AS plati, tpf.fiscal_nrs,
      EXISTS (SELECT 1 FROM route_cancellations rc WHERE rc.crm_route_id = bp.crm_route_id AND rc.ziua = bp.ziua) AS cancelled
    FROM base_pairs bp
    LEFT JOIN crm_routes cr ON cr.id = bp.crm_route_id
    LEFT JOIN daily_assignments da ON da.id = bp.assignment_id
    LEFT JOIN crm_routes cr_retur ON cr_retur.id = da.retur_route_id
    LEFT JOIN drivers d ON d.id = da.driver_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    LEFT JOIN vehicles vr ON vr.id = da.vehicle_id_retur
    LEFT JOIN effective_dedup ea ON ea.assignment_id = bp.assignment_id
    LEFT JOIN counting_sessions cs ON cs.crm_route_id = bp.crm_route_id AND cs.assignment_date = bp.ziua
    LEFT JOIN tomberon_per_foaie tpf ON norm_foaie(tpf.foaie_nr) = norm_foaie(ea.foaie_nr) AND tpf.ziua = bp.ziua
    LEFT JOIN route_stops rs ON rs.crm_route_id = bp.crm_route_id
  ),
  routes_status AS (
    SELECT rv.*,
      ((rv.incasare_numerar + rv.incasare_diagrama) + rv.ligotniki0_suma + rv.dop_rashodi - rv.numarare_lei) AS diff,
      CASE
        WHEN rv.numarare_single_lei IS NULL THEN NULL
        ELSE (rv.numarare_lei - rv.numarare_single_lei)
      END AS extra_2tarife_lei,
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
      'assignment_id', rs.assignment_id, 'row_key', rs.row_key,
      'crm_route_id', rs.crm_route_id, 'ziua', rs.ziua,
      'route_name', rs.route_name, 'time_nord', rs.time_nord, 'time_chisinau', rs.time_chisinau,
      'driver_id', rs.driver_id, 'driver_name', rs.driver_name,
      'vehicle_plate', rs.vehicle_plate, 'vehicle_plate_retur', rs.vehicle_plate_retur,
      'foaie_nr', rs.foaie_nr, 'foaie_source', rs.foaie_source, 'cancelled', rs.cancelled,
      'counting_session_id', rs.counting_session_id, 'counting_status', rs.counting_status,
      'tur_total_lei', rs.tur_total_lei, 'retur_total_lei', rs.retur_total_lei,
      'tur_single_lei', rs.tur_single_lei, 'retur_single_lei', rs.retur_single_lei,
      'numarare_lei', ROUND(rs.numarare_lei, 2),
      'numarare_single_lei', CASE WHEN rs.numarare_single_lei IS NULL THEN NULL ELSE ROUND(rs.numarare_single_lei, 2) END,
      'extra_2tarife_lei', CASE WHEN rs.extra_2tarife_lei IS NULL THEN NULL ELSE ROUND(rs.extra_2tarife_lei, 2) END,
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

  WITH ir AS (
    SELECT norm_foaie(t.sofer_id) AS receipt_nr, t.ziua,
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
    FROM tomberon.transactions t GROUP BY norm_foaie(t.sofer_id), t.ziua
  ),
  matches AS (
    SELECT ir.*,
      (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE norm_foaie(r.receipt_nr) = ir.receipt_nr) AS grafic_count,
      CASE WHEN ir.receipt_nr ~ '^[0-9]+$' THEN true ELSE false END AS valid_format,
      EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr
             WHERE norm_foaie(ovr.receipt_nr) = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'receipt_nr', m.receipt_nr, 'ziua', m.ziua,
      'category', CASE WHEN NOT m.valid_format THEN 'INVALID_FORMAT' ELSE 'NO_FOAIE' END,
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
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('ziua', ev.ziua, 'driver_id', ev.driver_id, 'driver_name', ev.driver_name, 'source', ev.source) ORDER BY ev.ziua DESC), '[]'::jsonb)
         FROM (
           SELECT DISTINCT t.ziua AS ziua, NULL::uuid AS driver_id, NULL::text AS driver_name, 'kiosk'::text AS source
           FROM tomberon.transactions t WHERE norm_foaie(t.sofer_id) = m.receipt_nr
         ) ev LIMIT 20),
      'duplicate_candidates', NULL
    ) ORDER BY m.ziua DESC, (m.cash + m.diagrama) DESC), '[]'::jsonb) INTO v_orphan_inc
  FROM matches m
  WHERE NOT m.has_override AND m.grafic_count = 0;

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
