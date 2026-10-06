-- 522: ștergerea unui rând manual lasă urmă — rândul rămâne în tabelă, iese din document.
--
-- Ion, 06.10.2026: «dar dacă pe viitor șterg din greșeală un rând care e corect introdus?»
--
-- Până acum `DELETE` scotea rândul definitiv: nici cine l-a șters, nici când, nici ce conținea.
-- Pentru înregistrări de bani predate în contabilitate e prea puțin. De acum rândul se
-- marchează, nu se scoate: dispare din document, din totaluri și din raport exact ca înainte,
-- eliberează cursa în picker la fel, dar se poate readuce oricând și rămâne în audit.
--
-- Patru părți, și a doua e cea fără de care nimic nu funcționează:
--   (a) coloanele de urmă;
--   (b) indecșii unici devin parțiali — altfel un rând ȘTERS ar ține în continuare cursa
--       ocupată, iar reintroducerea foii ar eșua cu «cursa e deja introdusă». Exact problema
--       pentru care s-a cerut ștergerea;
--   (c) get_casier_document și get_grafic_report nu mai văd rândurile șterse — altfel banii
--       lor ar rămâne în totaluri, deși rândul «nu există»;
--   (d) picker-ul nu le mai consideră blocante.
--
-- Se aplică DUPĂ 520 și 521: reia definițiile lor, cu filtrul în plus.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Urma.
ALTER TABLE public.casier_manual_rows
  ADD COLUMN IF NOT EXISTS sters_la timestamptz,
  ADD COLUMN IF NOT EXISTS sters_de uuid REFERENCES admin_accounts(id);

COMMENT ON COLUMN public.casier_manual_rows.sters_la IS
  'Momentul ștergerii. NULL = rând viu. Rândul șters rămâne în tabelă pentru audit, dar iese din document, din totaluri și din raport. Vezi migr. 522.';

-- Documentul și raportul filtrează pe coloana asta la fiecare citire.
CREATE INDEX IF NOT EXISTS idx_casier_manual_vii
  ON public.casier_manual_rows (ziua) WHERE sters_la IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Indecșii unici devin parțiali.
--
-- Fără asta ștergerea n-ar rezolva nimic: rândul marcat ar continua să ocupe cursa, iar
-- reintroducerea aceleiași foi ar cădea pe uq_casier_manual_assignment. Cazul real care a
-- dus la discuție: foaia 1126491 introdusă din greșeală pe cursa lui Ochievschii Andrei, cu
-- 0 lei — cursa a rămas blocată, iar foaia a trebuit reintrodusă fără cursă atașată.
DROP INDEX IF EXISTS uq_casier_manual_assignment;
CREATE UNIQUE INDEX IF NOT EXISTS uq_casier_manual_assignment
  ON public.casier_manual_rows (assignment_id)
  WHERE assignment_id IS NOT NULL AND sters_la IS NULL;

DROP INDEX IF EXISTS uq_casier_manual_foaie_libera;
CREATE UNIQUE INDEX IF NOT EXISTS uq_casier_manual_foaie_libera
  ON public.casier_manual_rows (norm_foaie(foaie_nr))
  WHERE foaie_nr IS NOT NULL AND assignment_id IS NULL AND sters_la IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) Documentul nu mai vede rândurile șterse. Restul funcției e cel din migr. 520.
CREATE OR REPLACE FUNCTION public.get_casier_document(p_date date)
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
  -- O PLATĂ = UN RÂND. Până acum se grupa pe numărul foii și se însuma, ceea ce ascundea
  -- exact greșeala care trebuie prinsă: un șofer dă foaia, următorul nu e atent, iar suma lui
  -- pleacă pe foaia celui dinainte. Lipite într-un rând, cele două sume nu se mai pot despărți.
  --
  -- Măsurat pe 01.09–05.10: din 1 060 de rânduri, 17 aveau două plăți (1,6%). Despărțite,
  -- tabelul crește cu 17 rânduri în 35 de zile — o jumătate de rând pe zi — iar acelea sunt
  -- tocmai rândurile unde se poate ascunde o greșeală. Bonurile fiscale o arată: 243300 și
  -- 243302 pe aceeași foaie, cu o plată străină între ele.
  --
  -- Nimic nu se mai adună automat. Rândurile care împart un număr de foaie se marchează în
  -- interfață, iar casierul decide: dacă are foaia fizic și scrie pe ea că a introdus de două
  -- ori, e în regulă; dacă n-o are, mută plata pe foaia ei.
  plati_brute AS (
    SELECT
      t.id                                     AS tx_id,
      -- Cheia rândului (și a corecției lui): per PLATĂ, nu per foaie.
      casier_grup_nr(t.sofer_id, t.id::text)   AS norm_nr,
      -- Numărul foii, normalizat, pentru potrivirea cu /grafic. La «Empty» nu potrivește nimic.
      casier_afis_nr(t.sofer_id)               AS foaie_norm,
      COALESCE(NULLIF(btrim(t.sofer_id), ''), 'Empty') AS receipt_nr_display,
      t.ziua                                   AS kiosk_ziua,
      1::int                                   AS plati,
      t.introdus_la                            AS introdus_la_real,
      COALESCE(t.suma_numerar, 0)::numeric     AS incasare_numerar,
      COALESCE(t.diagrama_suma, 0)::numeric    AS diagrama,
      COALESCE(t.ligotniki0_suma, 0)::numeric  AS ligotniki0,
      COALESCE(t.ligotniki_vokzal_suma, 0)::numeric AS ligotniki_vokzal,
      COALESCE(t.dt_suma, 0)::numeric          AS dt,
      COALESCE(t.dop_rashodi, 0)::numeric      AS dop_rashodi,
      NULLIF(t.comment, '')                    AS comment,
      NULLIF(t.fiscal_receipt_nr, '')          AS fiscal_nrs
    FROM tomberon.transactions t
    WHERE t.ziua = p_date
  ),
  agg AS (SELECT * FROM plati_brute),
  with_grafic AS (
    SELECT DISTINCT ON (a.tx_id)
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
    LEFT JOIN driver_cashin_receipts dcr ON norm_foaie(dcr.receipt_nr) = a.foaie_norm
    LEFT JOIN drivers d ON d.id = dcr.driver_id
    LEFT JOIN daily_assignments da
      ON da.driver_id = dcr.driver_id AND da.assignment_date = dcr.ziua
     AND (dcr.crm_route_id IS NULL OR dcr.crm_route_id = da.crm_route_id)
    LEFT JOIN crm_routes cr ON cr.id = da.crm_route_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    ORDER BY a.tx_id, ABS(dcr.ziua - a.kiosk_ziua) NULLS LAST
  ),
  with_corr AS (
    SELECT
      wg.*,
      c.diagrama              AS c_diagrama,
      c.ligotniki0_suma       AS c_ligotniki0,
      c.ligotniki_vokzal_suma AS c_ligotniki_vokzal,
      c.dt_suma               AS c_dt,
      c.dop_rashodi           AS c_dop_rashodi,
      c.comment               AS c_comment,
      -- Identitatea reparată de casier. NULL pe o coloană = fără corecție, rămâne brutul.
      c.foaie_nr              AS c_foaie_nr,
      c.data_foaie            AS c_data_foaie,
      c.driver_id             AS c_driver_id,
      c.driver_name           AS c_driver_name,
      c.crm_route_id          AS c_crm_route_id,
      c.route_name            AS c_route_name,
      c.vehicle_plate         AS c_vehicle_plate
    FROM with_grafic wg
    LEFT JOIN casier_amount_corrections c
      ON c.ziua = wg.kiosk_ziua AND c.norm_nr = wg.norm_nr
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'row_key',          'casier-' || wc.tx_id::text,
    'norm_nr',          wc.norm_nr,
    'is_manual',        false,
    'manual_id',        NULL,
    -- Numărul AFIȘAT poate fi cel corectat; `norm_nr` rămâne cheia (per plată), altfel
    -- corecția și-ar pierde rândul la următoarea citire.
    'foaie_nr',         COALESCE(wc.c_foaie_nr, wc.receipt_nr_display),
    'ziua',             wc.kiosk_ziua,
    'data_foaie',       COALESCE(wc.c_data_foaie, wc.data_foaie),
    'pus_la',           COALESCE(wc.introdus_la_real, wc.pus_la),
    'pus_la_real',      (wc.introdus_la_real IS NOT NULL),
    'plati',            wc.plati,
    'driver_id',        COALESCE(wc.c_driver_id, wc.driver_id),
    'driver_name',      COALESCE(wc.c_driver_name, wc.driver_name),
    'assignment_id',    wc.assignment_id,
    'crm_route_id',     COALESCE(wc.c_crm_route_id, wc.crm_route_id),
    'route_name',       COALESCE(wc.c_route_name, CASE
      WHEN wc.route_type = 'suburban' THEN wc.dest_to_ro || ' - ' || COALESCE(wc.dest_from_ro, '')
      ELSE wc.dest_to_ro
    END),
    'time_nord',        wc.time_nord,
    'vehicle_plate',    COALESCE(wc.c_vehicle_plate, wc.vehicle_plate),
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
      CASE WHEN wc.c_comment IS NOT NULL          THEN 'comment' END,
      CASE WHEN wc.c_foaie_nr IS NOT NULL         THEN 'foaie_nr' END,
      CASE WHEN wc.c_data_foaie IS NOT NULL       THEN 'data_foaie' END,
      CASE WHEN wc.c_driver_name IS NOT NULL      THEN 'driver_name' END,
      CASE WHEN wc.c_route_name IS NOT NULL       THEN 'route_name' END,
      CASE WHEN wc.c_vehicle_plate IS NOT NULL    THEN 'vehicle_plate' END
    ], NULL)), '[]'::jsonb),
    -- Un rând reparat nu mai e «fără /grafic»: dacă i s-a dat un șofer, s-a legat.
    'has_grafic_match', (COALESCE(wc.c_driver_id, wc.driver_id) IS NOT NULL)
  ) ORDER BY wc.time_nord NULLS LAST, wc.receipt_nr_display, wc.introdus_la_real), '[]'::jsonb) INTO v_rows
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
  -- Rândurile șterse rămân în tabelă pentru audit, dar ies din document și din totaluri.
  WHERE m.ziua = p_date AND m.sters_la IS NULL;

  RETURN v_rows || v_manual;
END;
$function$;
-- ─────────────────────────────────────────────────────────────────────────────
-- (c bis) Raportul, la fel. Restul funcției e cel din migr. 521.
CREATE OR REPLACE FUNCTION public.get_grafic_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon', 'pg_temp'
AS $function$
DECLARE
  v_routes          jsonb;
  v_orphan_num      jsonb;
  v_orphan_inc      jsonb;
  v_orphan_manual   jsonb;
  v_manual_atasate  uuid[];   -- rândurile manuale care chiar au ajuns pe o rută
  v_confirmation    jsonb;
BEGIN
  WITH
  foaie_last_owner AS (
    SELECT DISTINCT ON (norm_foaie(receipt_nr)) norm_foaie(receipt_nr) AS receipt_nr, driver_id
    FROM driver_cashin_receipts ORDER BY norm_foaie(receipt_nr), ziua DESC
  ),
  explicit_attributions AS (
    -- foaia legată de rută merge doar la ruta ei; foaia «neancorată» (fără rută,
    -- sau legată de o rută pe care șoferul n-o mai are azi) merge pe (șofer, zi)
    -- ca înainte, dar NU fură atribuirea unei rute care-și are deja foaia proprie
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           da.crm_route_id,
           norm_foaie(dcr.receipt_nr) AS foaie_nr, 'explicit'::text AS source,
           -- IS NOT DISTINCT FROM: niciodată NULL (da.crm_route_id e nullable,
           -- iar NULL ar sări în fața lui true la ORDER BY bound DESC)
           (dcr.crm_route_id IS NOT NULL AND dcr.crm_route_id IS NOT DISTINCT FROM da.crm_route_id) AS bound
    FROM daily_assignments da
    JOIN driver_cashin_receipts dcr ON dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date
    WHERE dcr.crm_route_id = da.crm_route_id
       OR (
            (dcr.crm_route_id IS NULL OR NOT EXISTS (
               SELECT 1 FROM daily_assignments da2
               WHERE da2.driver_id = dcr.driver_id AND da2.assignment_date = dcr.ziua
                 AND da2.crm_route_id = dcr.crm_route_id))
        AND NOT EXISTS (
               SELECT 1 FROM driver_cashin_receipts d2
               WHERE d2.driver_id = da.driver_id AND d2.ziua = da.assignment_date
                 AND d2.crm_route_id = da.crm_route_id)
       )
  ),
  implied_raw AS (
    SELECT da.id AS assignment_id, da.driver_id, da.assignment_date AS ziua,
           da.crm_route_id, norm_foaie(t.sofer_id) AS foaie_nr
    FROM daily_assignments da
    JOIN tomberon.transactions t ON t.ziua = da.assignment_date
    JOIN foaie_last_owner flo ON flo.receipt_nr = norm_foaie(t.sofer_id) AND flo.driver_id = da.driver_id
    -- fallback-ul din kiosk se stinge doar pentru ruta care are deja foaie
    -- (a ei sau a zilei), nu pentru toate rutele șoferului
    WHERE NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr
                      WHERE dcr.driver_id = da.driver_id AND dcr.ziua = da.assignment_date
                        AND (dcr.crm_route_id IS NULL OR dcr.crm_route_id = da.crm_route_id))
    AND NOT EXISTS (SELECT 1 FROM driver_cashin_receipts dcr_other
                    WHERE norm_foaie(dcr_other.receipt_nr) = norm_foaie(t.sofer_id) AND dcr_other.ziua = da.assignment_date)
  ),
  implied_attributions AS (
    SELECT DISTINCT ON (assignment_id) assignment_id, driver_id, ziua, crm_route_id, foaie_nr, 'implied'::text AS source, false AS bound
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
  --   3) foaie legată de rută, apoi explicită (din /grafic) înaintea celei implicite;
  --   4) crm_route_id minim; 5) assignment_id (tiebreak determinist final).
  -- NB: pentru foile LEGATE de rută există un singur candidat (ruta lor), deci
  -- pasul 1 nu le mai poate «salva» dintr-o rută filtrată afară din base_pairs —
  -- cazul e detectat separat, ca orfan FOAIE_FARA_CURSA (mai jos).
  effective_dedup AS (
    SELECT DISTINCT ON (ea.foaie_nr, ea.ziua)
           ea.assignment_id, ea.driver_id, ea.ziua, ea.foaie_nr, ea.source, ea.bound
    FROM effective_attributions ea
    LEFT JOIN foaie_route_overrides fro
      ON fro.ziua = ea.ziua AND norm_foaie(fro.foaie_nr) = ea.foaie_nr
    ORDER BY ea.foaie_nr, ea.ziua,
             (EXISTS (SELECT 1 FROM base_pairs bp WHERE bp.assignment_id = ea.assignment_id)) DESC,
             (CASE WHEN fro.crm_route_id = ea.crm_route_id THEN 0 ELSE 1 END),
             ea.bound DESC,
             (ea.source = 'explicit') DESC,
             ea.crm_route_id,
             ea.assignment_id
  ),
  -- invariantul-pereche al lui effective_dedup: și o RUTĂ primește o singură
  -- foaie (altfel foaia zilei + cea legată ar dubla banii aceleiași curse)
  effective_route AS (
    SELECT DISTINCT ON (assignment_id)
           assignment_id, driver_id, ziua, foaie_nr, source
    FROM effective_dedup
    ORDER BY assignment_id, bound DESC, (source = 'explicit') DESC, foaie_nr
  ),
  route_stops AS (
    SELECT crm_route_id, COUNT(*) AS stop_count,
      (array_agg(name_ro ORDER BY id))[GREATEST(2, COUNT(*)::int / 2)] AS middle_stop
    FROM crm_stop_fares GROUP BY crm_route_id
  ),
  -- Reparațiile casierului peste rândurile de terminal (migr. 520). Când șoferul bate la
  -- casă altceva decât numărul foii — «Empty», data zilei, sau numărul celui dinaintea lui —
  -- banii n-aveau de ce să se agațe și rămâneau în afara raportului. De acum se leagă de
  -- numărul CORECTAT în «Document casier», nu de ce a venit de la terminal.
  --
  -- Cheia e aceeași pe care o scrie get_casier_document: casier_grup_nr(), per PLATĂ. Dacă
  -- cele două ar diverge, corecția s-ar salva pe un rând și s-ar căuta pe altul.
  --
  -- Gruparea pe foaie de mai jos NU se schimbă: documentul arată plățile separat ca omul să
  -- le poată despărți, dar pe rută banii se adună — o foaie cu două plăți aduce o singură sumă.
  kiosk_fixed AS (
    SELECT t.*,
           COALESCE(norm_foaie(c.foaie_nr), norm_foaie(t.sofer_id)) AS eff_foaie,
           c.data_foaie AS c_data_foaie
    FROM tomberon.transactions t
    LEFT JOIN casier_amount_corrections c
      ON c.ziua = t.ziua AND c.norm_nr = casier_grup_nr(t.sofer_id, t.id::text)
  ),
  kiosk_effective AS (
    SELECT DISTINCT ON (t.id)
      t.id, t.eff_foaie AS sofer_id, t.ziua AS kiosk_ziua,
      -- Ziua cursei: cea corectată de casier dacă există, altfel a foii găsite după numărul efectiv.
      COALESCE(t.c_data_foaie, r.ziua) AS effective_ziua,
      t.suma_numerar, t.diagrama_suma, t.ligotniki0_suma, t.ligotniki_vokzal_suma,
      t.dt_suma, t.dop_rashodi, t.suma_incash, t.comment, t.fiscal_receipt_nr
    FROM kiosk_fixed t
    LEFT JOIN driver_cashin_receipts r ON norm_foaie(r.receipt_nr) = t.eff_foaie
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
  -- ─── Numerarul introdus manual la casă (migr. 313) ───
  manual_rows AS (
    SELECT m.*,
      COALESCE(m.data_foaie, m.ziua) AS ziua_efectiva,
      EXISTS (SELECT 1 FROM tomberon.transactions t
              WHERE m.foaie_nr IS NOT NULL
                AND norm_foaie(t.sofer_id) = norm_foaie(m.foaie_nr)) AS foaie_la_terminal
    FROM casier_manual_rows m
    -- Doar ce poate ajunge în raportul acestei perioade: altfel anti-join-ul peste
    -- tomberon.transactions s-ar plăti pentru tot istoricul, la fiecare apel.
    WHERE m.sters_la IS NULL
      AND (COALESCE(m.data_foaie, m.ziua) BETWEEN p_from AND p_to
           OR m.assignment_id IN (SELECT bp.assignment_id FROM base_pairs bp WHERE bp.assignment_id IS NOT NULL))
  ),
  -- Rândurile venite din picker: se leagă exact de cursa lor din /grafic. Cheia de
  -- anti-dublare e CURSA, nu foaia (migr. 313) — două curse ale aceluiași șofer pot împărți
  -- «foaia zilei», iar a doua trebuie să-și păstreze numerarul. Excluderea se face la join,
  -- pe cursele care au primit deja bani de la terminal.
  manual_per_assignment AS (
    SELECT m.assignment_id,
      SUM(m.incasare_numerar)::numeric      AS incasare_numerar,
      SUM(m.diagrama)::numeric              AS incasare_diagrama,
      SUM(m.ligotniki0_suma)::numeric       AS ligotniki0_suma,
      SUM(m.ligotniki_vokzal_suma)::numeric AS ligotniki_vokzal_suma,
      SUM(m.dt_suma)::numeric               AS dt_suma,
      SUM(m.dop_rashodi)::numeric           AS dop_rashodi,
      array_agg(m.id)                       AS ids,
      (array_agg(m.foaie_nr) FILTER (WHERE m.foaie_nr IS NOT NULL))[1] AS foaie_nr,
      string_agg(DISTINCT NULLIF(m.comment, ''), ' | ') AS comment
    FROM manual_rows m
    WHERE m.assignment_id IS NOT NULL
    GROUP BY m.assignment_id
  ),
  -- Rândurile introduse complet manual (fără cursă): singura cheie e numărul foii, deci aici
  -- excluderea pe foaie e cea corectă — dacă foaia a ajuns și la terminal, cifra mașinii câștigă.
  manual_per_foaie AS (
    SELECT norm_foaie(m.foaie_nr) AS foaie_nr, m.ziua_efectiva AS ziua,
      SUM(m.incasare_numerar)::numeric      AS incasare_numerar,
      SUM(m.diagrama)::numeric              AS incasare_diagrama,
      SUM(m.ligotniki0_suma)::numeric       AS ligotniki0_suma,
      SUM(m.ligotniki_vokzal_suma)::numeric AS ligotniki_vokzal_suma,
      SUM(m.dt_suma)::numeric               AS dt_suma,
      SUM(m.dop_rashodi)::numeric           AS dop_rashodi,
      array_agg(m.id)                       AS ids,
      string_agg(DISTINCT NULLIF(m.comment, ''), ' | ') AS comment
    FROM manual_rows m
    WHERE m.assignment_id IS NULL AND m.foaie_nr IS NOT NULL AND NOT m.foaie_la_terminal
    GROUP BY 1, 2
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
      -- foaia cursei: cea din /grafic, altfel cea scrisă pe rândul manual (altfel cursa ar
      -- apărea «fără foaie» deși casierul a introdus-o cu tot cu număr)
      COALESCE(ea.foaie_nr, mpa.foaie_nr) AS foaie_nr,
      COALESCE(ea.source, CASE WHEN mpa.assignment_id IS NOT NULL THEN 'manual' END) AS foaie_source,
      cs.id AS counting_session_id, cs.tur_total_lei, cs.retur_total_lei, cs.status AS counting_status,
      cs.tur_single_lei, cs.retur_single_lei,
      (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS numarare_lei,
      CASE
        WHEN cs.tur_single_lei IS NULL AND cs.retur_single_lei IS NULL THEN NULL
        ELSE (COALESCE(cs.tur_single_lei,0) + COALESCE(cs.retur_single_lei,0))::numeric
      END AS numarare_single_lei,
      -- terminal + numerar introdus manual (pe cursă, respectiv pe foaie)
      COALESCE(tpf.incasare_numerar, 0) + COALESCE(mpa.incasare_numerar, 0) + COALESCE(mpf.incasare_numerar, 0) AS incasare_numerar,
      COALESCE(tpf.incasare_diagrama, 0) + COALESCE(mpa.incasare_diagrama, 0) + COALESCE(mpf.incasare_diagrama, 0) AS incasare_diagrama,
      COALESCE(tpf.ligotniki0_suma, 0) + COALESCE(mpa.ligotniki0_suma, 0) + COALESCE(mpf.ligotniki0_suma, 0) AS ligotniki0_suma,
      COALESCE(tpf.ligotniki_vokzal_suma, 0) + COALESCE(mpa.ligotniki_vokzal_suma, 0) + COALESCE(mpf.ligotniki_vokzal_suma, 0) AS ligotniki_vokzal_suma,
      COALESCE(tpf.dt_suma, 0) + COALESCE(mpa.dt_suma, 0) + COALESCE(mpf.dt_suma, 0) AS dt_suma,
      COALESCE(tpf.dop_rashodi, 0) + COALESCE(mpa.dop_rashodi, 0) + COALESCE(mpf.dop_rashodi, 0) AS dop_rashodi,
      (COALESCE(tpf.incasare_numerar, 0) + COALESCE(mpa.incasare_numerar, 0) + COALESCE(mpf.incasare_numerar, 0))
        + (COALESCE(tpf.incasare_diagrama, 0) + COALESCE(mpa.incasare_diagrama, 0) + COALESCE(mpf.incasare_diagrama, 0)) AS incasare_lei,
      NULLIF(concat_ws(' | ', tpf.comment, mpa.comment, mpf.comment), '') AS incasare_comment,
      -- «plăți» înseamnă tranzacții la terminal; un rând manual e prin definiție zero
      COALESCE(tpf.plati, 0) AS plati,
      tpf.fiscal_nrs,
      COALESCE(mpa.ids, '{}'::uuid[]) || COALESCE(mpf.ids, '{}'::uuid[]) AS manual_ids,
      EXISTS (SELECT 1 FROM route_cancellations rc WHERE rc.crm_route_id = bp.crm_route_id AND rc.ziua = bp.ziua) AS cancelled
    FROM base_pairs bp
    LEFT JOIN crm_routes cr ON cr.id = bp.crm_route_id
    LEFT JOIN daily_assignments da ON da.id = bp.assignment_id
    LEFT JOIN crm_routes cr_retur ON cr_retur.id = da.retur_route_id
    LEFT JOIN drivers d ON d.id = da.driver_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    LEFT JOIN vehicles vr ON vr.id = da.vehicle_id_retur
    LEFT JOIN effective_route ea ON ea.assignment_id = bp.assignment_id
    LEFT JOIN counting_sessions cs ON cs.crm_route_id = bp.crm_route_id AND cs.assignment_date = bp.ziua
    -- tpf.foaie_nr vine deja normalizat din kiosk_effective — nu-l mai normalizăm o dată
    LEFT JOIN tomberon_per_foaie tpf ON tpf.foaie_nr = norm_foaie(ea.foaie_nr) AND tpf.ziua = bp.ziua
    -- numerarul manual intră DOAR pe cursele care n-au primit bani de la terminal: altfel
    -- «foaia zilei» trecută prin casă plus foaia predată în numerar s-ar aduna pe aceeași cursă
    LEFT JOIN manual_per_assignment mpa
      ON mpa.assignment_id = bp.assignment_id
     AND tpf.foaie_nr IS NULL
    -- iar o cursă nu primește și pe cursă, și pe foaie
    LEFT JOIN manual_per_foaie mpf
      ON mpf.foaie_nr = norm_foaie(ea.foaie_nr) AND mpf.ziua = bp.ziua
     AND tpf.foaie_nr IS NULL AND mpa.assignment_id IS NULL
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
  ), '[]'::jsonb),
  -- ce rânduri manuale au ajuns efectiv pe o rută; restul sunt bani rătăciți (mai jos)
  COALESCE((SELECT array_agg(DISTINCT mid)
            FROM routes_status rs2, unnest(rs2.manual_ids) AS mid), '{}'::uuid[])
  INTO v_routes, v_manual_atasate
  FROM routes_status rs;

  -- Numerar manual care NU s-a legat de nicio rută din raport: foaie tastată greșit, cursă
  -- ștearsă din /grafic, rând fără cursă și fără număr, sau foaie ajunsă între timp la
  -- terminal. Fără lista asta banii ar dispărea tăcut din «Pe rute» — exact ce trebuia evitat.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', m.id, 'ziua', m.ziua, 'data_foaie', m.data_foaie, 'foaie_nr', m.foaie_nr,
      'driver_name', COALESCE(d.full_name, m.driver_name), 'route_name', m.route_name,
      'total_lei', ROUND((m.incasare_numerar + m.diagrama + m.ligotniki0_suma
                          + m.ligotniki_vokzal_suma + m.dt_suma + m.dop_rashodi)::numeric, 2),
      'incasare_numerar', ROUND(m.incasare_numerar, 2),
      'reason', CASE
        WHEN EXISTS (SELECT 1 FROM tomberon.transactions t
                     WHERE m.foaie_nr IS NOT NULL
                       AND norm_foaie(t.sofer_id) = norm_foaie(m.foaie_nr)) THEN 'dublura_terminal'
        WHEN m.assignment_id IS NULL AND m.foaie_nr IS NULL THEN 'fara_identificare'
        ELSE 'fara_ruta'
      END
    ) ORDER BY COALESCE(m.data_foaie, m.ziua) DESC, m.created_at), '[]'::jsonb) INTO v_orphan_manual
  FROM casier_manual_rows m
  LEFT JOIN drivers d ON d.id = m.driver_id
  WHERE COALESCE(m.data_foaie, m.ziua) BETWEEN p_from AND p_to
    AND NOT (m.id = ANY(v_manual_atasate))
    AND (m.incasare_numerar + m.diagrama + m.ligotniki0_suma
         + m.ligotniki_vokzal_suma + m.dt_suma + m.dop_rashodi) > 0;

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
    -- Idem: numărările orfane se raportează pentru perioada cerută, nu pentru tot istoricul.
    WHERE (COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0)) > 0
      AND cs.assignment_date BETWEEN p_from AND p_to
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
    SELECT COALESCE(norm_foaie(c.foaie_nr), casier_afis_nr(t.sofer_id)) AS receipt_nr, t.ziua,
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
    -- Limitat la perioada cerută: fără WHERE, blocul agrega TOT istoricul terminalului și
    -- întorcea ~4000 de rânduri (1,5 MB) la fiecare deschidere a tabului, din care interfața
    -- folosea doar cele din ziua curentă. Peste ~75 de zile, funcția intra în timeout.
    FROM tomberon.transactions t
    -- Aceeași reparație ca la kiosk_fixed: fără ea, o plată corectată ar apărea și pe rută,
    -- ȘI în bannerul de orfani — aceiași bani numărați de două ori pe ecran.
    LEFT JOIN casier_amount_corrections c
      ON c.ziua = t.ziua AND c.norm_nr = casier_grup_nr(t.sofer_id, t.id::text)
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY COALESCE(norm_foaie(c.foaie_nr), casier_afis_nr(t.sofer_id)), t.ziua
  ),
  matches AS (
    SELECT ir.*,
      (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE norm_foaie(r.receipt_nr) = ir.receipt_nr) AS grafic_count,
      -- foaia e în grafic, dar șoferul ei n-are NICIO atribuire în ziua foii
      -- (cursa ștearsă/mutată) → banii n-ar apărea nicăieri fără categoria asta
      NOT EXISTS(SELECT 1 FROM driver_cashin_receipts r
                 JOIN daily_assignments da ON da.driver_id = r.driver_id AND da.assignment_date = r.ziua
                 WHERE norm_foaie(r.receipt_nr) = ir.receipt_nr) AS fara_cursa,
      CASE WHEN ir.receipt_nr ~ '^[0-9]+$' THEN true ELSE false END AS valid_format,
      EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr
             WHERE norm_foaie(ovr.receipt_nr) = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'receipt_nr', m.receipt_nr, 'ziua', m.ziua,
      'category', CASE WHEN NOT m.valid_format THEN 'INVALID_FORMAT'
                       WHEN m.grafic_count = 0 THEN 'NO_FOAIE'
                       ELSE 'FOAIE_FARA_CURSA' END,
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
  WHERE NOT m.has_override AND (m.grafic_count = 0 OR m.fara_cursa);

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
                            'orphan_manual', v_orphan_manual,
                            'confirmation', COALESCE(v_confirmation, 'null'::jsonb));
END;
$function$;
-- ─────────────────────────────────────────────────────────────────────────────
-- (d) Picker-ul: un rând șters nu mai ține cursa ocupată.
CREATE OR REPLACE FUNCTION public.get_casier_grafic_candidates(
  p_date   date,
  p_search text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon', 'pg_temp'
AS $function$
DECLARE
  v_out       jsonb;
  v_q         text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like      text;   -- p_search cu \ % _ escapate, pentru ILIKE ... ESCAPE '\'
  v_norm_like text;   -- același, dar peste numărul de foaie normalizat
  v_from      date;
  v_to        date;
BEGIN
  -- O căutare de un caracter e practic «tot» — mai bine arătăm ziua, ca fără căutare.
  IF v_q IS NOT NULL AND length(v_q) < 2 THEN
    v_q := NULL;
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    -- norm_foaie() convertește la bigint; peste 18 cifre ar arunca «out of range».
    v_norm_like := CASE
      WHEN v_q ~ '^[0-9]{19,}$' THEN v_like
      ELSE replace(replace(replace(norm_foaie(v_q), '\', '\\'), '%', '\%'), '_', '\_')
    END;
  END IF;
  -- Interval, nu CASE în WHERE: altfel predicatul nu e sargable și planificatorul nu poate
  -- folosi idx_daily_assignments_date nici măcar pentru cazul obișnuit «o singură zi».
  v_from := CASE WHEN v_q IS NULL THEN p_date ELSE p_date - 60 END;
  v_to   := CASE WHEN v_q IS NULL THEN p_date ELSE p_date + 1 END;

  WITH cand_raw AS (
    -- DISTINCT ON: un șofer poate avea și «foaia zilei» (crm_route_id NULL), și una
    -- legată de rută. O luăm pe cea legată de rută, ca în get_casier_document.
    SELECT DISTINCT ON (da.id)
      da.id                  AS assignment_id,
      da.assignment_date     AS data_foaie,
      da.crm_route_id,
      cr.route_type,
      cr.time_nord,
      CASE
        WHEN cr.route_type = 'suburban' THEN cr.dest_to_ro || ' - ' || COALESCE(cr.dest_from_ro, '')
        ELSE cr.dest_to_ro
      END                    AS route_name,
      da.driver_id,
      d.full_name            AS driver_name,
      v.plate_number         AS vehicle_plate,
      dcr.receipt_nr         AS foaie_nr
    FROM daily_assignments da
    JOIN crm_routes cr ON cr.id = da.crm_route_id
    LEFT JOIN drivers d  ON d.id = da.driver_id
    LEFT JOIN vehicles v ON v.id = da.vehicle_id
    LEFT JOIN driver_cashin_receipts dcr
      ON dcr.driver_id = da.driver_id
     AND dcr.ziua = da.assignment_date
     AND (dcr.crm_route_id IS NULL OR dcr.crm_route_id = da.crm_route_id)
    WHERE da.assignment_date >= v_from
      AND da.assignment_date <= v_to
      AND (v_q IS NULL OR (
            (dcr.receipt_nr IS NOT NULL AND (
               norm_foaie(dcr.receipt_nr) LIKE v_norm_like || '%' ESCAPE '\'
               OR dcr.receipt_nr ILIKE '%' || v_like || '%' ESCAPE '\'))
            OR d.full_name ILIKE '%' || v_like || '%' ESCAPE '\'
          ))
      -- foaia n-a trecut prin terminal (sau cursa n-are încă foaie deloc)
      AND NOT EXISTS (
        SELECT 1 FROM tomberon.transactions t
        WHERE dcr.receipt_nr IS NOT NULL
          AND norm_foaie(t.sofer_id) = norm_foaie(dcr.receipt_nr)
      )
      -- cursele anulate n-au ce căuta în documentul de casier
      AND NOT EXISTS (
        SELECT 1 FROM route_cancellations rc
        WHERE rc.crm_route_id = da.crm_route_id AND rc.ziua = da.assignment_date
      )
    ORDER BY da.id, (dcr.crm_route_id IS NOT NULL) DESC, dcr.receipt_nr
  ),
  -- Lista e pentru bifat, nu pentru raportare: plafon dur, ca o căutare largă să nu
  -- întoarcă mii de rânduri în modal.
  cand AS (
    SELECT * FROM cand_raw
    ORDER BY data_foaie, time_nord NULLS LAST, route_name
    LIMIT 200
  ),
  -- Materializat o dată, nu re-planificat ca subquery corelat per rând.
  deja AS (
    SELECT assignment_id, ziua,
           CASE WHEN foaie_nr ~ '^[0-9]{1,18}$' THEN norm_foaie(foaie_nr) ELSE foaie_nr END AS norm_nr
    FROM casier_manual_rows
    -- Un rând șters nu mai ține cursa ocupată: altfel o foaie introdusă din greșeală ar
    -- bloca pentru totdeauna cursa ei, iar ștergerea n-ar rezolva nimic.
    WHERE sters_la IS NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assignment_id',  c.assignment_id,
    'data_foaie',     c.data_foaie,
    'crm_route_id',   c.crm_route_id,
    'route_name',     c.route_name,
    'route_type',     c.route_type,
    'time_nord',      c.time_nord,
    'driver_id',      c.driver_id,
    'driver_name',    c.driver_name,
    'vehicle_plate',  c.vehicle_plate,
    'foaie_nr',       c.foaie_nr,
    'already_added_ziua', (
      SELECT m.ziua FROM deja m
      WHERE (m.assignment_id IS NOT NULL AND m.assignment_id = c.assignment_id)
         -- Numărul foii blochează doar rândurile fără cursă atașată: «foaia zilei» a unui
         -- șofer cu două curse e aceeași pe ambele, iar a doua trebuie să rămână introducibilă.
         OR (m.assignment_id IS NULL AND m.norm_nr IS NOT NULL AND c.foaie_nr IS NOT NULL
             AND m.norm_nr = CASE WHEN c.foaie_nr ~ '^[0-9]{1,18}$' THEN norm_foaie(c.foaie_nr) ELSE c.foaie_nr END)
      ORDER BY m.ziua LIMIT 1
    )
  ) ORDER BY c.data_foaie, c.time_nord NULLS LAST, c.route_name), '[]'::jsonb) INTO v_out
  FROM cand c;

  RETURN v_out;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_casier_document(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_document(date) TO service_role;
REVOKE ALL ON FUNCTION public.get_grafic_report(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_grafic_report(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.get_casier_grafic_candidates(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_grafic_candidates(date, text) TO service_role;
