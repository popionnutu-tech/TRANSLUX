-- 437: norma teoretică separat de cea măsurată, pentru posterul lunar de combustibil (ION-138)
--
-- Ion, 29.09.2026: «acolo unde este norma de pus: 1. norma factică luna curentă, 2. norma factică ultimele 3 luni,
-- 3. norma teoretică». lde_fuel_flota dădea o singură normă (măsurată, altfel a tipului); acum dă și
-- norma_teoretica = norma tipului mașinii (lde_vehicle_types.norm_l_per_100km). Faptica pe lună și pe 3 luni vin din
-- aceeași funcție chemată pe cele două perioade (litri_cu_km / km).
DROP FUNCTION IF EXISTS lde_fuel_flota(date, date);
CREATE FUNCTION lde_fuel_flota(de date, pana date)
RETURNS TABLE (vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[],
               benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric,
               km numeric, km_zile_gps bigint, km_zile_lde bigint, km_prima date, litri_cu_km numeric,
               norma numeric, norma_teoretica numeric, prima date, ultima date)
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
    t.norm_l_per_100km,
    LEAST(b.mn, f.mn), GREATEST(b.mx, f.mx)
  FROM vehicles v
  LEFT JOIN b ON b.vehicle_id = v.id
  LEFT JOIN f ON f.vehicle_id = v.id
  LEFT JOIN k ON k.vehicle_id = v.id
  LEFT JOIN lk ON lk.vehicle_id = v.id
  LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id
  LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
$$;

REVOKE EXECUTE ON FUNCTION lde_fuel_flota(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_flota(date, date) TO service_role;
