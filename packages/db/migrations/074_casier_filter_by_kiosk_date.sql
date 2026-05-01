-- 074_casier_filter_by_kiosk_date.sql
-- Document casier filter: după ziua DEPUNERII la casă (kiosk_ziua), nu redirect.
-- Coloana DataFoaie afișează separat ziua din /grafic (când dispecerul a introdus
-- foaia) — dacă diferă de ziua plății, operatorul vede asta clar.

CREATE OR REPLACE FUNCTION public.get_casier_document(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH
  agg AS (
    SELECT
      norm_foaie(t.sofer_id) AS norm_nr,
      (array_agg(t.sofer_id ORDER BY length(t.sofer_id) DESC))[1] AS receipt_nr_display,
      t.ziua AS kiosk_ziua,
      COUNT(*)::int AS plati,
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
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'row_key',          'casier-' || wg.norm_nr || '-' || wg.kiosk_ziua,
    'foaie_nr',         wg.receipt_nr_display,
    'ziua',             wg.kiosk_ziua,
    'data_foaie',       wg.data_foaie,
    'plati',            wg.plati,
    'driver_id',        wg.driver_id,
    'driver_name',      wg.driver_name,
    'assignment_id',    wg.assignment_id,
    'crm_route_id',     wg.crm_route_id,
    'route_name',       CASE
      WHEN wg.route_type = 'suburban' THEN wg.dest_to_ro || ' - ' || COALESCE(wg.dest_from_ro, '')
      ELSE wg.dest_to_ro
    END,
    'time_nord',        wg.time_nord,
    'vehicle_plate',    wg.vehicle_plate,
    'incasare_numerar', ROUND(wg.incasare_numerar, 2),
    'diagrama',         ROUND(wg.diagrama, 2),
    'ligotniki0_suma',  ROUND(wg.ligotniki0, 2),
    'ligotniki_vokzal_suma', ROUND(wg.ligotniki_vokzal, 2),
    'dt_suma',          ROUND(wg.dt, 2),
    'dop_rashodi',      ROUND(wg.dop_rashodi, 2),
    'comment',          wg.comment,
    'fiscal_nrs',       wg.fiscal_nrs,
    'has_grafic_match', (wg.driver_id IS NOT NULL)
  ) ORDER BY wg.time_nord NULLS LAST, wg.receipt_nr_display), '[]'::jsonb) INTO v_rows
  FROM with_grafic wg;

  RETURN v_rows;
END;
$function$;
