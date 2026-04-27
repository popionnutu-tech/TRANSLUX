-- 048_fix_incasare_global_match.sql
--
-- Fix: matching foaie de parcurs ↔ sofer trebuie sa fie GLOBAL (dupa numar foaie),
-- nu pe ziua depunerii la Tomberon.
--
-- Soferii fac cursa pe ziua X (foaia introdusa de dispecer in /grafic pe ziua X)
-- si depun banii la casa automata pe ziua Y (Y >= X). Inainte JOIN-ul cerea
-- r.ziua = ir.ziua, ceea ce facea ca toate plațile depuse cu intirziere
-- sa apara ca "neasociate cu sofer".
--
-- Solutie: pentru fiecare plata din tomberon, gasim cea mai recenta inregistrare
-- din driver_cashin_receipts care:
--   - are acelasi receipt_nr
--   - are ziua <= ziua depunerii (cursa s-a facut inainte de depunere)
-- Daca exista mai multe potriviri (eroare de date), o luam pe cea mai recenta.

CREATE OR REPLACE FUNCTION public.get_incasare_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows     jsonb;
  v_unmapped jsonb;
BEGIN
  WITH numarare AS (
    SELECT cs.driver_id,
           SUM(COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS suma
    FROM counting_sessions cs
    WHERE cs.assignment_date BETWEEN p_from AND p_to
      AND cs.driver_id IS NOT NULL
    GROUP BY cs.driver_id
  ),
  -- Agregăm tomberon per (receipt_nr, ziua), apoi legăm cu driver
  incasare_raw AS (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS total,
           SUM(COALESCE(t.suma_incash,0))::numeric  AS numerar,
           COUNT(*)::int                            AS plati,
           SUM(COALESCE(t.lgotniki_count,0))::int   AS lgotniki,
           SUM(COALESCE(t.dop_rashodi,0))::numeric  AS rashodi
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  -- LATERAL: pentru fiecare plata, ia cea mai recenta inregistrare din /grafic
  -- cu acelasi receipt_nr si ziua <= ziua depunerii.
  incasare_mapped AS (
    SELECT m.driver_id,
           SUM(ir.total)    AS total,
           SUM(ir.numerar)  AS numerar,
           SUM(ir.plati)    AS plati,
           SUM(ir.lgotniki) AS lgotniki,
           SUM(ir.rashodi)  AS rashodi
    FROM incasare_raw ir
    JOIN LATERAL (
      SELECT r.driver_id
      FROM driver_cashin_receipts r
      WHERE r.receipt_nr = ir.receipt_nr
        AND r.ziua <= ir.ziua
      ORDER BY r.ziua DESC, r.created_at DESC
      LIMIT 1
    ) m ON true
    GROUP BY m.driver_id
  ),
  all_drivers AS (
    SELECT driver_id FROM numarare
    UNION
    SELECT driver_id FROM incasare_mapped
  ),
  merged AS (
    SELECT ad.driver_id,
           d.full_name,
           COALESCE(n.suma, 0)         AS numarare_lei,
           COALESCE(im.total, 0)       AS incasare_lei,
           COALESCE(im.numerar, 0)     AS incasare_numerar,
           COALESCE(im.total, 0) - COALESCE(im.numerar, 0) AS incasare_card,
           COALESCE(im.plati, 0)       AS plati,
           COALESCE(im.lgotniki, 0)    AS lgotniki_count,
           COALESCE(im.rashodi, 0)     AS dop_rashodi,
           (COALESCE(im.total,0) - COALESCE(n.suma,0)) AS diff,
           CASE
             WHEN COALESCE(n.suma,0) > 0 AND COALESCE(im.total,0) = 0 THEN 'no_cashin'
             WHEN COALESCE(n.suma,0) = 0 AND COALESCE(im.total,0) > 0 THEN 'no_numarare'
             WHEN COALESCE(n.suma,0) > 0 AND ABS(COALESCE(im.total,0) - COALESCE(n.suma,0)) / COALESCE(n.suma,0) <= 0.05 THEN 'ok'
             WHEN COALESCE(im.total,0) < COALESCE(n.suma,0) THEN 'underpaid'
             ELSE 'overpaid'
           END AS status
    FROM all_drivers ad
    LEFT JOIN drivers          d  ON d.id = ad.driver_id
    LEFT JOIN numarare         n  ON n.driver_id = ad.driver_id
    LEFT JOIN incasare_mapped  im ON im.driver_id = ad.driver_id
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'driver_id',        m.driver_id,
        'driver_name',      m.full_name,
        'cashin_sofer_id',  NULL,
        'numarare_lei',     ROUND(m.numarare_lei::numeric, 2),
        'incasare_lei',     ROUND(m.incasare_lei::numeric, 2),
        'incasare_numerar', ROUND(m.incasare_numerar::numeric, 2),
        'incasare_card',    ROUND(m.incasare_card::numeric, 2),
        'plati',            m.plati,
        'lgotniki_count',   m.lgotniki_count,
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

  -- Chitante din cash-in care nu au mapare in driver_cashin_receipts
  -- (cu ziua <= ziua depunerii, i.e. nu exista nicio foaie cu acel numar inainte)
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'sofer_id',     u.receipt_nr,
        'ziua',         u.ziua,
        'plati',        u.plati,
        'incasare_lei', ROUND(u.suma::numeric, 2)
      )
      ORDER BY u.suma DESC
    ), '[]'::jsonb)
  INTO v_unmapped
  FROM (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS suma,
           COUNT(*)::int AS plati
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
      AND NOT EXISTS (
        SELECT 1 FROM driver_cashin_receipts r
        WHERE r.receipt_nr = t.sofer_id
          AND r.ziua <= t.ziua
      )
    GROUP BY t.sofer_id, t.ziua
  ) u;

  RETURN jsonb_build_object('rows', v_rows, 'unmapped', v_unmapped);
END;
$function$;

COMMENT ON FUNCTION public.get_incasare_report IS
  'Raport încasări per șofer. Leagă tomberon.transactions ↔ driver_cashin_receipts după nr foaie GLOBAL (nu pe zi), pentru că șoferii depun banii cu întârziere de 1-5 zile după cursă.';
