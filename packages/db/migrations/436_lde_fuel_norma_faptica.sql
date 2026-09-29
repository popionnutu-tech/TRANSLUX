-- 436: norma faptică pe /lde/combustibil — km pe tot anul, norma mașinii, datele pe perioadă (ION-135)
--
-- Ion, 29.09.2026, pe /lde/combustibil: «nu îmi ajunge aici norma factică, împărțirea să fie pe direcții, nu toate
-- împreună» + «acestea trebuia să apară pe perioada relevantă» (prima → ultima de la consumatorii străini).
-- Km: GPS-ul nostru (lde_vehicle_gps_daily) începe abia pe 10.06.2026, deci l/100 km pe ianuarie–mai n-ar avea km.
-- LDE ține km pe mașină × zi din 2018 (raznareadca.km_m2m, GPS-ul lor): pe iul–sep 2026, 88 % din zilele-mașină
-- comune sunt la ±10 % de GPS-ul nostru, Σ m2m cu 8 % peste. Km-ul zilei = GPS-ul nostru când are km, altfel km_m2m.
-- Norma = aceeași ca pe /lde/vehicule: COALESCE(măsurată încărcată, măsurată, norma tipului), l/100 km.
-- Camioanele n-au km în LDE, iar Wialon le dă km abia din iunie: litrii din ianuarie–mai fără km dădeau 108 l/100 km.
-- Deci norma faptică se ia pe fereastra cu km a fiecărei mașini: litri_cu_km = litrii din zilele ≥ prima zi cu km.

CREATE TABLE IF NOT EXISTS lde_km_m2m (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  zi           date NOT NULL,
  km           numeric(9,2) NOT NULL,
  sofer        text,
  directia     text,
  external_id  text NOT NULL UNIQUE,           -- km_m2m.id
  imported_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lde_km_m2m_vehicle_zi ON lde_km_m2m (vehicle_id, zi);
CREATE INDEX IF NOT EXISTS idx_lde_km_m2m_zi ON lde_km_m2m (zi);
COMMENT ON TABLE lde_km_m2m IS
  'Km pe mașină × zi din baza LDE (raznareadca.km_m2m, fără rândurile delete=1), ION-135. Import: '
  'lde-geo-worker/km-m2m-worker.mjs. Folosit doar unde lde_vehicle_gps_daily n-are km (înainte de 10.06.2026).';
ALTER TABLE lde_km_m2m ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_km_m2m FROM anon, authenticated;

-- Tipul întors se schimbă → DROP + CREATE (CREATE OR REPLACE nu poate schimba coloanele).
DROP FUNCTION IF EXISTS lde_fuel_flota(date, date);
CREATE FUNCTION lde_fuel_flota(de date, pana date)
RETURNS TABLE (vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[],
               benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric,
               km numeric, km_zile_gps bigint, km_zile_lde bigint, km_prima date, litri_cu_km numeric,
               norma numeric, prima date, ultima date)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH b AS (
    SELECT a.vehicle_id, count(*) n, sum(a.litri) l,
      min((a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date) mn, max((a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date) mx
    FROM lde_fuel_alimentari a
    WHERE a.alimentat_at >= (de::timestamp AT TIME ZONE 'Europe/Chisinau')
      AND a.alimentat_at <  ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')
    GROUP BY a.vehicle_id
  ), f AS (
    SELECT f.vehicle_id, count(*) n, sum(f.litri) l, min(f.zi) mn, max(f.zi) mx
    FROM lde_fuel_foaie f WHERE f.zi BETWEEN de AND pana GROUP BY f.vehicle_id
  ), g AS (
    SELECT vehicle_id, date AS zi, km_total AS km FROM lde_vehicle_gps_daily WHERE date BETWEEN de AND pana AND km_total > 0
  ), m AS (
    SELECT vehicle_id, zi, sum(km) AS km FROM lde_km_m2m WHERE zi BETWEEN de AND pana GROUP BY 1, 2
  ), k AS (
    SELECT COALESCE(g.vehicle_id, m.vehicle_id) AS vehicle_id,
      sum(COALESCE(g.km, m.km)) AS km, count(g.km) AS zile_gps, count(*) FILTER (WHERE g.km IS NULL) AS zile_lde,
      min(COALESCE(g.zi, m.zi)) FILTER (WHERE COALESCE(g.km, m.km) > 0) AS km_prima
    FROM g FULL JOIN m ON m.vehicle_id = g.vehicle_id AND m.zi = g.zi
    GROUP BY 1
  ), lk AS (   -- litrii din fereastra cu km: benzol + foaie din zilele ≥ km_prima
    SELECT k.vehicle_id, COALESCE((SELECT sum(a.litri) FROM lde_fuel_alimentari a WHERE a.vehicle_id = k.vehicle_id
               AND a.alimentat_at >= (k.km_prima::timestamp AT TIME ZONE 'Europe/Chisinau')
               AND a.alimentat_at <  ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')), 0)
         + COALESCE((SELECT sum(f.litri) FROM lde_fuel_foaie f WHERE f.vehicle_id = k.vehicle_id
               AND f.zi BETWEEN k.km_prima AND pana), 0) AS l
    FROM k WHERE k.km_prima IS NOT NULL
  )
  SELECT v.id, v.plate_number, v.active, v.is_lde, v.directions,
    COALESCE(b.n, 0), COALESCE(b.l, 0), COALESCE(f.n, 0), COALESCE(f.l, 0),
    COALESCE(k.km, 0), COALESCE(k.zile_gps, 0), COALESCE(k.zile_lde, 0), k.km_prima, COALESCE(lk.l, 0),
    COALESCE(n.measured_consumption_l_per_100km_loaded, n.measured_consumption_l_per_100km, t.norm_l_per_100km),
    LEAST(b.mn, f.mn), GREATEST(b.mx, f.mx)
  FROM vehicles v
  LEFT JOIN b ON b.vehicle_id = v.id
  LEFT JOIN f ON f.vehicle_id = v.id
  LEFT JOIN k ON k.vehicle_id = v.id
  LEFT JOIN lk ON lk.vehicle_id = v.id
  LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id
  LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
$$;

-- Consumatorii: prima/ultima și în perioadă (prima_p/ultima_p), nu doar pe tot istoricul.
DROP FUNCTION IF EXISTS lde_fuel_consumatori(date, date);
CREATE FUNCTION lde_fuel_consumatori(de date, pana date)
RETURNS TABLE (cheie text, denumire text, tip text, variante text[], surse text[],
               randuri bigint, litri numeric, randuri_total bigint, litri_total numeric, prima date, ultima date,
               prima_p date, ultima_p date)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH s AS (
    SELECT s.*, COALESCE(c.cheie, lde_fuel_cheie(s.placuta_norm)) AS k
    FROM lde_fuel_strain s LEFT JOIN lde_fuel_consumator_corectie c ON c.placuta_norm = s.placuta_norm
  ), g AS (
    SELECT k,
      mode() WITHIN GROUP (ORDER BY placuta) AS den,
      array_agg(DISTINCT placuta_norm) AS var,
      array_agg(DISTINCT sursa) FILTER (WHERE zi BETWEEN de AND pana) AS sur,
      count(*) FILTER (WHERE zi BETWEEN de AND pana) AS n,
      COALESCE(sum(litri) FILTER (WHERE zi BETWEEN de AND pana), 0) AS l,
      count(*) AS n_tot, sum(litri) AS l_tot, min(zi) AS mn, max(zi) AS mx,
      min(zi) FILTER (WHERE zi BETWEEN de AND pana) AS mn_p, max(zi) FILTER (WHERE zi BETWEEN de AND pana) AS mx_p,
      bool_or(sursa = 'foaie') AS pe_foaie, bool_and(categorie = 'masina') AS e_masina
    FROM s GROUP BY k
  )
  SELECT g.k,
    COALESCE(ct.denumire, g.den),
    COALESCE(ct.tip, CASE
      WHEN g.k = 'VANZARI'         THEN 'vanzare'
      WHEN g.k ~ '^BENZOVOZ'       THEN 'benzovoz'
      WHEN g.k = 'CONSUM INTERN'   THEN 'consum_intern'
      WHEN g.k = 'PROTOCOL'        THEN 'protocol'
      WHEN g.k IN ('GENERATOR','USCATOR','COMBINA','K700','T150','EXAVATOR','EXCAVATOR','TRACTOR','BULDOZER','MTZ') THEN 'utilaj'
      WHEN g.k ~ '^[0-9]{2,4}$'    THEN 'numar_scurt'
      WHEN g.e_masina AND g.pe_foaie THEN 'masina_foaie'
      WHEN g.e_masina              THEN 'masina_statie'
      ELSE 'nedefinit' END),
    g.var, COALESCE(g.sur, '{}'), g.n, g.l, g.n_tot, g.l_tot, g.mn, g.mx, g.mn_p, g.mx_p
  FROM g
  LEFT JOIN LATERAL (SELECT c.denumire, c.tip FROM lde_fuel_consumator_corectie c
                     WHERE c.placuta_norm = ANY (g.var) AND (c.denumire IS NOT NULL OR c.tip IS NOT NULL)
                     ORDER BY c.updated_at DESC LIMIT 1) ct ON true
$$;

-- Funcții recreate → drepturile de la zero: fără PUBLIC/anon, doar service_role (serverul panoului).
REVOKE EXECUTE ON FUNCTION lde_fuel_flota(date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lde_fuel_consumatori(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_flota(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION lde_fuel_consumatori(date, date) TO service_role;
