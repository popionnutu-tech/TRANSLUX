-- ============================================================================
-- MODUL LDE — «km de încredere» Faza 1: marcare automată a zilelor suspecte.
--
-- Cerere Ion 10.07.2026: fără schimbări la cârpiri (dovedite inofensive sub
-- ~15 km/zi — divergență km_total↔km_check sub 3% pe toate zilele testate).
-- Doar km zilnic per direcție/mașină/zi + flag automat cu PRAG ÎNALT.
--
-- Detectori (doar cei validați pe date, zero alarme false în teste):
--   • punte_mare   — km_patched > 15 km/zi (09.07: 1 caz din 155 zile-mașină)
--   • km_parcare   — opriri >20h din zi ȘI tronsoanele dintre opriri nu explică
--                    km-ul (mers real <5 km, nejustificat >15 km). HMK139 08.07:
--                    parcat ~22h, 67.5 km numărați — jitter la parcare.
--                    (v1 fără condiția pe tronsoane dădea 236/238 alarme false —
--                    mașini care stau mult la uzină dar circulă normal.)
--
-- km_check NU marchează singur: pe dispozitive cu viteza raportată defectă
-- (HMK139) dă alarme false pe zile corecte (03.07: diverg 41%, km corect).
-- ============================================================================

BEGIN;

ALTER TABLE lde_vehicle_gps_daily
  ADD COLUMN IF NOT EXISTS suspect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspect_reason text;

COMMENT ON COLUMN lde_vehicle_gps_daily.suspect IS 'Marcat automat de worker cu prag înalt: punte_mare (km_patched>15) sau km_parcare (opriri>20h dar km>15). Zilele curate rămân false.';
COMMENT ON COLUMN lde_vehicle_gps_daily.suspect_reason IS 'Motivul marcării, ex. «punte_mare:54.2km» / «km_parcare:67.5km@22h». NULL când suspect=false.';

-- coada/paginile filtrează pe suspect=true — index parțial minuscul
CREATE INDEX IF NOT EXISTS idx_lde_gps_daily_suspect
  ON lde_vehicle_gps_daily (date, vehicle_id) WHERE suspect = true;

-- ── Backfill istoric cu aceiași detectori ──

-- punte_mare
UPDATE lde_vehicle_gps_daily
SET suspect = true,
    suspect_reason = 'punte_mare:' || round(km_patched, 1) || 'km'
WHERE km_patched > 15;

-- km_parcare: stat >20h ȘI tronsoanele nu explică km-ul
UPDATE lde_vehicle_gps_daily g
SET suspect = true,
    suspect_reason = 'km_parcare:' || round(g.km_total, 1) || 'km@'
      || round(d.dwell_total / 60.0, 1) || 'h'
FROM (
  SELECT vehicle_id, date, sum(dwell_min) AS dwell_total,
         coalesce(sum(km_from_prev), 0) AS legs_km
  FROM lde_gps_stops
  GROUP BY vehicle_id, date
  HAVING sum(dwell_min) > 20 * 60 AND coalesce(sum(km_from_prev), 0) < 5
) d
WHERE d.vehicle_id = g.vehicle_id AND d.date = g.date
  AND g.km_total - d.legs_km > 15
  AND g.suspect = false;

COMMIT;
