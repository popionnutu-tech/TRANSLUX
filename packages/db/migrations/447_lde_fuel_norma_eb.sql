-- 447: ION-154 — norma de combustibil fixată ÎNAINTE de luna judecată, din consumul pe 3 luni tras spre tipul mașinii (analiza ION-151)
--
-- Ion, 01.10.2026: «da» la metoda nouă, după 3 runde Claude + Codex (docs/plans/2026-09-30-combustibil-norma/RAPORT.md):
--  * posterul lua norma plin la plin până la sfârșitul lunii judecate → mașina care arde mult își ridica singură norma (aug.: 4 din 15
--    mașini peste +15 % ascunse). Acum norma lunii = cele 3 luni ÎNCHISE de dinainte; litrii lunii judecate n-o mai ating;
--  * N = (km·r_mașină + 5.000·r_tip) / (km + 5.000): mașina cu km puțini stă lângă tipul ei, cea cu km mulți pe consumul ei
--    (backtest 15 luni m2m: eroare 5,31 %, sigur sub plin la plin; pe GPS aug.–sep. la egalitate cu cele mai bune metode);
--  * r = Σ litri_cu_km / Σ km din lde_fuel_flota pe fiecare din cele 3 luni (aceeași fereastră a lunii ca posterul);
--    r_tip = același raport pe tipul mașinii (≥ 4 mașini cu ≥ 1.000 km), altfel pe categoria tipului;
--  * q = P90 al litrilor pe zi ai mașinii în cele 3 luni — pragul de abatere în litri e max(15 % / 20 % din normă·km, 2q);
--  * fără litri și km în cele 3 luni → norma veche: măsurată doar dacă e măsurată înainte de lună, altfel a tipului (sursa 'veche').
-- lde_fuel_flota: norma măsurată se aplică doar perioadelor de după măsurare (o măsurare din 29.09 schimba retroactiv lunile trecute).
-- lde_fuel_plin_la_plin (rămâne doar coloana de control «Din iunie»): plinul se ghicește pe TOTALUL ZILEI, nu pe fiecare alimentare
-- (P90 pe înregistrare schimba zilele de plin la 90 din 183 de mașini); întoarce și km-ii, posterul cere ≥ 3 intervale și ≥ 3.000 km.

CREATE OR REPLACE FUNCTION public.lde_fuel_norma_eb(luna date, vehicule uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(vehicle_id uuid, norma numeric, sursa text, r_masina numeric, km_calib numeric, litri_calib numeric,
               r_tip numeric, tip_cheie text, q numeric, calib_de date, calib_pana date)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT date_trunc('month', luna)::date AS m0, (date_trunc('month', luna) - interval '3 months')::date AS c0
  ), luni AS (
    SELECT (c.c0 + make_interval(months => i))::date AS de FROM c, generate_series(0, 2) i
  ), pm AS (   -- fiecare lună separat, ca pe poster (prima zi cu km → ultima zi cu drum), apoi însumat pe 3 luni
    SELECT f.vehicle_id, sum(f.litri_cu_km) AS l, sum(f.km) AS km
    FROM luni, LATERAL lde_fuel_flota(luni.de, (luni.de + interval '1 month' - interval '1 day')::date) f
    WHERE f.km > 0
    GROUP BY 1
  ), vt AS (
    SELECT v.id AS vehicle_id, n.vehicle_type_id AS tip, t.category AS cat, t.norm_l_per_100km AS norma_tip,
      CASE WHEN n.measurement_date < (SELECT m0 FROM c)
           THEN COALESCE(n.measured_consumption_l_per_100km_loaded, n.measured_consumption_l_per_100km) END AS masurata
    FROM vehicles v
    LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id
    LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
  ), bt AS (
    SELECT vt.tip, count(*) FILTER (WHERE pm.km >= 1000) AS n, 100 * sum(pm.l) / NULLIF(sum(pm.km), 0) AS r
    FROM pm JOIN vt USING (vehicle_id) WHERE vt.tip IS NOT NULL AND pm.l > 0 GROUP BY 1
  ), bc AS (
    SELECT vt.cat, 100 * sum(pm.l) / NULLIF(sum(pm.km), 0) AS r
    FROM pm JOIN vt USING (vehicle_id) WHERE vt.cat IS NOT NULL AND pm.l > 0 GROUP BY 1
  ), zi AS (   -- litrii pe zi (benzol în ora Chișinăului + foi) în cele 3 luni → q
    SELECT x.vehicle_id, x.zi, sum(x.litri) AS l FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri FROM lde_fuel_alimentari a, c
      WHERE a.alimentat_at >= (c.c0::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < (c.m0::timestamp AT TIME ZONE 'Europe/Chisinau')
        AND (vehicule IS NULL OR a.vehicle_id = ANY (vehicule))
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie f, c
      WHERE f.zi >= c.c0 AND f.zi < c.m0 AND (vehicule IS NULL OR f.vehicle_id = ANY (vehicule))
    ) x GROUP BY 1, 2
  ), qz AS (
    SELECT zi.vehicle_id, percentile_cont(0.9) WITHIN GROUP (ORDER BY zi.l) AS q FROM zi WHERE zi.l > 0 GROUP BY 1
  ), r AS (
    SELECT vt.vehicle_id, pm.km, pm.l,
      CASE WHEN pm.km > 0 AND pm.l > 0 THEN 100 * pm.l / pm.km END AS rm,
      CASE WHEN bt.n >= 4 THEN bt.r ELSE bc.r END AS rt,
      CASE WHEN bt.n >= 4 THEN vt.tip ELSE vt.cat END AS tk,
      COALESCE(vt.masurata, vt.norma_tip) AS veche
    FROM vt
    LEFT JOIN pm ON pm.vehicle_id = vt.vehicle_id
    LEFT JOIN bt ON bt.tip = vt.tip
    LEFT JOIN bc ON bc.cat = vt.cat
    WHERE vehicule IS NULL OR vt.vehicle_id = ANY (vehicule)
  )
  SELECT r.vehicle_id,
    round(CASE WHEN r.rm IS NOT NULL THEN (r.km * r.rm + 5000 * COALESCE(r.rt, r.veche, r.rm)) / (r.km + 5000) ELSE r.veche END, 2),
    CASE WHEN r.rm IS NOT NULL THEN 'eb' WHEN r.veche IS NOT NULL THEN 'veche' END,
    round(r.rm, 2), COALESCE(r.km, 0), COALESCE(r.l, 0), round(r.rt, 2), r.tk, round(qz.q::numeric, 1),
    (SELECT c0 FROM c), (SELECT m0 - 1 FROM c)
  FROM r LEFT JOIN qz ON qz.vehicle_id = r.vehicle_id
$function$;

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
    -- ION-154: măsurarea contează doar pentru perioadele de după ea
    COALESCE(CASE WHEN n.measurement_date < de THEN COALESCE(n.measured_consumption_l_per_100km_loaded, n.measured_consumption_l_per_100km) END,
             t.norm_l_per_100km),
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
  WITH al AS (   -- ION-154: totalul zilei (benzol + foi), nu fiecare alimentare
    SELECT x.vehicle_id, x.zi, sum(x.litri) AS litri FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri FROM lde_fuel_alimentari a
      WHERE a.alimentat_at >= (de::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')
        AND (vehicule IS NULL OR a.vehicle_id = ANY (vehicule))
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie f
      WHERE f.zi BETWEEN de AND pana AND (vehicule IS NULL OR f.vehicle_id = ANY (vehicule))
    ) x GROUP BY 1, 2
  ), ref AS (
    SELECT al.vehicle_id, percentile_cont(0.9) WITHIN GROUP (ORDER BY al.litri) AS p90 FROM al WHERE al.litri > 0 GROUP BY 1
  ), plin AS (
    SELECT al.vehicle_id, al.zi FROM al JOIN ref USING (vehicle_id) WHERE al.litri >= 0.85 * ref.p90
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

REVOKE EXECUTE ON FUNCTION lde_fuel_norma_eb(date, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_norma_eb(date, uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION lde_fuel_flota(date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lde_fuel_plin_la_plin(date, date, uuid[]) FROM PUBLIC, anon, authenticated;
