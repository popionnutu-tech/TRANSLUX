-- 520: documentul de casier — o plată = un rând, iar rândul venit greșit devine reparabil.
--
-- Ion, 06.10.2026, două cerințe care se sprijină una pe alta:
--
--   «vreau să rămână 2 rânduri — fiindcă aici ar putea fi o greșeală: se mai întâmplă că un
--    șofer dă foaia și următorul nu e atent, și suma se duce pe șoferul de dinaintea lui»
--   «pentru situațiile în care apare dublare vreau doar atenționare, ca să facă modificare în
--    caz că e necesar»
--
-- Până acum plățile se grupau pe numărul foii și se însumau. Lipite într-un rând, cele două
-- sume nu se mai pot despărți, deci greșeala de mai sus nu avea cum să fie reparată. Și tot
-- de aici veneau cele două plăți «Empty» ale aceleiași zile, strânse într-o singură linie cu
-- o singură cheie de corecție (10.08.2026: 2 plăți, 10 050 lei, două bonuri fiscale).
--
-- Măsurat pe 01.09–05.10: 1 060 de rânduri de terminal, din care 17 cu două plăți — 1,6%.
-- Despărțite, tabelul crește cu 17 rânduri în 35 de zile.
--
-- Trei părți:
--   (a) cheia rândului devine PLATA, nu numărul foii;
--   (b) corecția capătă și identitate (nr. foaie, ziua foii, șofer, rută, mașină), nu doar sume;
--   (c) get_casier_document întoarce o plată pe rând și afișează identitatea corectată.
--
-- Ce NU se poate corecta, prin construcție: suma încasată și ora plății. Vin de la casa
-- automată și sunt singura dovadă independentă; rescrise, documentul n-ar mai confrunta nimic.
--
-- Raportul (get_grafic_report) rămâne neatins aici — el adună în continuare pe foaie, ceea ce
-- e corect pentru atribuirea pe rută. Legarea banilor de numărul CORECTAT vine în migr. 521,
-- separat, ca să poată fi verificată singură.

-- ─────────────────────────────────────────────────────────────────────────────
-- (a) Cheia unui rând de document.
-- Numerele VALIDE rămân normalizate ca până acum (ca potrivirea cu /grafic să meargă), dar
-- cheia poartă și id-ul plății, deci două plăți pe aceeași foaie sunt două rânduri distincte.
CREATE OR REPLACE FUNCTION public.casier_afis_nr(p_sofer_id text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_sofer_id ~ '^[0-9]{1,18}$' THEN public.norm_foaie(p_sofer_id)
    ELSE COALESCE(NULLIF(btrim(p_sofer_id), ''), 'Empty')
  END;
$$;

COMMENT ON FUNCTION public.casier_afis_nr(text) IS
  'Numărul foii așa cum se potrivește și se afișează: normalizat la numerele valide, textul brut la restul, «Empty» la gol. Vezi migr. 520.';

CREATE OR REPLACE FUNCTION public.casier_grup_nr(p_sofer_id text, p_tx_id text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT public.casier_afis_nr(p_sofer_id) || '#' || p_tx_id;
$$;

COMMENT ON FUNCTION public.casier_grup_nr(text, text) IS
  'Cheia unui rând din documentul de casier și a corecției lui: numărul foii plus id-ul plății. O plată = un rând, deci două plăți pe aceeași foaie se corectează separat. Vezi migr. 520.';

REVOKE ALL ON FUNCTION public.casier_afis_nr(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.casier_grup_nr(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.casier_afis_nr(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.casier_grup_nr(text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (b) Identitatea corectată. NULL = fără corecție, se păstrează brutul — aceeași convenție
-- ca la sumele existente, deci rândurile de până acum nu se schimbă.
ALTER TABLE public.casier_amount_corrections
  ADD COLUMN IF NOT EXISTS foaie_nr      text,
  ADD COLUMN IF NOT EXISTS data_foaie    date,
  ADD COLUMN IF NOT EXISTS driver_id     uuid REFERENCES drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_name   text,
  ADD COLUMN IF NOT EXISTS crm_route_id  int  REFERENCES crm_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_name    text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text;

COMMENT ON COLUMN public.casier_amount_corrections.foaie_nr IS
  'Numărul real al foii, scris de casier peste ce a venit de la terminal («Empty», o dată, numărul altui șofer). NULL = fără corecție. Vezi migr. 520.';
COMMENT ON COLUMN public.casier_amount_corrections.norm_nr IS
  'Cheia rândului corectat: casier_grup_nr(sofer_id, id-ul plății). Din migr. 520 e per PLATĂ, nu per foaie.';

ALTER TABLE public.casier_amount_corrections
  DROP CONSTRAINT IF EXISTS chk_casier_corr_foaie_nevida;
ALTER TABLE public.casier_amount_corrections
  ADD CONSTRAINT chk_casier_corr_foaie_nevida
  CHECK (foaie_nr IS NULL OR btrim(foaie_nr) <> '');

CREATE INDEX IF NOT EXISTS idx_casier_corr_norm_foaie
  ON public.casier_amount_corrections (public.norm_foaie(foaie_nr))
  WHERE foaie_nr IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) Documentul.
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
  WHERE m.ziua = p_date;

  RETURN v_rows || v_manual;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_casier_document(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_casier_document(date) TO service_role;
