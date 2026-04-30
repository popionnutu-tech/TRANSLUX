-- 060_anomaly_grafic_history.sql
-- Pentru fiecare alertă, returnăm istoricul foii (toate atribuirile din /grafic
-- indiferent de zi). Astfel evaluatorul vede: "0945297 a mai fost al lui Ion pe 25.04",
-- și înțelege contextul (eventual o eroare de tastare, foaie veche reintrodusă etc).
--
-- Adăugăm `grafic_history` (populat pentru orice anomalie, nu doar duplicat).
-- `duplicate_candidates` se păstrează pentru backward compat cu modalul existent.

CREATE OR REPLACE FUNCTION public.get_incasare_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows         jsonb;
  v_anomalies    jsonb;
  v_confirmation jsonb;
BEGIN
  WITH numarare AS (
    SELECT cs.driver_id,
           cs.assignment_date AS ziua,
           SUM(COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS suma
    FROM counting_sessions cs
    WHERE cs.assignment_date BETWEEN p_from AND p_to
      AND cs.driver_id IS NOT NULL
    GROUP BY cs.driver_id, cs.assignment_date
  ),
  tomberon_per_receipt AS (
    SELECT t.sofer_id AS receipt_nr,
           SUM(COALESCE(t.suma_numerar,0))::numeric           AS cash,
           COUNT(*)::int                                        AS plati,
           SUM(COALESCE(t.ligotniki0_suma,0))::numeric         AS ligotniki0,
           SUM(COALESCE(t.diagrama_suma,0))::numeric           AS diagrama,
           SUM(COALESCE(t.ligotniki_vokzal_suma,0))::numeric   AS ligotniki_vokzal,
           SUM(COALESCE(t.dt_suma,0))::numeric                 AS dt,
           SUM(COALESCE(t.dop_rashodi,0))::numeric             AS rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ')    AS comment
    FROM tomberon.transactions t
    WHERE NOT EXISTS (
      SELECT 1 FROM tomberon_payment_overrides ovr
      WHERE ovr.receipt_nr = t.sofer_id AND ovr.ziua = t.ziua AND ovr.action = 'IGNORE'
    )
    GROUP BY t.sofer_id
  ),
  incasare_via_grafic AS (
    SELECT r.driver_id, r.ziua AS report_ziua,
           tpr.cash, tpr.plati, tpr.ligotniki0, tpr.diagrama,
           tpr.ligotniki_vokzal, tpr.dt, tpr.rashodi, tpr.comment
    FROM driver_cashin_receipts r
    JOIN tomberon_per_receipt tpr ON tpr.receipt_nr = r.receipt_nr
    WHERE r.ziua BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM tomberon_payment_overrides ovr WHERE ovr.receipt_nr = r.receipt_nr AND ovr.action = 'ASSIGN')
  ),
  incasare_via_override AS (
    SELECT ovr.driver_id, ovr.ziua AS report_ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric           AS cash,
           COUNT(*)::int                                        AS plati,
           SUM(COALESCE(t.ligotniki0_suma,0))::numeric         AS ligotniki0,
           SUM(COALESCE(t.diagrama_suma,0))::numeric           AS diagrama,
           SUM(COALESCE(t.ligotniki_vokzal_suma,0))::numeric   AS ligotniki_vokzal,
           SUM(COALESCE(t.dt_suma,0))::numeric                 AS dt,
           SUM(COALESCE(t.dop_rashodi,0))::numeric             AS rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ')    AS comment
    FROM tomberon_payment_overrides ovr
    JOIN tomberon.transactions t ON t.sofer_id = ovr.receipt_nr AND t.ziua = ovr.ziua
    WHERE ovr.action = 'ASSIGN' AND ovr.ziua BETWEEN p_from AND p_to
    GROUP BY ovr.driver_id, ovr.ziua
  ),
  incasare_combined AS (
    SELECT * FROM incasare_via_grafic UNION ALL SELECT * FROM incasare_via_override
  ),
  incasare_aggregated AS (
    SELECT driver_id,
           SUM(cash) AS cash, SUM(plati) AS plati,
           SUM(ligotniki0) AS ligotniki0, SUM(diagrama) AS diagrama,
           SUM(ligotniki_vokzal) AS ligotniki_vokzal, SUM(dt) AS dt,
           SUM(rashodi) AS rashodi,
           string_agg(DISTINCT NULLIF(comment,''), ' | ') AS comment
    FROM incasare_combined GROUP BY driver_id
  ),
  numarare_aggregated AS (SELECT driver_id, SUM(suma) AS suma FROM numarare GROUP BY driver_id),
  all_drivers AS (SELECT driver_id FROM numarare_aggregated UNION SELECT driver_id FROM incasare_aggregated),
  merged AS (
    SELECT ad.driver_id, d.full_name,
           COALESCE(n.suma, 0) AS numarare_lei,
           COALESCE(im.cash, 0) AS cash_lei,
           COALESCE(im.diagrama, 0) AS diagrama_lei,
           COALESCE(im.cash, 0) + COALESCE(im.diagrama, 0) AS incasare_lei,
           COALESCE(im.plati, 0) AS plati,
           COALESCE(im.ligotniki0, 0) AS ligotniki0_suma,
           COALESCE(im.ligotniki_vokzal, 0) AS ligotniki_vokzal_suma,
           COALESCE(im.dt, 0) AS dt_suma,
           COALESCE(im.rashodi, 0) AS dop_rashodi,
           im.comment AS comment,
           ((COALESCE(im.cash,0) + COALESCE(im.diagrama,0))
            + COALESCE(im.ligotniki0,0)
            + COALESCE(im.rashodi,0)
            - COALESCE(n.suma,0)) AS diff,
           CASE
             WHEN COALESCE(n.suma,0) > 0 AND COALESCE(im.cash,0) + COALESCE(im.diagrama,0) = 0 THEN 'no_cashin'
             WHEN COALESCE(n.suma,0) = 0 AND COALESCE(im.cash,0) + COALESCE(im.diagrama,0) > 0 THEN 'no_numarare'
             WHEN COALESCE(n.suma,0) > 0 AND ABS(
               (COALESCE(im.cash,0) + COALESCE(im.diagrama,0)) + COALESCE(im.ligotniki0,0) + COALESCE(im.rashodi,0) - COALESCE(n.suma,0)
             ) / COALESCE(n.suma,0) <= 0.05 THEN 'ok'
             WHEN ((COALESCE(im.cash,0) + COALESCE(im.diagrama,0)) + COALESCE(im.ligotniki0,0) + COALESCE(im.rashodi,0)) < COALESCE(n.suma,0) THEN 'underpaid'
             ELSE 'overpaid'
           END AS status
    FROM all_drivers ad
    LEFT JOIN drivers d ON d.id = ad.driver_id
    LEFT JOIN numarare_aggregated n ON n.driver_id = ad.driver_id
    LEFT JOIN incasare_aggregated im ON im.driver_id = ad.driver_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'driver_id', m.driver_id, 'driver_name', m.full_name, 'cashin_sofer_id', NULL,
        'numarare_lei',          ROUND(m.numarare_lei::numeric, 2),
        'incasare_lei',          ROUND(m.incasare_lei::numeric, 2),
        'incasare_numerar',      ROUND(m.cash_lei::numeric, 2),
        'incasare_diagrama',     ROUND(m.diagrama_lei::numeric, 2),
        'plati',                 m.plati,
        'ligotniki0_suma',       ROUND(m.ligotniki0_suma::numeric, 2),
        'ligotniki_vokzal_suma', ROUND(m.ligotniki_vokzal_suma::numeric, 2),
        'dt_suma',               ROUND(m.dt_suma::numeric, 2),
        'dop_rashodi',           ROUND(m.dop_rashodi::numeric, 2),
        'comment',               m.comment,
        'diff',                  ROUND(m.diff::numeric, 2),
        'status',                m.status
      ) ORDER BY
        CASE m.status WHEN 'underpaid' THEN 0 WHEN 'no_cashin' THEN 1 WHEN 'overpaid' THEN 2 WHEN 'no_numarare' THEN 3 ELSE 4 END,
        m.numarare_lei DESC
    ), '[]'::jsonb) INTO v_rows FROM merged m;

  WITH ir AS (
    SELECT t.sofer_id AS receipt_nr, t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric           AS cash,
           SUM(COALESCE(t.suma_incash,0))::numeric            AS incash,
           COUNT(*)::int                                        AS plati,
           SUM(COALESCE(t.ligotniki0_suma,0))::numeric         AS ligotniki0,
           SUM(COALESCE(t.diagrama_suma,0))::numeric           AS diagrama,
           SUM(COALESCE(t.ligotniki_vokzal_suma,0))::numeric   AS ligotniki_vokzal,
           SUM(COALESCE(t.dt_suma,0))::numeric                 AS dt,
           SUM(COALESCE(t.dop_rashodi,0))::numeric             AS dop_rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ')    AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  matches AS (
    SELECT ir.*,
           (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE r.receipt_nr = ir.receipt_nr) AS grafic_count,
           CASE WHEN ir.receipt_nr ~ '^[0-9]+$' THEN true ELSE false END AS valid_format,
           EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr WHERE ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'receipt_nr',   m.receipt_nr,
        'ziua',         m.ziua,
        'category',     CASE WHEN NOT m.valid_format THEN 'INVALID_FORMAT' WHEN m.grafic_count >= 2 THEN 'DUPLICATE_FOAIE' ELSE 'NO_FOAIE' END,
        'plati',        m.plati,
        'incasare_lei', ROUND((m.cash + m.diagrama)::numeric, 2),
        'breakdown', jsonb_build_object(
          'numerar',                ROUND(m.cash::numeric, 2),
          'diagrama',               ROUND(m.diagrama::numeric, 2),
          'ligotniki0_suma',        ROUND(m.ligotniki0::numeric, 2),
          'ligotniki_vokzal_suma',  ROUND(m.ligotniki_vokzal::numeric, 2),
          'dt_suma',                ROUND(m.dt::numeric, 2),
          'dop_rashodi',            ROUND(m.dop_rashodi::numeric, 2),
          'comment',                m.comment,
          'fiscal_nr',              m.fiscal_nr
        ),
        -- Istoria foii in /grafic — populat pentru ORICE anomalie (nu doar duplicat).
        -- Pentru NO_FOAIE va fi [], pentru DUPLICATE_FOAIE va fi >=2 entries.
        'grafic_history',
          (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'driver_id',   r.driver_id,
                    'driver_name', d.full_name,
                    'ziua',        r.ziua
                  ) ORDER BY r.ziua DESC), '[]'::jsonb)
           FROM driver_cashin_receipts r
           LEFT JOIN drivers d ON d.id = r.driver_id
           WHERE r.receipt_nr = m.receipt_nr
           LIMIT 10),
        -- Backward compat: same content (only when ≥2)
        'duplicate_candidates', CASE WHEN m.grafic_count >= 2 THEN
          (SELECT jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', d.full_name, 'ziua', r.ziua) ORDER BY r.ziua DESC)
           FROM driver_cashin_receipts r LEFT JOIN drivers d ON d.id = r.driver_id WHERE r.receipt_nr = m.receipt_nr)
        ELSE NULL END
      ) ORDER BY (m.cash + m.diagrama) DESC), '[]'::jsonb) INTO v_anomalies
  FROM matches m WHERE NOT m.has_override AND (NOT m.valid_format OR m.grafic_count = 0 OR m.grafic_count >= 2);

  IF p_from = p_to THEN
    SELECT jsonb_build_object(
      'confirmed_by_id',        c.confirmed_by,
      'confirmed_by_name',      a.name,
      'confirmed_at',           c.confirmed_at,
      'note',                   c.note,
      'has_new_payments_after', EXISTS(SELECT 1 FROM tomberon.transactions t WHERE t.ziua = p_from AND t.synced_at > c.confirmed_at)
    ) INTO v_confirmation
    FROM incasare_day_confirmations c LEFT JOIN admin_accounts a ON a.id = c.confirmed_by WHERE c.ziua = p_from;
  END IF;

  RETURN jsonb_build_object('rows', v_rows, 'anomalies', v_anomalies, 'confirmation', COALESCE(v_confirmation, 'null'::jsonb));
END;
$function$;
