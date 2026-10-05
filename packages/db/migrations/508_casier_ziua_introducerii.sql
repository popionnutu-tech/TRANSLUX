-- 508: «Document casier Numerar» — ziua documentului devine ziua INTRODUCERII, iar documentul
-- se poate citi pe interval, nu doar pe o zi.
--
-- Ce s-a întâmplat (Ion, 05.10.2026): casierul a introdus azi 29 de foi, dar a schimbat din
-- greșeală data din antet între reprize. Rândurile s-au împrăștiat pe patru documente — 2 pe
-- 02.10, 8 pe 03.10, 7 pe 04.10 și 12 pe 05.10 — deși toate au fost tastate pe 05.10. Nimic
-- nu s-a pierdut, dar documentul zilei nu mai corespunde cu ce a încasat casierul în ziua aia,
-- iar la închiderea casei cifrele nu se potrivesc cu banii din sertar.
--
-- Regula, de acum: ziua documentului NU se mai alege, se deduce. Un rând intră în documentul
-- zilei în care a fost tastat, orice ar fi selectat pe ecran. Ziua FOII (data_foaie) rămâne
-- separată și liberă — exact ea e motivul pentru care documentul de azi conține foi de pe
-- 01–04.10, și așa trebuie să fie.
--
-- Trei părți:
--   (a) reparația datelor de azi;
--   (b) gardă în bază: ziua se scrie din ceasul serverului la INSERT și nu se mai mișcă la UPDATE.
--       Pusă în trigger, nu doar în server action: regula ține de adevărul documentului, nu de
--       un ecran, și așa nicio cale de scriere viitoare n-o poate ocoli;
--   (c) get_casier_document pe interval, ca filtrul de perioadă din «Încasare» să guverneze
--       și documentul de casier (corecții pe mai multe zile deodată, adăugare doar pe ziua curentă).

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Reparația. Formulată ca regulă, nu ca listă de id-uri: fiecare rând merge în documentul
-- zilei în care a fost creat. Pe datele de azi mută exact cele 17 rânduri rătăcite; rulată a
-- doua oară nu mai are ce muta (WHERE o face idempotentă).
--
-- Ora Chișinăului, nu UTC: un rând tastat la 01:30 noaptea aparține documentului zilei locale.
UPDATE public.casier_manual_rows
   SET ziua = (created_at AT TIME ZONE 'Europe/Chisinau')::date
 WHERE ziua <> (created_at AT TIME ZONE 'Europe/Chisinau')::date;

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Gardă: ziua introducerii, impusă de bază.
--
-- La INSERT valoarea primită e ignorată — nu e a clientului de dat. La UPDATE ziua e
-- imuabilă: o corecție de sumă pe un document vechi n-are dreptul să-i mute rândul în
-- documentul de azi (ar goli retroactiv ziua închisă și ar umfla ziua curentă).
ALTER TABLE public.casier_manual_rows
  ALTER COLUMN ziua SET DEFAULT (now() AT TIME ZONE 'Europe/Chisinau')::date;

CREATE OR REPLACE FUNCTION public.casier_manual_ziua_introducerii()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ziua := (now() AT TIME ZONE 'Europe/Chisinau')::date;
  ELSE
    NEW.ziua := OLD.ziua;
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.casier_manual_ziua_introducerii() IS
  'Ziua documentului de casier = ziua (Chișinău) în care rândul a fost introdus. Imuabilă la UPDATE. Vezi migr. 508.';

DROP TRIGGER IF EXISTS trg_casier_manual_ziua ON public.casier_manual_rows;
CREATE TRIGGER trg_casier_manual_ziua
  BEFORE INSERT OR UPDATE ON public.casier_manual_rows
  FOR EACH ROW EXECUTE FUNCTION public.casier_manual_ziua_introducerii();

COMMENT ON COLUMN public.casier_manual_rows.ziua IS
  'Ziua documentului de casier: ziua în care rândul a fost INTRODUS la casă (ora Chișinăului), nu ziua foii. Scrisă de trigger, nu de client — vezi migr. 508. Ziua foii de parcurs e data_foaie.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) Documentul pe interval. Corp identic cu migr. 313, cu trei schimbări:
--   - semnătura (p_from, p_to);
--   - cele două filtre pe zi devin BETWEEN;
--   - rândurile de terminal se ordonează mai întâi pe ziua de casă, altfel pe un interval
--     de o săptămână s-ar amesteca orele a șapte zile.
-- Fiecare rând își duce deja propria `ziua` în JSON, deci clientul poate salva corecțiile
-- pe ziua corectă fără să ghicească.
CREATE OR REPLACE FUNCTION public.get_casier_document(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon', 'pg_temp'
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
      MAX(t.introdus_la) AS introdus_la_real,
      SUM(COALESCE(t.suma_numerar, 0))::numeric AS incasare_numerar,
      SUM(COALESCE(t.diagrama_suma, 0))::numeric AS diagrama,
      SUM(COALESCE(t.ligotniki0_suma, 0))::numeric AS ligotniki0,
      SUM(COALESCE(t.ligotniki_vokzal_suma, 0))::numeric AS ligotniki_vokzal,
      SUM(COALESCE(t.dt_suma, 0))::numeric AS dt,
      SUM(COALESCE(t.dop_rashodi, 0))::numeric AS dop_rashodi,
      string_agg(DISTINCT NULLIF(t.comment, ''), ' | ') AS comment,
      string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr, ''), ', ') AS fiscal_nrs
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
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
     AND (dcr.crm_route_id IS NULL OR dcr.crm_route_id = da.crm_route_id)
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
  ) ORDER BY wc.kiosk_ziua, wc.time_nord NULLS LAST, wc.receipt_nr_display), '[]'::jsonb) INTO v_rows
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
    'assignment_id',    m.assignment_id,
    'crm_route_id',     m.crm_route_id,
    'route_name',       m.route_name,
    'time_nord',        cr.time_nord,
    'vehicle_plate',    m.vehicle_plate,
    'incasare_numerar', ROUND(m.incasare_numerar, 2),
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
  LEFT JOIN crm_routes cr ON cr.id = m.crm_route_id
  WHERE m.ziua BETWEEN p_from AND p_to;

  RETURN v_rows || v_manual;
END;
$function$;


-- Varianta pe o zi rămâne, delegând: e apelată din alte locuri și un singur corp înseamnă
-- o singură definiție a adevărului.
CREATE OR REPLACE FUNCTION public.get_casier_document(p_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon', 'pg_temp'
AS $function$
  SELECT public.get_casier_document(p_date, p_date);
$function$;

-- Funcțiile sunt SECURITY DEFINER și trec peste deny-all-ul RLS din migr. 242. Proiectul are
-- ALTER DEFAULT PRIVILEGES care acordă EXECUTE pe funcțiile noi din public DIRECT lui
-- anon+authenticated → REVOKE FROM PUBLIC singur NU e suficient (vezi migr. 289, 311, 313).
REVOKE ALL ON FUNCTION public.get_casier_document(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_document(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.get_casier_document(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_document(date) TO service_role;

COMMENT ON FUNCTION public.get_casier_document(date, date) IS
  'Documentul de casier pe intervalul [p_from, p_to]: plățile de la terminal (tomberon) plus rândurile introduse manual, fiecare cu `ziua` lui. Vezi migr. 508.';
