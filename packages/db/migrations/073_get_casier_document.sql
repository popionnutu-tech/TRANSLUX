-- 073_get_casier_document.sql
-- RPC pentru Document de casier: o linie per (foaie, zi) din tomberon.transactions.
-- Datele despre șofer/rută/mașină se trag din /grafic (driver_cashin_receipts +
-- daily_assignments) când există match exact pe foaie+zi.
--
-- Diferență față de get_grafic_report.routes:
--   - acolo "lista de bază" = daily_assignments (toate rutele dispecerului)
--   - aici "lista de bază" = tomberon (toate plățile din casă)
--
-- Plățile sunt redirected pe ziua corectă (dacă foaia există în /grafic pe altă zi,
-- plata apare pe acea zi — la fel ca migrația 069).

CREATE OR REPLACE FUNCTION public.get_casier_document(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH
  kiosk_effective AS (
    SELECT DISTINCT ON (t.id)
      t.id, t.sofer_id, t.ziua AS kiosk_ziua,
      r.ziua AS effective_ziua,
      t.suma_numerar, t.diagrama_suma, t.ligotniki0_suma,
      t.ligotniki_vokzal_suma, t.dt_suma, t.dop_rashodi,
      t.suma_incash, t.comment, t.fiscal_receipt_nr
    FROM tomberon.transactions t
    LEFT JOIN driver_cashin_receipts r ON norm_foaie(r.receipt_nr) = norm_foaie(t.sofer_id)
    ORDER BY t.id, ABS(r.ziua - t.ziua) NULLS LAST
  ),
  agg AS (
    SELECT
      norm_foaie(k.sofer_id) AS norm_nr,
      (array_agg(k.sofer_id ORDER BY length(k.sofer_id) DESC))[1] AS receipt_nr_display,
      COALESCE(k.effective_ziua, k.kiosk_ziua) AS ziua,
      COUNT(*)::int AS plati,
      SUM(COALESCE(k.suma_numerar, 0))::numeric AS incasare_numerar,
      SUM(COALESCE(k.diagrama_suma, 0))::numeric AS diagrama,
      SUM(COALESCE(k.ligotniki0_suma, 0))::numeric AS ligotniki0,
      SUM(COALESCE(k.ligotniki_vokzal_suma, 0))::numeric AS ligotniki_vokzal,
      SUM(COALESCE(k.dt_suma, 0))::numeric AS dt,
      SUM(COALESCE(k.dop_rashodi, 0))::numeric AS dop_rashodi,
      string_agg(DISTINCT NULLIF(k.comment, ''), ' | ') AS comment,
      string_agg(DISTINCT NULLIF(k.fiscal_receipt_nr, ''), ', ') AS fiscal_nrs
    FROM kiosk_effective k
    WHERE COALESCE(k.effective_ziua, k.kiosk_ziua) = p_date
    GROUP BY norm_foaie(k.sofer_id), COALESCE(k.effective_ziua, k.kiosk_ziua)
  ),
  with_grafic AS (
    SELECT
      a.*,
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
    LEFT JOIN driver_cashin_receipts dcr
      ON norm_foaie(dcr.receipt_nr) = a.norm_nr AND dcr.ziua = a.ziua
    LEFT JOIN drivers d ON d.id = dcr.driver_id
    LEFT JOIN daily_assignments da
      ON da.driver_id = dcr.driver_id AND da.assignment_date = a.ziua
    LEFT JOIN crm_routes cr ON cr.id = da.crm_route_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'row_key',          'casier-' || wg.norm_nr || '-' || wg.ziua,
    'foaie_nr',         wg.receipt_nr_display,
    'ziua',             wg.ziua,
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
