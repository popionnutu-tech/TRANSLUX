-- 313: Documentul de casier se împarte în două documente separate (modul GO / numarare):
--
--   «Document casier»          → DOAR ce se încarcă de pe terminalul Tomberon.
--                                Se pot face doar corecții peste sumele existente.
--   «Document casier Numerar»  → DOAR ce introduce casierul manual (casier_manual_rows):
--                                rutele la care șoferul predă foaia dar n-o pune în tomberon.
--                                Aceeași funcționalitate, altă sursă — inclusiv numerarul.
--
-- Erau amestecate în același tabel (rândurile albastre), ceea ce ducea la greșeli la
-- introducere. Datele erau deja în două tabele distincte (tomberon.transactions vs.
-- casier_manual_rows), deci împărțirea e în bună parte de prezentare. Nou aici:
--
--   (a) rândul manual capătă CASH propriu (incasare_numerar). Până acum se afișa mereu
--       «—», fiindcă numerarul putea veni doar de la casa automată.
--   (b) rândul manual reține cursa din /grafic din care a fost creat (assignment_id) —
--       cheia exactă de anti-dublare și singurul mod de a recunoaște cursele fără nr. de foaie.
--   (c) get_casier_grafic_candidates(p_date, p_search): cursele deja planificate în /grafic
--       pentru care NU s-a întors foaia (nicio plată la terminal). Casierul le bifează dintr-o
--       listă în loc să retasteze rută/șofer/mașină/număr foaie — sau caută direct după numărul
--       foii și restul informației se completează din /grafic.
--
-- Ordinea din fișier e intenționată: coloanele și funcțiile întâi, indecșii unici și CHECK-urile
-- la sfârșit. Acelea validează datele existente și pot eșua pe un mediu cu date vechi — dacă
-- ar fi primele, funcțiile ar rămâne nemodificate și baza ar ajunge într-o stare pe jumătate.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Cash pe rândul manual. DEFAULT 0 → rândurile existente rămân exact cum erau.
ALTER TABLE public.casier_manual_rows
  ADD COLUMN IF NOT EXISTS incasare_numerar numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.casier_manual_rows.incasare_numerar IS
  'Numerarul primit la casă pentru o foaie care nu a trecut prin terminalul Tomberon. Documentul «Document casier Numerar». La rândurile din tomberon cash-ul rămâne cel brut, necorectabil.';

-- (b) Proveniența rândului: cursa din /grafic aleasă în picker. Se scrie o singură dată, la
-- inserare — e proveniență, nu un câmp editabil.
ALTER TABLE public.casier_manual_rows
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES daily_assignments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.casier_manual_rows.assignment_id IS
  'Cursa din /grafic din care a fost creat rândul (picker-ul «+ Din /grafic»). NULL = rând introdus complet manual. Cheia exactă pentru anti-dublare, mai sigură decât potrivirea pe șofer+rută+dată.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_casier_document: bază = definiția din migr. 246. Schimbări, toate pe blocul
-- rândurilor manuale:
--   - 'incasare_numerar' = m.incasare_numerar (era hardcodat 0);
--   - 'assignment_id'    = m.assignment_id (era NULL) → UI-ul își poate face dedup-ul și
--     după reîncărcare, nu doar în sesiunea curentă;
--   - 'time_nord' din crm_routes, ca rândurile manuale de interurban să se afișeze
--     «06:55 Lipcani» ca cele din tomberon.
-- Plus pg_temp în search_path (recomandarea PostgreSQL pentru SECURITY DEFINER).
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
  WHERE m.ziua = p_date;

  RETURN v_rows || v_manual;
END;
$function$;

-- Explicit, deși ACL-ul actual e deja corect: CREATE OR REPLACE păstrează privilegiile, dar
-- o re-creare de la zero ar prinde din nou ALTER DEFAULT PRIVILEGES (anon+authenticated).
REVOKE ALL ON FUNCTION public.get_casier_document(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_document(date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) Cursele din /grafic pentru care nu s-a întors foaia.
--
-- «Nu s-a întors foaia» = nicio tranzacție la terminal pe numărul acelei foi (numărul e unic
-- global, deci verificarea nu se limitează la o zi). Intră și atribuirile care n-au încă niciun
-- număr de foaie în /grafic — casierul completează el numărul.
--
-- p_search gol  → cursele zilei p_date (cazul obișnuit: deschizi documentul zilei).
-- p_search dat  → căutare după numărul foii sau numele șoferului într-o fereastră de 60 de zile
--                 în urmă, pentru foile întârziate care ajung mai târziu la casă.
--
-- `already_added_ziua` = ziua documentului în care cursa/foaia e DEJA introdusă (NULL = liberă),
-- căutată GLOBAL, nu doar în ziua curentă — altfel o foaie întârziată introdusă ieri ar apărea
-- azi ca liberă și s-ar introduce a doua oară. UI-ul o arată blocată și spune unde e.
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

COMMENT ON FUNCTION public.get_casier_grafic_candidates(date, text) IS
  'Curse din /grafic fără plată la terminal (foaia nu s-a întors), pentru picker-ul din «Document casier Numerar». Fără p_search: cursele zilei p_date. Cu p_search: căutare după nr. foaie sau șofer în ultimele 60 de zile.';

-- Funcția e SECURITY DEFINER și trece peste deny-all-ul RLS pus în migr. 242. Proiectul are
-- ALTER DEFAULT PRIVILEGES care acordă EXECUTE pe funcțiile noi din public DIRECT lui
-- anon+authenticated → REVOKE FROM PUBLIC singur NU e suficient (vezi migr. 289, 311).
REVOKE ALL ON FUNCTION public.get_casier_grafic_candidates(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_grafic_candidates(date, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Gărzile de integritate, la sfârșit (validează datele existente — vezi nota din antet).

CREATE INDEX IF NOT EXISTS idx_casier_manual_assignment
  ON public.casier_manual_rows(assignment_id);

-- Unicitatea e pe CURSĂ, nu pe foaie. Migr. 246: un șofer poate avea două curse pe zi și o
-- singură «foaie a zilei» (crm_route_id NULL), comună ambelor — o unicitate pe numărul foii
-- ar face a doua cursă imposibil de introdus, iar numerarul ei s-ar pierde tăcut.
CREATE UNIQUE INDEX IF NOT EXISTS uq_casier_manual_assignment
  ON public.casier_manual_rows (assignment_id)
  WHERE assignment_id IS NOT NULL;

-- Numărul foii apără doar rândurile introduse complet manual, care n-au cursă atașată.
CREATE UNIQUE INDEX IF NOT EXISTS uq_casier_manual_foaie_libera
  ON public.casier_manual_rows (norm_foaie(foaie_nr))
  WHERE foaie_nr IS NOT NULL AND assignment_id IS NULL;

-- Sunt bani: gardă de ultimă instanță peste validarea din server action.
ALTER TABLE public.casier_manual_rows
  DROP CONSTRAINT IF EXISTS chk_casier_manual_sume_pozitive;
ALTER TABLE public.casier_manual_rows
  ADD CONSTRAINT chk_casier_manual_sume_pozitive CHECK (
    incasare_numerar >= 0 AND diagrama >= 0 AND ligotniki0_suma >= 0
    AND ligotniki_vokzal_suma >= 0 AND dt_suma >= 0 AND dop_rashodi >= 0
  );

-- Simetric, pe corecții. NULL = «fără corecție», deci rămâne permis.
ALTER TABLE public.casier_amount_corrections
  DROP CONSTRAINT IF EXISTS chk_casier_corr_sume_pozitive;
ALTER TABLE public.casier_amount_corrections
  ADD CONSTRAINT chk_casier_corr_sume_pozitive CHECK (
    (diagrama IS NULL OR diagrama >= 0)
    AND (ligotniki0_suma IS NULL OR ligotniki0_suma >= 0)
    AND (ligotniki_vokzal_suma IS NULL OR ligotniki_vokzal_suma >= 0)
    AND (dt_suma IS NULL OR dt_suma >= 0)
    AND (dop_rashodi IS NULL OR dop_rashodi >= 0)
  );
