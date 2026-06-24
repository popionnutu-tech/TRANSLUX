-- ============================================================================
-- TRANSLUX Moneyball — analytics tables migration
-- Adaugă 4 tabele noi cu prefix `analytics_`. NU modifică tabele existente.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. analytics_baselines
-- Norma (medie ocupare pax) pe fiecare context.
-- Cheia unică: rută × direcție × stație × trimestru × tip-zi × capacitate.
-- Populate: rulează query de agregare peste counting_entries, salvează mediile.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE analytics_baselines (
  id                BIGSERIAL PRIMARY KEY,
  crm_route_id      INT         NOT NULL,
  direction         TEXT        NOT NULL CHECK (direction IN ('tur','retur')),
  stop_from_order   INT         NOT NULL,        -- segmentul = de la această stație la următoarea
  quarter           TEXT        NOT NULL,        -- ex: '2026-Q2'
  day_type          TEXT        NOT NULL CHECK (day_type IN ('weekday','weekend','holiday')),
  capacity          INT,                          -- NULL = necunoscută (mașina nu e în crm_vehicles)
  avg_passengers    NUMERIC(6,2) NOT NULL,       -- media pasagerilor pe acest segment
  stddev_passengers NUMERIC(6,2),                 -- deviația standard (pentru pragul de „ciudat")
  n_trips           INT         NOT NULL,         -- câte curse au contribuit la normă
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (crm_route_id, direction, stop_from_order, quarter, day_type, capacity)
);

CREATE INDEX idx_baselines_lookup
  ON analytics_baselines (crm_route_id, quarter, day_type, capacity);

COMMENT ON TABLE analytics_baselines IS
  'Norma pasageri așteptați pe fiecare segment în fiecare context (trimestru × tip zi × capacitate).';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. analytics_trip_scores
-- Scorul fiecărei curse: cât de mult a deviat de la normă, global + pe segmente.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE analytics_trip_scores (
  id                BIGSERIAL PRIMARY KEY,
  session_id        UUID        NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction         TEXT        NOT NULL CHECK (direction IN ('tur','retur')),
  driver_id         UUID        NOT NULL,
  crm_route_id      INT         NOT NULL,
  quarter           TEXT        NOT NULL,
  day_type          TEXT        NOT NULL,
  capacity          INT,
  -- Scorul general = media ponderată a devierilor pe segmente
  -- (segmentele cu normă mare cântăresc mai mult)
  overall_deviation_pct NUMERIC(6,2) NOT NULL,
  total_actual_pax  INT         NOT NULL,         -- suma pasagerilor pe toate segmentele
  total_baseline_pax NUMERIC(8,2) NOT NULL,       -- suma normei pe toate segmentele
  -- JSON cu detaliu per segment: [{stop_order, actual, baseline, deviation_pct}, ...]
  segment_details   JSONB       NOT NULL,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, direction)
);

CREATE INDEX idx_trip_scores_driver_quarter
  ON analytics_trip_scores (driver_id, quarter);
CREATE INDEX idx_trip_scores_route_quarter
  ON analytics_trip_scores (crm_route_id, quarter);

COMMENT ON TABLE analytics_trip_scores IS
  'Scor per cursă: deviere procentuală față de normă, detaliat pe segmente.';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. analytics_driver_segment_scores
-- Agregare: cum se comportă fiecare șofer pe fiecare segment în fiecare trimestru.
-- Folosit pentru heatmap-ul pe porțiuni (Pagina 3 din dashboard).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE analytics_driver_segment_scores (
  id                BIGSERIAL PRIMARY KEY,
  driver_id         UUID        NOT NULL,
  crm_route_id      INT         NOT NULL,
  direction         TEXT        NOT NULL CHECK (direction IN ('tur','retur')),
  stop_from_order   INT         NOT NULL,
  quarter           TEXT        NOT NULL,
  avg_deviation_pct NUMERIC(6,2) NOT NULL,
  n_trips           INT         NOT NULL,
  total_actual_pax  INT         NOT NULL,
  total_baseline_pax NUMERIC(8,2) NOT NULL,
  computed_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (driver_id, crm_route_id, direction, stop_from_order, quarter)
);

CREATE INDEX idx_driver_segment_lookup
  ON analytics_driver_segment_scores (driver_id, quarter);
CREATE INDEX idx_driver_segment_route
  ON analytics_driver_segment_scores (crm_route_id, direction, stop_from_order, quarter);

COMMENT ON TABLE analytics_driver_segment_scores IS
  'Scor șofer pe fiecare segment de rută, pe trimestru. Arată unde vinde slab un șofer specific.';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. analytics_driver_route_scores
-- Agregare: cum se comportă fiecare șofer pe fiecare rută, cu VORP.
-- Folosit pentru clasament și pagina VORP (Pagina 7).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE analytics_driver_route_scores (
  id                  BIGSERIAL PRIMARY KEY,
  driver_id           UUID        NOT NULL,
  crm_route_id        INT         NOT NULL,
  quarter             TEXT        NOT NULL,
  avg_deviation_pct   NUMERIC(6,2) NOT NULL,
  n_trips             INT         NOT NULL,
  total_lei_actual    INT         NOT NULL,      -- suma tur_total_lei + retur_total_lei raportate
  -- VORP: câți lei în plus/minus aduce vs un șofer mediu
  -- pus pe ACELEAȘI curse ale lui (context identic)
  vorp_lei            NUMERIC(10,2),
  computed_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (driver_id, crm_route_id, quarter)
);

CREATE INDEX idx_driver_route_quarter
  ON analytics_driver_route_scores (quarter, avg_deviation_pct DESC);

COMMENT ON TABLE analytics_driver_route_scores IS
  'Scor agregat șofer-rută-trimestru cu VORP (Driver Value Over Replacement).';


-- ────────────────────────────────────────────────────────────────────────────
-- 5. analytics_weekly_insights (pentru recomandările Claude săptămânale)
-- Generate duminică seara, citit luni dimineața din dashboard.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE analytics_weekly_insights (
  id           BIGSERIAL PRIMARY KEY,
  week_start   DATE        NOT NULL,            -- luni al săptămânii analizate
  rank         INT         NOT NULL,            -- 1..5 (top 5 insights)
  category     TEXT        NOT NULL,            -- 'driver_drop', 'segment_outlier', 'hidden_gem', etc.
  insight_text TEXT        NOT NULL,            -- 2-3 propoziții generate de Claude
  related_ids  JSONB,                            -- {driver_id, route_id, segment} pentru navigare
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (week_start, rank)
);

COMMENT ON TABLE analytics_weekly_insights IS
  'Top 5 insights generate săptămânal de Claude, afișate pe dashboard luni dimineața.';


-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS — dashboard-ul va citi prin Supabase Auth (user logat)
-- Pentru moment: permit read authenticated, write doar service_role (cron).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE analytics_baselines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_trip_scores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_driver_segment_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_driver_route_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_weekly_insights        ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users pot citi tot (dashboard-ul e doar pentru tine/echipă)
CREATE POLICY "analytics_read_authenticated" ON analytics_baselines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analytics_read_authenticated" ON analytics_trip_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analytics_read_authenticated" ON analytics_driver_segment_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analytics_read_authenticated" ON analytics_driver_route_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analytics_read_authenticated" ON analytics_weekly_insights
  FOR SELECT TO authenticated USING (true);

-- Scrierea: doar service_role (motorul de cron + scripturi backfill)
-- Nu declarăm policy explicit — fără policy pentru INSERT/UPDATE/DELETE,
-- doar service_role poate scrie (ocolind RLS).


-- ────────────────────────────────────────────────────────────────────────────
-- 7. View helper: v_session_context
-- Adaugă pe counting_sessions câmpurile derivate (quarter, day_type, capacity)
-- ca să nu calculăm de fiecare dată în queries.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_session_context AS
SELECT
  cs.id                                        AS session_id,
  cs.assignment_date,
  cs.crm_route_id,
  cs.driver_id,
  cs.vehicle_id,
  cs.tur_total_lei,
  cs.retur_total_lei,
  cs.double_tariff,
  cs.status,
  -- Quarter: ex '2026-Q2'
  EXTRACT(YEAR FROM cs.assignment_date)::text || '-Q' ||
    EXTRACT(QUARTER FROM cs.assignment_date)::text AS quarter,
  -- Day type (sărbătorile MD se pot adăuga ulterior într-un tabel holidays)
  CASE
    WHEN EXTRACT(ISODOW FROM cs.assignment_date) IN (6, 7) THEN 'weekend'
    ELSE 'weekday'
  END AS day_type,
  -- Capacitate via legătura plate_number → code
  cv.capacity AS capacity
FROM counting_sessions cs
LEFT JOIN vehicles v       ON v.id  = cs.vehicle_id
LEFT JOIN crm_vehicles cv
       ON cv.code = (regexp_match(v.plate_number, '^(\d+)'))[1];

COMMENT ON VIEW v_session_context IS
  'Contextul îmbogățit al fiecărei curse: quarter, day_type, capacity. Folosit de motorul Moneyball.';
