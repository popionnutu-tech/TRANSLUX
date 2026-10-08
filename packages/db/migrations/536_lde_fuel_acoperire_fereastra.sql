-- 536: fereastra de acoperire a foii LDE de către fișiere (migr. 534) — ±1 zi la autobuze, ±4 zile la camioane.
-- Proba pe septembrie cu fișierele reale (ROLLBACK): la camioane plinul e scris pe foaia LDE la sfârșitul cursei, la mai
-- mult de o zi de alimentare — KWX620 avea 475 l acoperiți doar pe jumătate (Δ +475 l fals). Zilele se încearcă de la
-- cea mai apropiată spre cea mai depărtată (d, d−1, d+1, d−2, d+2, …).
CREATE OR REPLACE FUNCTION lde_fuel_acoperire_calc(p_de date, p_pana date) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE pr record; f record; dz date; disp numeric; luat numeric; ramas numeric; acop numeric; n integer := 0; w integer; zile date[];
BEGIN
  DELETE FROM lde_fuel_foaie_acoperire WHERE zi BETWEEN p_de AND p_pana;
  CREATE TEMP TABLE IF NOT EXISTS _disp (zi date PRIMARY KEY, rest numeric) ON COMMIT DROP;
  FOR pr IN SELECT DISTINCT f2.vehicle_id, lde_fuel_foaie_sursa(f2.foaie) AS sursa,
                   CASE WHEN 'camioane' = ANY (v.directions) THEN 4 ELSE 1 END AS w
            FROM lde_fuel_foaie f2 JOIN vehicles v ON v.id = f2.vehicle_id
            WHERE f2.zi BETWEEN p_de AND p_pana AND lde_fuel_foaie_sursa(f2.foaie) IS NOT NULL LOOP
    w := pr.w;
    DELETE FROM _disp;
    INSERT INTO _disp (zi, rest)
    SELECT r.zi_local, sum(r.litri) FROM lde_fuel_import_rand r
    WHERE r.vehicle_id = pr.vehicle_id AND r.sursa = pr.sursa AND r.stare = 'legat' AND r.este_dt
      AND r.zi_local BETWEEN p_de - w AND p_pana + w AND lde_fuel_rand_activ(r.external_id)
    GROUP BY r.zi_local;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM _disp);
    FOR f IN SELECT f3.external_id, f3.zi, f3.litri FROM lde_fuel_foaie f3
             WHERE f3.vehicle_id = pr.vehicle_id AND lde_fuel_foaie_sursa(f3.foaie) = pr.sursa AND f3.zi BETWEEN p_de AND p_pana
             ORDER BY f3.zi, f3.external_id LOOP
      ramas := f.litri; acop := 0;
      zile := ARRAY[f.zi];
      FOR k IN 1..w LOOP zile := zile || ARRAY[f.zi - k, f.zi + k]; END LOOP;
      FOREACH dz IN ARRAY zile LOOP
        EXIT WHEN ramas <= 0;
        SELECT rest INTO disp FROM _disp WHERE zi = dz;
        IF FOUND AND disp > 0 THEN
          luat := least(disp, ramas);
          UPDATE _disp SET rest = rest - luat WHERE zi = dz;
          ramas := ramas - luat; acop := acop + luat;
        END IF;
      END LOOP;
      IF acop > 0 THEN
        INSERT INTO lde_fuel_foaie_acoperire (foaie_external_id, sursa, vehicle_id, zi, acoperit)
        VALUES (f.external_id, pr.sursa, pr.vehicle_id, f.zi, acop)
        ON CONFLICT (foaie_external_id) DO UPDATE SET acoperit = excluded.acoperit, sursa = excluded.sursa,
          vehicle_id = excluded.vehicle_id, zi = excluded.zi, calculat_la = now();
        n := n + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION lde_fuel_acoperire_calc(date, date) FROM PUBLIC, anon, authenticated;

-- vederea: «E dublură» se aplică dacă există import în fereastra mașinii (±1 / ±4 zile la camioane)
CREATE OR REPLACE VIEW lde_fuel_foaie_ef AS
SELECT f.id, f.vehicle_id, f.zi, x.litri_ef AS litri, f.foaie, f.external_id, f.sofer, f.km_total, f.imported_at
FROM lde_fuel_foaie f
LEFT JOIN lde_fuel_foaie_acoperire a ON a.foaie_external_id = f.external_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN lde_fuel_foaie_sursa(f.foaie) IS NOT NULL AND EXISTS (
           SELECT 1 FROM lde_fuel_foaie_decizie d
           WHERE d.vehicle_id = f.vehicle_id AND d.zi = f.zi AND d.sursa = lde_fuel_foaie_sursa(f.foaie)
             AND EXISTS (SELECT 1 FROM lde_fuel_import_rand r
                         WHERE r.vehicle_id = f.vehicle_id AND r.sursa = d.sursa AND r.stare = 'legat' AND r.este_dt
                           AND r.zi_local BETWEEN f.zi - 4 AND f.zi + 4 AND lde_fuel_rand_activ(r.external_id)))
      THEN 0::numeric
    ELSE greatest(f.litri - coalesce(a.acoperit, 0), 0) END AS litri_ef
) x
WHERE x.litri_ef > 0.005;
REVOKE ALL ON lde_fuel_foaie_ef FROM anon, authenticated;
