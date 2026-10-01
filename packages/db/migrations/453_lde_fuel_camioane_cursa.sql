-- 453: ION-162 — luna unui camion = cursele PORNITE în lună, urmărite până la plinul următor (km doar din GPS)
--
-- Clava, 01.10.2026, pe posterul din august: «km nu coincid cu LDE» și «soldul rămas în bac se calculează? pe 31.08 au făcut plin,
-- s-au pregătit pentru RO». Ion: «hai să nu umblăm la LDE, el poate fi manipulat», «hai să mărim diapazonul odată cu cursa terminată»,
-- «numărul de km doar din GPS».
-- Până acum luna camionului = zilele calendaristice cu km: cursa din 28.07 își lăsa jumătate din km în iulie și plinul în iulie,
-- plinul din 31.08 pentru cursa din septembrie nu intra nicăieri, iar plinul de la sfârșitul lui iulie lipsea din august.
--  * cursa = de la o zi cu alimentare (benzol în ziua Chișinăului ∪ foaie) până la următoarea; km-ii zilei plinului sunt ai cursei noi
--    (camionul alimentează înainte de plecare);
--  * cursa ține de perioada zilei de PLECARE: prima zi a cursei cu km GPS ≥ 20 (cârpeala de parcare scoasă ca în 444);
--  * cursa cu plecare intră mereu; plinul după care mașina nu pleacă (stă până la alt plin) merge cu cursa următoare dacă plecarea e în ≤ 10 zile; altfel e plin fără
--    drum și nu intră în nicio lună (IIC230, KYK692, QDQ419: alimentări din aprilie–iunie, GPS cu drum abia din august);
--  * fereastra perioadei = [primul plin al curselor ei, plinul de după ultima ei cursă) — poate trece în luna următoare;
--    fără plin următor cursa e deschisă: fereastra merge până la ultima zi cu GPS (cursa_deschisa = true);
--  * km = GPS în fereastră, litri_cu_km = benzol + foi în fereastră; km din LDE (km_m2m, pz_camcer) NU se folosesc la camioane.
--  * camionul fără nicio alimentare în ±120 de zile rămâne pe zilele calendaristice din GPS (să se vadă km fără motorină);
-- Celelalte mașini: neschimbate (fereastra ION-145). lde_fuel_norma_eb citește lde_fuel_flota, deci învață pe aceleași ferestre.

DROP FUNCTION IF EXISTS public.lde_fuel_flota(date, date);

CREATE FUNCTION public.lde_fuel_flota(de date, pana date)
 RETURNS TABLE(vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[], benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric, km numeric, km_zile_gps bigint, km_zile_lde bigint, km_prima date, litri_cu_km numeric, norma numeric, norma_teoretica numeric, prima date, ultima date, fereastra_de date, fereastra_pana date, cursa_deschisa boolean)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH cam AS (
    SELECT v.id FROM vehicles v WHERE 'camioane' = ANY (v.directions)
  ), b AS (
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
  ), cal AS (   -- ION-162: zilele cu alimentare ale camioanelor, cu marjă pentru cursele care trec peste capetele perioadei
    SELECT x.vehicle_id, x.zi, sum(x.l) AS l FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri AS l FROM lde_fuel_alimentari a
      WHERE a.vehicle_id IN (SELECT id FROM cam)
        AND a.alimentat_at >= ((de - 120)::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < ((pana + 121)::timestamp AT TIME ZONE 'Europe/Chisinau')
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie f
      WHERE f.vehicle_id IN (SELECT id FROM cam) AND f.zi BETWEEN de - 120 AND pana + 120
    ) x WHERE x.l > 0 GROUP BY 1, 2
  ), ckm AS (   -- km doar din GPS
    SELECT d.vehicle_id, d.date AS zi,
      CASE WHEN COALESCE(d.km_patched, 0) > 0 AND d.km_total - d.km_patched < 5 THEN greatest(d.km_total - d.km_patched, 0) ELSE d.km_total END AS km
    FROM lde_vehicle_gps_daily d
    WHERE d.vehicle_id IN (SELECT id FROM cam) AND d.date BETWEEN de - 120 AND pana + 120 AND d.km_total > 0
  ), ctr AS (
    SELECT c.vehicle_id, c.zi AS f1, lead(c.zi) OVER (PARTITION BY c.vehicle_id ORDER BY c.zi) AS f2 FROM cal c
  ), cpl AS (   -- ziua plecării fiecărei curse
    SELECT t.*, (SELECT min(k.zi) FROM ckm k WHERE k.vehicle_id = t.vehicle_id AND k.zi >= t.f1 AND (t.f2 IS NULL OR k.zi < t.f2) AND k.km >= 20) AS pleaca
    FROM ctr t
  ), cef AS (   -- plinul fără plecare merge cu prima plecare de după el, dacă e în ≤ 10 zile
    SELECT p.*, min(p.pleaca) OVER (PARTITION BY p.vehicle_id ORDER BY p.f1 DESC ROWS UNBOUNDED PRECEDING) AS pleaca_ef FROM cpl p
  ), cw AS (
    SELECT e.vehicle_id, min(e.f1) AS w0, max(e.f2) AS w1, bool_or(e.f2 IS NULL) AS deschisa
    FROM cef e WHERE e.pleaca_ef BETWEEN de AND pana AND (e.pleaca IS NOT NULL OR e.pleaca_ef - e.f1 <= 10)
    GROUP BY 1
  ), cwe AS (
    SELECT w.vehicle_id, w.w0, w.deschisa,
      CASE WHEN w.deschisa THEN (SELECT max(k.zi) FROM ckm k WHERE k.vehicle_id = w.vehicle_id) ELSE w.w1 - 1 END AS w_pana
    FROM cw w
  ), cr AS (
    SELECT w.*,
      COALESCE((SELECT sum(k.km) FROM ckm k WHERE k.vehicle_id = w.vehicle_id AND k.zi BETWEEN w.w0 AND w.w_pana), 0) AS km,
      COALESCE((SELECT sum(c.l) FROM cal c WHERE c.vehicle_id = w.vehicle_id AND c.zi BETWEEN w.w0 AND w.w_pana), 0) AS l
    FROM cwe w
  )
  SELECT v.id, v.plate_number, v.active, v.is_lde, v.directions,
    COALESCE(b.n, 0), COALESCE(b.l, 0), COALESCE(f.n, 0), COALESCE(f.l, 0),
    CASE WHEN c.id IS NOT NULL THEN COALESCE(cr.km, 0) ELSE COALESCE(k.km, 0) END,
    COALESCE(k.zile_gps, 0), COALESCE(k.zile_lde, 0),
    CASE WHEN c.id IS NOT NULL THEN cr.w0 ELSE k.km_prima END,
    CASE WHEN c.id IS NOT NULL THEN COALESCE(cr.l, 0) ELSE COALESCE(lk.l, 0) END,
    -- ION-154: măsurarea contează doar pentru perioadele de după ea
    COALESCE(CASE WHEN n.measurement_date < de THEN COALESCE(n.measured_consumption_l_per_100km_loaded, n.measured_consumption_l_per_100km) END,
             t.norm_l_per_100km),
    t.norm_l_per_100km,
    LEAST(b.mn, f.mn), GREATEST(b.mx, f.mx),
    cr.w0, cr.w_pana, cr.deschisa
  FROM vehicles v
  LEFT JOIN (SELECT DISTINCT cal.vehicle_id AS id FROM cal) c ON c.id = v.id   -- camion cu alimentări: pe curse; fără niciuna: zilele calendaristice
  LEFT JOIN b ON b.vehicle_id = v.id
  LEFT JOIN f ON f.vehicle_id = v.id
  LEFT JOIN k ON k.vehicle_id = v.id
  LEFT JOIN lk ON lk.vehicle_id = v.id
  LEFT JOIN cr ON cr.vehicle_id = v.id
  LEFT JOIN lde_vehicle_norms n ON n.vehicle_id = v.id
  LEFT JOIN lde_vehicle_types t ON t.id = n.vehicle_type_id
$function$;

REVOKE EXECUTE ON FUNCTION lde_fuel_flota(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_flota(date, date) TO service_role;
