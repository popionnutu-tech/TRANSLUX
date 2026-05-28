-- 083_suburban_briceni_km_final.sql
-- Aplică standardul KM final pentru rute suburbane Briceni
-- Sursa: ~/Desktop/suburban-briceni-km/ (nomenclator unic confirmat de proprietar)
--
-- Modificări:
--   #48 Grimăncăuți → Briceni:  5 → 7  km  (+2)
--   #49 Tabani      → Briceni:  6 → 8  km  (+2)
--   #50 Corjeuți    → Briceni: 20 → 22 km  (+2)  (Caracușenii Vechi: 8→9, Tabani neschimbat, Briceni: 6→8 segment)
--   #51 Trebisăuți  → Briceni: 14 → 10 km  (-4)
--
-- Pași:
--   1. Backup crm_stop_prices, counting_entries, counting_sessions pentru aceste rute
--   2. Update crm_stop_prices.km_from_nord și km_from_chisinau (segment km)
--   3. Update counting_entries.km_from_start (cumulativ km) pentru sesiunile istorice
--   4. Recalcul tur_total_lei pentru toate sesiunile afectate cu noua formula × rate_suburban

BEGIN;

-- 1. Backup
CREATE TABLE IF NOT EXISTS crm_stop_prices_backup_083 AS
  SELECT * FROM crm_stop_prices WHERE crm_route_id IN (48, 49, 50, 51);

CREATE TABLE IF NOT EXISTS counting_entries_backup_083 AS
  SELECT ce.* FROM counting_entries ce
  JOIN counting_sessions cs ON cs.id = ce.session_id
  WHERE cs.crm_route_id IN (48, 49, 50, 51);

CREATE TABLE IF NOT EXISTS counting_sessions_backup_083 AS
  SELECT * FROM counting_sessions WHERE crm_route_id IN (48, 49, 50, 51);

-- 2. Update crm_stop_prices (segment km from previous stop in route order)
-- Route #48: Grimăncăuți(0) → Briceni(7)
UPDATE crm_stop_prices SET km_from_nord = 0, km_from_chisinau = 0
  WHERE crm_route_id = 48 AND name_ro = 'Grimăncăuți';
UPDATE crm_stop_prices SET km_from_nord = 7, km_from_chisinau = 7
  WHERE crm_route_id = 48 AND name_ro = 'Briceni';

-- Route #49: Tabani(0) → Briceni(8)
UPDATE crm_stop_prices SET km_from_nord = 0, km_from_chisinau = 0
  WHERE crm_route_id = 49 AND name_ro = 'Tabani';
UPDATE crm_stop_prices SET km_from_nord = 8, km_from_chisinau = 8
  WHERE crm_route_id = 49 AND name_ro = 'Briceni';

-- Route #50: Corjeuți(0) → Caracușenii Vechi(9) → Tabani(5) → Briceni(8)
UPDATE crm_stop_prices SET km_from_nord = 0, km_from_chisinau = 0
  WHERE crm_route_id = 50 AND name_ro = 'Corjeuți';
UPDATE crm_stop_prices SET km_from_nord = 9, km_from_chisinau = 9
  WHERE crm_route_id = 50 AND name_ro = 'Caracușenii Vechi';
UPDATE crm_stop_prices SET km_from_nord = 5, km_from_chisinau = 5
  WHERE crm_route_id = 50 AND name_ro = 'Tabani';
UPDATE crm_stop_prices SET km_from_nord = 8, km_from_chisinau = 8
  WHERE crm_route_id = 50 AND name_ro = 'Briceni';

-- Route #51: Trebisăuți(0) → Briceni(10)
UPDATE crm_stop_prices SET km_from_nord = 0, km_from_chisinau = 0
  WHERE crm_route_id = 51 AND name_ro = 'Trebisăuți';
UPDATE crm_stop_prices SET km_from_nord = 10, km_from_chisinau = 10
  WHERE crm_route_id = 51 AND name_ro = 'Briceni';

-- 3. Update counting_entries.km_from_start (cumulative km from start in route direction)
-- Route #48 TUR: Grimăncăuți(0), Briceni(7)
UPDATE counting_entries ce SET km_from_start = 7
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 48
    AND ce.direction = 'tur' AND ce.stop_order = 2;
-- Route #48 RETUR: Briceni(0), Grimăncăuți(7)
UPDATE counting_entries ce SET km_from_start = 7
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 48
    AND ce.direction = 'retur' AND ce.stop_order = 2;

-- Route #49 TUR: Tabani(0), Briceni(8)
UPDATE counting_entries ce SET km_from_start = 8
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 49
    AND ce.stop_order = 2;

-- Route #50 TUR: Corjeuți(0), Caracușenii Vechi(9), Tabani(14), Briceni(22)
UPDATE counting_entries ce SET km_from_start = 9
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 50 AND ce.stop_order = 2;
UPDATE counting_entries ce SET km_from_start = 22
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 50 AND ce.stop_order = 4;
-- stop_order = 3 (Tabani) rămâne la 14

-- Route #51 TUR: Trebisăuți(0), Briceni(10)
UPDATE counting_entries ce SET km_from_start = 10
  FROM counting_sessions cs
  WHERE cs.id = ce.session_id AND cs.crm_route_id = 51 AND ce.stop_order = 2;

-- 4. Recalc tur_total_lei pentru toate sesiunile afectate
-- Formula = computeSuburbanSessionTotal: PARTITION BY session_id, schedule_id, cycle_number
-- (direcția este implicit codată în schedule_id — fiecare schedule este TUR sau RETUR)
WITH ordered AS (
  SELECT
    ce.session_id,
    ce.km_from_start,
    ce.total_passengers,
    COALESCE(ce.alighted, 0) AS alighted,
    LEAD(ce.km_from_start) OVER w AS next_km,
    LAG(ce.km_from_start) OVER w AS prev_km
  FROM public.counting_entries ce
  JOIN public.counting_sessions cs ON cs.id = ce.session_id
  WHERE cs.crm_route_id IN (48, 49, 50, 51)
  WINDOW w AS (PARTITION BY ce.session_id, ce.schedule_id, ce.cycle_number ORDER BY ce.stop_order)
),
computed AS (
  SELECT
    o.session_id,
    SUM(
      CASE WHEN o.next_km IS NOT NULL THEN o.total_passengers * (o.next_km - o.km_from_start) ELSE 0 END
      + CASE WHEN o.prev_km IS NOT NULL THEN o.alighted * (o.km_from_start - o.prev_km) ELSE 0 END
    ) AS pkm
  FROM ordered o
  GROUP BY o.session_id
),
session_tariff AS (
  -- Pick exactly ONE tariff per session (matches getTariffConfig: latest period_start)
  -- Prevents double-counting on boundary dates where two periods could match
  SELECT DISTINCT ON (cs.id)
    cs.id AS session_id,
    tp.rate_suburban
  FROM public.counting_sessions cs
  JOIN public.tariff_periods tp
    ON cs.assignment_date BETWEEN tp.period_start AND COALESCE(tp.period_end, '9999-12-31')
  WHERE cs.crm_route_id IN (48, 49, 50, 51)
  ORDER BY cs.id, tp.period_start DESC
),
targets AS (
  SELECT
    cs.id AS session_id,
    ROUND(c.pkm * st.rate_suburban)::integer AS new_total
  FROM public.counting_sessions cs
  JOIN computed c ON c.session_id = cs.id
  JOIN session_tariff st ON st.session_id = cs.id
  WHERE cs.crm_route_id IN (48, 49, 50, 51)
)
UPDATE public.counting_sessions cs
SET
  tur_total_lei = t.new_total,
  retur_total_lei = 0
FROM targets t
WHERE cs.id = t.session_id;

COMMIT;
