-- Feedback owner 14.07.2026: sub antetul «Ora plății» apăreau timpii de introducere
-- a foii în /grafic (fallback-ul din mig. 239) — «orele prea aproape și nu reale».
-- Fix: expunem un flag `pus_la_real` — UI arată ora DOAR când vine de la casă
-- (introdus_la); la foile vechi arată «—», iar ora introducerii rămâne în tooltip.
-- pus_la rămâne COALESCE(introdus_la, created_at) ca până acum (folosit la sortare).
CREATE OR REPLACE FUNCTION public.get_casier_document(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows jsonb;
  v_manual jsonb;
BEGIN
  WITH
  agg AS (
    SELECT
      norm_foaie(t.sofer_id) AS norm_nr,
      (array_agg(t.sofer_id ORDER BY length(t.sofer_id) DESC))[1] AS receipt_nr_display,
      t.ziua AS kiosk_ziua,
      COUNT(*)::int AS plati,
      MAX(t.introdus_la) AS introdus_la_real,  -- ora reală (ultima plată a foii)
      SUM(COALESCE(t.suma_numerar, 0))::numeric AS incasare_numerar,
      SUM(COALESCE(t.diagrama_suma, 0))::numeric AS diagrama,
      SUM(COALESCE(t.ligotniki0_suma, 0))::numeric AS ligotniki0,
      SUM(COALESCE(t.ligotniki_vokzal_suma, 0))::numeric AS ligotniki_vokzal,
      SUM(COALESCE(t.dt_suma, 0))::numeric AS dt,
      SUM(COALESCE(t.dop_rashodi, 0))::numeric AS dop_rashodi,
      string_agg(DISTINCT NULLIF(t.comment, ''), ' | ') AS comment,
      string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr, ''), ', ') AS fiscal_nrs
    FROM tomberon.transactions t
    WHERE t.ziua = p_date
    GROUP BY norm_foaie(t.sofer_id), t.ziua
  ),
  with_grafic AS (
    SELECT DISTINCT ON (a.norm_nr, a.kiosk_ziua)
      a.*,
      dcr.ziua AS data_foaie,
      dcr.created_at AS pus_la,
      dcr.driver_id,
      d.full_name AS driver_name,
      da.id AS assignment_id,
      cr.id AS crm_route_id,
      cr.dest_to_ro,
      cr.dest_from_ro,
      cr.route_type,
      cr.time_nord,
      v.plate_number AS vehicle_plate
    FROM agg a
    LEFT JOIN driver_cashin_receipts dcr ON norm_foaie(dcr.receipt_nr) = a.norm_nr
    LEFT JOIN drivers d ON d.id = dcr.driver_id
    LEFT JOIN daily_assignments da
      ON da.driver_id = dcr.driver_id AND da.assignment_date = dcr.ziua
    LEFT JOIN crm_routes cr ON cr.id = da.crm_route_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    ORDER BY a.norm_nr, a.kiosk_ziua, ABS(dcr.ziua - a.kiosk_ziua) NULLS LAST
  ),
  with_corr AS (
    SELECT
      wg.*,
      c.diagrama              AS c_diagrama,
      c.ligotniki0_suma       AS c_ligotniki0,
      c.ligotniki_vokzal_suma AS c_ligotniki_vokzal,
      c.dt_suma               AS c_dt,
      c.dop_rashodi           AS c_dop_rashodi,
      c.comment               AS c_comment
    FROM with_grafic wg
    LEFT JOIN casier_amount_corrections c
      ON c.ziua = wg.kiosk_ziua AND c.norm_nr = wg.norm_nr
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'row_key',          'casier-' || wc.norm_nr || '-' || wc.kiosk_ziua,
    'norm_nr',          wc.norm_nr,
    'is_manual',        false,
    'manual_id',        NULL,
    'foaie_nr',         wc.receipt_nr_display,
    'ziua',             wc.kiosk_ziua,
    'data_foaie',       wc.data_foaie,
    'pus_la',           COALESCE(wc.introdus_la_real, wc.pus_la),
    -- true = ora vine de la casă (introdus_la); false = fallback pe introducerea foii
    'pus_la_real',      (wc.introdus_la_real IS NOT NULL),
    'plati',            wc.plati,
    'driver_id',        wc.driver_id,
    'driver_name',      wc.driver_name,
    'assignment_id',    wc.assignment_id,
    'crm_route_id',     wc.crm_route_id,
    'route_name',       CASE
      WHEN wc.route_type = 'suburban' THEN wc.dest_to_ro || ' - ' || COALESCE(wc.dest_from_ro, '')
      ELSE wc.dest_to_ro
    END,
    'time_nord',        wc.time_nord,
    'vehicle_plate',    wc.vehicle_plate,
    'incasare_numerar', ROUND(wc.incasare_numerar, 2),
    'diagrama',              ROUND(COALESCE(wc.c_diagrama, wc.diagrama), 2),
    'ligotniki0_suma',       ROUND(COALESCE(wc.c_ligotniki0, wc.ligotniki0), 2),
    'ligotniki_vokzal_suma', ROUND(COALESCE(wc.c_ligotniki_vokzal, wc.ligotniki_vokzal), 2),
    'dt_suma',               ROUND(COALESCE(wc.c_dt, wc.dt), 2),
    'dop_rashodi',           ROUND(COALESCE(wc.c_dop_rashodi, wc.dop_rashodi), 2),
    'comment',               COALESCE(wc.c_comment, wc.comment),
    'fiscal_nrs',       wc.fiscal_nrs,
    'corrected_fields', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY[
      CASE WHEN wc.c_diagrama IS NOT NULL         THEN 'diagrama' END,
      CASE WHEN wc.c_ligotniki0 IS NOT NULL       THEN 'ligotniki0_suma' END,
      CASE WHEN wc.c_ligotniki_vokzal IS NOT NULL THEN 'ligotniki_vokzal_suma' END,
      CASE WHEN wc.c_dt IS NOT NULL               THEN 'dt_suma' END,
      CASE WHEN wc.c_dop_rashodi IS NOT NULL      THEN 'dop_rashodi' END,
      CASE WHEN wc.c_comment IS NOT NULL          THEN 'comment' END
    ], NULL)), '[]'::jsonb),
    'has_grafic_match', (wc.driver_id IS NOT NULL)
  ) ORDER BY wc.time_nord NULLS LAST, wc.receipt_nr_display), '[]'::jsonb) INTO v_rows
  FROM with_corr wc;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'row_key',          'manual-' || m.id::text,
    'norm_nr',          NULL,
    'is_manual',        true,
    'manual_id',        m.id,
    'foaie_nr',         m.foaie_nr,
    'ziua',             m.ziua,
    'data_foaie',       m.data_foaie,
    'pus_la',           m.created_at,
    'pus_la_real',      false,
    'plati',            0,
    'driver_id',        m.driver_id,
    'driver_name',      COALESCE(d.full_name, m.driver_name),
    'assignment_id',    NULL,
    'crm_route_id',     m.crm_route_id,
    'route_name',       m.route_name,
    'time_nord',        NULL,
    'vehicle_plate',    m.vehicle_plate,
    'incasare_numerar', 0,
    'diagrama',              ROUND(m.diagrama, 2),
    'ligotniki0_suma',       ROUND(m.ligotniki0_suma, 2),
    'ligotniki_vokzal_suma', ROUND(m.ligotniki_vokzal_suma, 2),
    'dt_suma',               ROUND(m.dt_suma, 2),
    'dop_rashodi',           ROUND(m.dop_rashodi, 2),
    'comment',               m.comment,
    'fiscal_nrs',       NULL,
    'corrected_fields', '[]'::jsonb,
    'has_grafic_match', (m.driver_id IS NOT NULL)
  ) ORDER BY m.created_at), '[]'::jsonb) INTO v_manual
  FROM casier_manual_rows m
  LEFT JOIN drivers d ON d.id = m.driver_id
  WHERE m.ziua = p_date;

  RETURN v_rows || v_manual;
END;
$function$;
