-- 445: ION-145 — Ion, 29.09.2026: «foile nu trebuia scoase, mașina poate să consume mult dt». Foile de cisternă (pz_camcer) intră iar
-- toate în consum (și în plin la plin); rămân doar cele două reparații din 444: km fantomă de parcare și plinul de după ultima cursă a lunii.
-- lde_fuel_foaie_de_verificat se șterge în 445b, după ce posterul nu o mai cheamă.
CREATE OR REPLACE FUNCTION public.lde_fuel_flota(de date, pana date)
 RETURNS TABLE(vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[], benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric, km numeric, km_zile_gps bigint, km_zile_lde bigint, km_prima date, litri_cu_km numeric, norma numeric, norma_teoretica numeric, prima date, ultima date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
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
    -- ION-145: ziua de parcare (km reali < 5) nu aduce km cârpiți
    SELECT d.vehicle_id, d.date AS zi,
      CASE WHEN COALESCE(d.km_patched, 0) > 0 AND d.km_total - d.km_patched < 5 THEN greatest(d.km_total - d.km_patched, 0) ELSE d.km_total END AS km
    FROM lde_vehicle_gps_daily d WHERE d.date BETWEEN de AND pana AND d.km_total > 0
  ), m AS (
    SELECT vehicle_id, zi, sum(km) AS km FROM lde_km_m2m WHERE zi BETWEEN de AND pana GROUP BY 1, 2
  ), k AS (
    SELECT COALESCE(g.vehicle_id, m.vehicle_id) AS vehicle_id,
      sum(COALESCE(g.km, m.km)) AS km, count(g.km) AS zile_gps, count(*) FILTER (WHERE g.km IS NULL) AS zile_lde,
      min(COALESCE(g.zi, m.zi)) FILTER (WHERE COALESCE(g.km, m.km) > 0) AS km_prima,
      max(COALESCE(g.zi, m.zi)) FILTER (WHERE COALESCE(g.km, m.km) >= 20) AS km_ultima
    FROM g FULL JOIN m ON m.vehicle_id = g.vehicle_id AND m.zi = g.zi
    GROUP BY 1
  ), lk AS (
    -- ION-145: litrii de la prima zi cu km până la ultima zi cu drum; plinul de după ultima cursă e al lunii următoare
    SELECT k.vehicle_id, COALESCE((SELECT sum(a.litri) FROM lde_fuel_alimentari a WHERE a.vehicle_id = k.vehicle_id
               AND a.alimentat_at >= (k.km_prima::timestamp AT TIME ZONE 'Europe/Chisinau')
               AND a.alimentat_at <  ((k.km_ultima + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')), 0)
         + COALESCE((SELECT sum(f.litri) FROM lde_fuel_foaie f WHERE f.vehicle_id = k.vehicle_id
               AND f.zi BETWEEN k.km_prima AND k.km_ultima), 0) AS l
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
$function$;

CREATE OR REPLACE FUNCTION public.lde_fuel_plin_la_plin(de date, pana date, vehicule uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(vehicle_id uuid, intervale bigint, litri numeric, km numeric, consum numeric, plin_tipic numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH al AS (
    SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri FROM lde_fuel_alimentari a
    WHERE a.alimentat_at >= (de::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')
      AND (vehicule IS NULL OR a.vehicle_id = ANY (vehicule))
    UNION ALL
    SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie f
    WHERE f.zi BETWEEN de AND pana AND (vehicule IS NULL OR f.vehicle_id = ANY (vehicule))
  ), ref AS (
    SELECT al.vehicle_id, percentile_cont(0.9) WITHIN GROUP (ORDER BY al.litri) AS p90 FROM al GROUP BY 1
  ), plin AS (
    SELECT DISTINCT al.vehicle_id, al.zi FROM al JOIN ref USING (vehicle_id) WHERE al.litri >= 0.85 * ref.p90
  ), iv AS (
    SELECT p.vehicle_id, p.zi AS z1, lead(p.zi) OVER (PARTITION BY p.vehicle_id ORDER BY p.zi) AS z2 FROM plin p
  ), kmzi AS (
    SELECT COALESCE(g.vehicle_id, m.vehicle_id) AS vehicle_id, COALESCE(g.zi, m.zi) AS zi, COALESCE(g.km, m.km) AS km
    FROM (SELECT d.vehicle_id, d.date AS zi,
            CASE WHEN COALESCE(d.km_patched, 0) > 0 AND d.km_total - d.km_patched < 5 THEN greatest(d.km_total - d.km_patched, 0) ELSE d.km_total END AS km
          FROM lde_vehicle_gps_daily d
          WHERE d.date BETWEEN de AND pana AND d.km_total > 0 AND (vehicule IS NULL OR d.vehicle_id = ANY (vehicule))) g
    FULL JOIN (SELECT k.vehicle_id, k.zi, sum(k.km) AS km FROM lde_km_m2m k
               WHERE k.zi BETWEEN de AND pana AND (vehicule IS NULL OR k.vehicle_id = ANY (vehicule)) GROUP BY 1, 2) m
      ON m.vehicle_id = g.vehicle_id AND m.zi = g.zi
  ), il AS (
    SELECT iv.vehicle_id, iv.z1, sum(al.litri) AS l FROM iv JOIN al ON al.vehicle_id = iv.vehicle_id AND al.zi > iv.z1 AND al.zi <= iv.z2
    WHERE iv.z2 IS NOT NULL GROUP BY 1, 2
  ), ik AS (
    SELECT iv.vehicle_id, iv.z1, sum(k.km) AS km FROM iv JOIN kmzi k ON k.vehicle_id = iv.vehicle_id AND k.zi >= iv.z1 AND k.zi < iv.z2
    WHERE iv.z2 IS NOT NULL GROUP BY 1, 2
  )
  SELECT il.vehicle_id, count(*), sum(il.l), sum(ik.km), round(100 * sum(il.l) / NULLIF(sum(ik.km), 0), 1), max(ref.p90)
  FROM il JOIN ik USING (vehicle_id, z1) JOIN ref USING (vehicle_id)
  WHERE ik.km >= 300
  GROUP BY il.vehicle_id
$function$;

