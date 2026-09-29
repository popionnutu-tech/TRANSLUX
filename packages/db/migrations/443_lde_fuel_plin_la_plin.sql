-- 443: consumul «plin la plin» pe mașină (ION-138)
--
-- Ion, 29.09.2026, pe posterul camioanelor (KYK692 88 l/100, QDQ357 114): nu era dublă introducere — plinul de la
-- începutul și sfârșitul lunii cade în lună, iar camioanele lucrează doar câteva zile (KYK692: 8 zile cu km în august).
-- «Cum identifici plin de la plin?» → «refacem norma începând cu iunie» → «fă amândouă». Metoda (probată pe camioane
-- 10.06–29.09: 32–44 l/100 km, față de 29–114 pe luna calendaristică):
--   plin = alimentarea de ≥ 85 % din plinul obișnuit al mașinii (percentila 90 a alimentărilor ei în perioadă);
--   consum = litrii turnați DUPĂ primul plin până la ultimul plin inclusiv / km între cele două pliniri;
--   intervalele sub 300 km (pliniri în aceeași zi, mașina oprită) nu intră.
-- Alimentările = benzol (lde_fuel_alimentari) + foile LDE (lde_fuel_foaie); km = GPS-ul nostru pe zi, altfel km_m2m (LDE).
-- Marja: ±15–20 % pe o lună, ±5–10 % pe 3 luni, ±3–5 % pe 6–12 luni (dominată de km-ii GPS).
-- `vehicule` (opțional) îngustează calculul; fără el, toată flota (lent — posterul îl cheamă doar pe camioane).
-- (Aplicată întâi fără `vehicule` și cu subinterogări corelate; a expirat pe toată flota — înlocuită în aceeași zi.)

DROP FUNCTION IF EXISTS lde_fuel_plin_la_plin(date, date);
CREATE OR REPLACE FUNCTION lde_fuel_plin_la_plin(de date, pana date, vehicule uuid[] DEFAULT NULL)
RETURNS TABLE (vehicle_id uuid, intervale bigint, litri numeric, km numeric, consum numeric, plin_tipic numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
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
    FROM (SELECT d.vehicle_id, d.date AS zi, d.km_total AS km FROM lde_vehicle_gps_daily d
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
$$;

REVOKE EXECUTE ON FUNCTION lde_fuel_plin_la_plin(date, date, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_plin_la_plin(date, date, uuid[]) TO service_role;
