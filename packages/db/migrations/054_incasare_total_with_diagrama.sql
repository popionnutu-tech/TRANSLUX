-- 054_incasare_total_with_diagrama.sql
-- Logica corecta de business confirmata de owner:
--   Incasare totala = Cash (suma_numerar) + Diagrama (lgotniki_suma)
--   Diferenta intre Numarare si Incasare TREBUIE sa fie acoperita de
--     Lgotnici 0 (lgotniki_count, exprimat in lei) + Dop. rashodi.
--   Restul = diferenta neexplicata (datorat sau platit in plus).
--
-- Schimbari:
--   - incasare_lei = total (cash) + lgotniki_suma (diagrama)  [NOU]
--   - diff = numarare - incasare - lgotniki_count - dop_rashodi  [NOU: e diferenta NEEXPLICATA]
--   - status calculat pe diff-ul neexplicat, nu pe cel brut

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
           SUM(COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS suma
    FROM counting_sessions cs
    WHERE cs.assignment_date BETWEEN p_from AND p_to
      AND cs.driver_id IS NOT NULL
    GROUP BY cs.driver_id
  ),
  incasare_raw AS (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS cash,
           COUNT(*)::int                            AS plati,
           SUM(COALESCE(t.lgotniki_count,0))::numeric AS lgotniki0,
           SUM(COALESCE(t.lgotniki_suma,0))::numeric  AS diagrama,
           SUM(COALESCE(t.dop_rashodi,0))::numeric  AS rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ') AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  incasare_with_override AS (
    SELECT ir.*,
           ovr.action AS ovr_action,
           ovr.driver_id AS ovr_driver_id
    FROM incasare_raw ir
    LEFT JOIN tomberon_payment_overrides ovr
      ON ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua
  ),
  incasare_mapped AS (
    SELECT
      COALESCE(iwo.ovr_driver_id, auto_match.driver_id) AS driver_id,
      iwo.cash, iwo.plati, iwo.lgotniki0, iwo.diagrama, iwo.rashodi
    FROM incasare_with_override iwo
    LEFT JOIN LATERAL (
      SELECT r.driver_id
      FROM driver_cashin_receipts r
      WHERE r.receipt_nr = iwo.receipt_nr
        AND r.ziua <= iwo.ziua
      ORDER BY r.ziua DESC, r.created_at DESC
      LIMIT 1
    ) auto_match ON iwo.ovr_action IS NULL OR iwo.ovr_action <> 'ASSIGN'
    WHERE iwo.ovr_action IS DISTINCT FROM 'IGNORE'
      AND COALESCE(iwo.ovr_driver_id, auto_match.driver_id) IS NOT NULL
  ),
  incasare_aggregated AS (
    SELECT driver_id,
           SUM(cash)      AS cash,
           SUM(plati)     AS plati,
           SUM(lgotniki0) AS lgotniki0,
           SUM(diagrama)  AS diagrama,
           SUM(rashodi)   AS rashodi
    FROM incasare_mapped
    GROUP BY driver_id
  ),
  all_drivers AS (
    SELECT driver_id FROM numarare
    UNION
    SELECT driver_id FROM incasare_aggregated
  ),
  merged AS (
    SELECT ad.driver_id,
           d.full_name,
           COALESCE(n.suma, 0)             AS numarare_lei,
           COALESCE(im.cash, 0)            AS cash_lei,
           COALESCE(im.diagrama, 0)        AS diagrama_lei,
           COALESCE(im.cash, 0) + COALESCE(im.diagrama, 0) AS incasare_lei,
           COALESCE(im.plati, 0)           AS plati,
           COALESCE(im.lgotniki0, 0)       AS lgotniki_count,
           COALESCE(im.diagrama, 0)        AS lgotniki_suma,
           COALESCE(im.rashodi, 0)         AS dop_rashodi,
           -- diff = numarare - incasare - lgotnici0 - rashodi
           --        ^ ce a primit pasagerii  ^ce a depus    ^reduceri legitime
           (COALESCE(n.suma,0)
            - (COALESCE(im.cash,0) + COALESCE(im.diagrama,0))
            - COALESCE(im.lgotniki0,0)
            - COALESCE(im.rashodi,0)) AS diff,
           CASE
             WHEN COALESCE(n.suma,0) > 0 AND COALESCE(im.cash,0) + COALESCE(im.diagrama,0) = 0 THEN 'no_cashin'
             WHEN COALESCE(n.suma,0) = 0 AND COALESCE(im.cash,0) + COALESCE(im.diagrama,0) > 0 THEN 'no_numarare'
             WHEN COALESCE(n.suma,0) > 0 AND ABS(
               COALESCE(n.suma,0) - (COALESCE(im.cash,0) + COALESCE(im.diagrama,0)) - COALESCE(im.lgotniki0,0) - COALESCE(im.rashodi,0)
             ) / COALESCE(n.suma,0) <= 0.05 THEN 'ok'
             WHEN COALESCE(n.suma,0) > (COALESCE(im.cash,0) + COALESCE(im.diagrama,0) + COALESCE(im.lgotniki0,0) + COALESCE(im.rashodi,0)) THEN 'underpaid'
             ELSE 'overpaid'
           END AS status
    FROM all_drivers ad
    LEFT JOIN drivers              d  ON d.id = ad.driver_id
    LEFT JOIN numarare             n  ON n.driver_id = ad.driver_id
    LEFT JOIN incasare_aggregated  im ON im.driver_id = ad.driver_id
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'driver_id',        m.driver_id,
        'driver_name',      m.full_name,
        'cashin_sofer_id',  NULL,
        'numarare_lei',     ROUND(m.numarare_lei::numeric, 2),
        'incasare_lei',     ROUND(m.incasare_lei::numeric, 2),
        'incasare_numerar', ROUND(m.cash_lei::numeric, 2),
        'incasare_card',    ROUND(m.diagrama_lei::numeric, 2),
        'plati',            m.plati,
        'lgotniki_count',   ROUND(m.lgotniki_count::numeric, 2),
        'lgotniki_suma',    ROUND(m.lgotniki_suma::numeric, 2),
        'dop_rashodi',      ROUND(m.dop_rashodi::numeric, 2),
        'diff',             ROUND(m.diff::numeric, 2),
        'status',           m.status
      )
      ORDER BY
        CASE m.status
          WHEN 'underpaid' THEN 0
          WHEN 'no_cashin' THEN 1
          WHEN 'overpaid'  THEN 2
          WHEN 'no_numarare' THEN 3
          ELSE 4
        END,
        m.numarare_lei DESC
    ), '[]'::jsonb)
  INTO v_rows
  FROM merged m;

  WITH ir AS (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS cash,
           SUM(COALESCE(t.suma_incash,0))::numeric  AS incash,
           COUNT(*)::int AS plati,
           SUM(COALESCE(t.lgotniki_count,0))::numeric AS lgotniki0,
           SUM(COALESCE(t.lgotniki_suma,0))::numeric AS diagrama,
           SUM(COALESCE(t.dop_rashodi,0))::numeric AS dop_rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ') AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  matches AS (
    SELECT ir.*,
           (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE r.receipt_nr = ir.receipt_nr) AS grafic_count,
           CASE WHEN ir.receipt_nr ~ '^[0-9]{7}$' THEN true ELSE false END AS valid_format,
           EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr WHERE ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'receipt_nr',     m.receipt_nr,
        'ziua',           m.ziua,
        'category',       CASE
                            WHEN NOT m.valid_format THEN 'INVALID_FORMAT'
                            WHEN m.grafic_count >= 2 THEN 'DUPLICATE_FOAIE'
                            ELSE 'NO_FOAIE'
                          END,
        'plati',          m.plati,
        'incasare_lei',   ROUND((m.cash + m.diagrama)::numeric, 2),
        'breakdown',      jsonb_build_object(
                            'numerar',        ROUND(m.cash::numeric, 2),
                            'card',           ROUND(m.diagrama::numeric, 2),
                            'lgotnici_count', ROUND(m.lgotniki0::numeric, 2),
                            'lgotnici_suma',  ROUND(m.diagrama::numeric, 2),
                            'dop_rashodi',    ROUND(m.dop_rashodi::numeric, 2),
                            'comment',        m.comment,
                            'fiscal_nr',      m.fiscal_nr
                          ),
        'duplicate_candidates', CASE WHEN m.grafic_count >= 2 THEN
          (SELECT jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', d.full_name, 'ziua', r.ziua) ORDER BY r.ziua DESC)
           FROM driver_cashin_receipts r LEFT JOIN drivers d ON d.id = r.driver_id
           WHERE r.receipt_nr = m.receipt_nr)
        ELSE NULL END
      )
      ORDER BY (m.cash + m.diagrama) DESC
    ), '[]'::jsonb)
  INTO v_anomalies
  FROM matches m
  WHERE NOT m.has_override
    AND (
      NOT m.valid_format
      OR m.grafic_count = 0
      OR m.grafic_count >= 2
    );

  IF p_from = p_to THEN
    SELECT jsonb_build_object(
      'confirmed_by_id',   c.confirmed_by,
      'confirmed_by_name', a.name,
      'confirmed_at',      c.confirmed_at,
      'note',              c.note,
      'has_new_payments_after', EXISTS(
        SELECT 1 FROM tomberon.transactions t
        WHERE t.ziua = p_from AND t.synced_at > c.confirmed_at
      )
    )
    INTO v_confirmation
    FROM incasare_day_confirmations c
    LEFT JOIN admin_accounts a ON a.id = c.confirmed_by
    WHERE c.ziua = p_from;
  END IF;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'anomalies', v_anomalies,
    'confirmation', COALESCE(v_confirmation, 'null'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_incasare_report IS
  'Raport incasari per sofer v4. Incasare = cash + diagrama. Diff = numarare - incasare - lgotnici0 - dop_rashodi (datorie/plus REAL dupa scaderea reducerilor legitime).';
