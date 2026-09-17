-- ============================================================================
-- 367: Traseele ideale ale rutelor de uzină, abaterile și km-ii goi.
--
-- Ion, 17.09.2026: «hai să ne identificăm traseele ideale pentru fiecare rută» și,
-- pe minimizat, «km-ii goi casă ↔ prima stație ȘI retururile goale între ture».
--
-- Etalonul se DEDUCE din urma GPS reală, nu se desenează: satele sunt ETICHETE lipite
-- pe urmă, nu puncte de rutare — regula fermă din packages/db/src/lde-geo-rules.ts
-- (Ion, 23.06.2026: «NU calcula km/geometria-etalon rutând prin centrele satelor.
-- NICIODATĂ»). Măsurat la proba din 17.09: etichetarea regăsește 81-84% din satele
-- declarate, peste pragul de 70% pe care ni-l pusesem.
--
-- NU refolosim lde_daily_route_execution / lde_deviation_events (migr. 206): sunt goale,
-- nu le scrie nimeni, iar migrația 236 le-a declarat deja «grain greșit».
-- NU scriem în lde_route_geometry: o citește planificatorul cardurilor de motorină
-- (lde/carduri/actions.ts), iar decizia lui Ion e s-o lăsăm neatinsă deocamdată.
-- NIMIC de aici nu atinge lde_vehicle_gps_daily.km_total — de acolo pleacă salariile
-- (praguri 6.000/7.000 km) și facturarea per_km.
-- ============================================================================

-- ── granițele de schimb: valoarea se învață din porți, eticheta vine din orarul declarat ──
-- O grupare de plecări nu se poate numerota singură: Draxelmaier are DOUĂ schimburi
-- declarate dar TREI granițe (07:00, 15:30, 00:00). De aceea `tip` și `shift_number`
-- vin din `lde_uzine.shift{1,2,3}_time`, iar `minute_zi` poate fi învățat.
CREATE TABLE IF NOT EXISTS lde_uzina_shift_boundaries (
  uzina_id      text    NOT NULL REFERENCES lde_uzine(id) ON DELETE CASCADE,
  shift_number  int     NOT NULL CHECK (shift_number BETWEEN 1 AND 3),
  tip           text    NOT NULL CHECK (tip IN ('inceput', 'sfarsit')),
  minute_zi     int     CHECK (minute_zi BETWEEN 0 AND 1439),   -- NULL = nu s-a putut stabili
  observations  int     NOT NULL DEFAULT 0,
  sursa         text    NOT NULL DEFAULT 'declarat' CHECK (sursa IN ('invatat', 'declarat')),
  motiv         text,   -- 'sub prag' | 'program_schimbat' | 'orar neparsabil'
  minute_declarat int   CHECK (minute_declarat BETWEEN 0 AND 1439),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (uzina_id, shift_number, tip)
);
COMMENT ON COLUMN lde_uzina_shift_boundaries.minute_zi IS
  'Minutul zilei în ORA CHIȘINĂULUI. Trackerul dă UTC — la proba din 17.09 comparația '
  'directă a dat granițe cu 3 ore mai devreme (Ungheni 02:45 în loc de 06:00).';
COMMENT ON COLUMN lde_uzina_shift_boundaries.motiv IS
  '„program_schimbat" = gruparea e bimodală, uzina și-a mutat orarul în fereastră. '
  'Granița se respinge, NU se mediază între cele două vârfuri.';

-- ── execuția unei curse ──
-- Cheia NU conține vehicle_id: o cursă e a rutei, nu a mașinii. Conține `slot`, fiindcă
-- „uneori în loc de 1 autocar pleacă 2 microbuze" (migr. 253) — 441 de rânduri reale.
-- `run_date` = ziua ATRIBUIRII, nu ziua worker-ului: schimbul 3 de la Orhei (23:00-06:00)
-- are turul în ziua GPS D și returul în D+1, iar ziua worker-ului se taie la 03:00.
CREATE TABLE IF NOT EXISTS lde_route_run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date          date NOT NULL,
  factory_route_id  uuid NOT NULL REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number      int  NOT NULL CHECK (shift_number BETWEEN 1 AND 3),
  slot              int  NOT NULL DEFAULT 1,
  sens              text NOT NULL CHECK (sens IN ('tur', 'retur')),
  vehicle_id        uuid REFERENCES vehicles(id),
  sate_atinse       text[] NOT NULL DEFAULT '{}',
  sate_lipsa        text[] NOT NULL DEFAULT '{}',
  sate_extra        text[] NOT NULL DEFAULT '{}',
  km_real           numeric(8,2),
  km_etalon         numeric(8,2),
  abatere_km        numeric(8,2),
  km_goi            numeric(8,2),
  stare             text NOT NULL DEFAULT 'necunoscut' CHECK (stare IN ('plin', 'gol', 'necunoscut')),
  ambiguu           boolean NOT NULL DEFAULT false,
  motiv             text,   -- 'fara_trecere' | 'gaura_semnal' | 'porti_coincid' | ...
  -- MultiLineString: o parte pe secvență continuă de puncte acceptate. NU LineString —
  -- două puncte despărțite de o pauză de semnal nu sunt vecini, iar o dreaptă trasă
  -- peste gaură ar putea tăia raza unei porți unde autobuzul n-a fost.
  -- DOAR segmentele cu pasageri (sat ↔ poartă). Baza/casa șoferului NU intră niciodată.
  geom              jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date, factory_route_id, shift_number, slot, sens)
);
CREATE INDEX IF NOT EXISTS idx_route_run_etalon
  ON lde_route_run (factory_route_id, shift_number, slot, sens, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_route_run_zi ON lde_route_run (run_date);
CREATE INDEX IF NOT EXISTS idx_route_run_masina ON lde_route_run (vehicle_id, run_date);
CREATE INDEX IF NOT EXISTS idx_route_run_geom_purge ON lde_route_run (run_date) WHERE geom IS NOT NULL;
COMMENT ON COLUMN lde_route_run.geom IS
  'MultiLineString, DOAR partea cu pasageri, simplificat Douglas-Peucker (toleranță 20 m, '
  'plafon 250 puncte/segment). NICIODATĂ SELECT * în liste — geometria se încarcă doar la '
  'drill-down, ca la lde_deviation_events.gps_segment_geojson (migr. 206). Se șterge la 75 de zile.';

-- ── contribuțiile pe ZIUA GPS, separat de ziua cursei ──
-- Fără ele împăcarea nu închide: o cursă de noapte are turul în ziua GPS D și returul în
-- D+1, dar ambele rânduri poartă run_date = D. Comparate după run_date, km-ii returului
-- s-ar pune pe D și ar lipsi din D+1, iar restul neatribuit ar ieși NEGATIV.
CREATE TABLE IF NOT EXISTS lde_route_day_contrib (
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  gps_date        date NOT NULL,
  km_plin         numeric(8,2) NOT NULL DEFAULT 0,
  km_gol          numeric(8,2) NOT NULL DEFAULT 0,
  km_necunoscut   numeric(8,2) NOT NULL DEFAULT 0,
  stare           text NOT NULL DEFAULT 'ok' CHECK (stare IN ('ok', 'esuat')),
  motiv           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, gps_date)
);
COMMENT ON TABLE lde_route_day_contrib IS
  'km_neatribuiti NU se stochează — se derivă la citire ca km_total(zi) − (plin+gol+necunoscut). '
  'Dacă ar fi stocat ca rest, identitatea ar fi adevărată prin definiție și n-ar putea prinde '
  'niciodată un segment pierdut, adică exact funcția pentru care există. Egalitatea se afirmă '
  'cu toleranță ≥ 0,2 km: km_total se stochează rotunjit la o zecimală.';
COMMENT ON COLUMN lde_route_day_contrib.stare IS
  '„esuat" = etichetarea a crăpat pe mașina asta. Fără rândul ăsta, o zi eșuată ar arăta '
  '„100%% neatribuită", nedeosebit de una legitim neatribuită — încă un statut care, prin '
  'construcție, nu alarmează pe nimeni.';

-- ── etalonul: traseul ideal al unei curse ──
CREATE TABLE IF NOT EXISTS lde_route_etalon (
  factory_route_id uuid NOT NULL REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number     int  NOT NULL CHECK (shift_number BETWEEN 1 AND 3),
  slot             int  NOT NULL DEFAULT 1,
  sens             text NOT NULL CHECK (sens IN ('tur', 'retur')),
  sate             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{nume, pondere, pozitie}]
  geom             jsonb,
  km_median        numeric(8,2),
  observations     int  NOT NULL DEFAULT 0,
  source           text NOT NULL DEFAULT 'gps_trace' CHECK (source IN ('gps_trace', 'operator_km')),
  motiv_lipsa      text,   -- de ce nu are geometrie / km: 'etalon insuficient' | 'niciun candidat'
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factory_route_id, shift_number, slot, sens)
);
COMMENT ON TABLE lde_route_etalon IS
  'NU păstrează cheia cursei-sursă (nici vehicle_id, nici run_date, nici run_id) — asta e '
  'condiția pentru care etalonul poate fi permanent în timp ce cursele se șterg la 75 de zile. '
  'Altfel o cerere de ștergere pe Legea 195/2024 s-ar rezolva pe lde_route_run și ar lăsa '
  'traseul acelei zile pe veci în etalon, legat de o mașină.';
COMMENT ON COLUMN lde_route_etalon.observations IS
  'Sub 5 curse etalonul e marcat „etalon insuficient" și km_median rămâne NULL — nu o cifră '
  'cu aparență de adevăr. Precedentul: km_ideal NULL din migr. 300, «analitica scrie „traseu '
  'ideal indisponibil", nu inventează».';

-- ── RLS deny-all pe toate patru, ca tot modulul LDE (tiparul migr. 359) ──
ALTER TABLE lde_uzina_shift_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_route_run              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_route_day_contrib      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_route_etalon           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON lde_uzina_shift_boundaries, lde_route_run, lde_route_day_contrib, lde_route_etalon
  FROM PUBLIC, anon, authenticated;

-- ── retenția geometriei: în BAZĂ, nu în worker ──
-- Worker-ul moare la prima eroare de sursă (gps-worker.mjs:63, :90) și chiar n-a rulat o
-- săptămână întreagă, 09-15.09, când a căzut trackerul. Un purge legat de el ar fi tăcut
-- exact când e mai rău. Tiparul: migr. 284 (search-log-retentie).
CREATE OR REPLACE FUNCTION lde_purge_route_geom() RETURNS int
LANGUAGE sql VOLATILE AS $$
  WITH sterse AS (
    UPDATE lde_route_run SET geom = NULL
     WHERE geom IS NOT NULL AND run_date < (current_date - 75)
    RETURNING 1
  ) SELECT count(*)::int FROM sterse;
$$;
REVOKE ALL ON FUNCTION lde_purge_route_geom() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_purge_route_geom() TO service_role;

SELECT cron.schedule('lde-purge-route-geom', '45 3 * * *', $$SELECT lde_purge_route_geom()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lde-purge-route-geom');

-- ── citirea pentru pagină: un rând pe rută, FĂRĂ geometrie ──
-- Plafonul de zile singur nu ține sub limita PostgREST de 1000 de rânduri: 111 rute × 30
-- de zile × până la 3 schimburi × 2 sensuri trece cu mult peste. Geometria se cere separat,
-- doar pentru ruta aleasă pe hartă.
CREATE OR REPLACE FUNCTION lde_trasee_sumar(p_zile int DEFAULT 30)
RETURNS TABLE (
  factory_route_id uuid, uzina_id text, route_number int, stops_in_order text,
  shift_number int, slot int, sens text,
  sate jsonb, km_median numeric, observations int, source text, motiv_lipsa text,
  curse int, abatere_medie numeric, km_goi_total numeric, ambigue int
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.uzina_id, r.route_number, r.stops_in_order,
         e.shift_number, e.slot, e.sens,
         e.sate, e.km_median, e.observations, e.source, e.motiv_lipsa,
         count(u.id)::int,
         round(avg(u.abatere_km), 2),
         round(sum(u.km_goi), 1),
         count(*) FILTER (WHERE u.ambiguu)::int
    FROM lde_route_etalon e
    JOIN lde_factory_routes r ON r.id = e.factory_route_id
    LEFT JOIN lde_route_run u
      ON u.factory_route_id = e.factory_route_id AND u.shift_number = e.shift_number
     AND u.slot = e.slot AND u.sens = e.sens
     AND u.run_date >= current_date - p_zile
   WHERE r.active
   GROUP BY r.id, r.uzina_id, r.route_number, r.stops_in_order,
            e.shift_number, e.slot, e.sens, e.sate, e.km_median, e.observations, e.source, e.motiv_lipsa
   ORDER BY r.uzina_id, r.route_number, e.shift_number, e.slot, e.sens;
$$;
REVOKE ALL ON FUNCTION lde_trasee_sumar(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_trasee_sumar(int) TO service_role;

-- ── afirmarea: reușita nu depinde de cine citește NOTICE-ul (tiparul migr. 342) ──
DO $$
BEGIN
  IF has_function_privilege('anon', 'lde_trasee_sumar(int)', 'EXECUTE')
     OR has_function_privilege('anon', 'lde_purge_route_geom()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon are EXECUTE pe funcțiile noi — REVOKE-ul n-a prins';
  END IF;
  IF NOT has_function_privilege('service_role', 'lde_trasee_sumar(int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role NU are EXECUTE pe lde_trasee_sumar — pagina ar muri la prima încărcare';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lde-purge-route-geom') THEN
    RAISE EXCEPTION 'purge-ul de geometrie nu s-a programat';
  END IF;
END $$;
