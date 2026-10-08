-- 542: chemată prin API (rpc din pagina Clavei și din tlx-qr-worker), lde_fuel_acoperire_calc pica cu «DELETE requires a
-- WHERE clause» (pg_safeupdate pe rolurile PostgREST) la golirea tabelului temporar. Testele din psql nu o prindeau.

CREATE OR REPLACE FUNCTION lde_fuel_acoperire_calc(p_de date, p_pana date) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE pr record; f record; dz date; s text; disp numeric; luat numeric; ramas numeric; acop numeric; n integer := 0;
  w integer; zile date[]; luate text[];
BEGIN
  DELETE FROM lde_fuel_foaie_acoperire WHERE zi BETWEEN p_de AND p_pana;
  CREATE TEMP TABLE IF NOT EXISTS _disp2 (zi date, sursa text, rest numeric, PRIMARY KEY (zi, sursa)) ON COMMIT DROP;
  FOR pr IN SELECT DISTINCT f2.vehicle_id, CASE WHEN 'camioane' = ANY (v.directions) THEN 4 ELSE 1 END AS w
            FROM lde_fuel_foaie f2 JOIN vehicles v ON v.id = f2.vehicle_id
            WHERE f2.zi BETWEEN p_de AND p_pana AND lde_fuel_foaie_surse(f2.foaie) IS NOT NULL LOOP
    w := pr.w;
    DELETE FROM _disp2 WHERE true;   -- PostgREST (pg_safeupdate) refuză DELETE fără WHERE
    INSERT INTO _disp2 (zi, sursa, rest)
    SELECT r.zi_local, r.sursa, sum(r.litri) FROM lde_fuel_import_rand r
    WHERE r.vehicle_id = pr.vehicle_id AND r.stare = 'legat' AND r.este_dt
      AND r.zi_local BETWEEN p_de - w AND p_pana + w AND lde_fuel_rand_activ(r.external_id)
    GROUP BY r.zi_local, r.sursa;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM _disp2);
    FOR f IN SELECT f3.external_id, f3.zi, f3.litri, lde_fuel_foaie_surse(f3.foaie) AS surse FROM lde_fuel_foaie f3
             WHERE f3.vehicle_id = pr.vehicle_id AND lde_fuel_foaie_surse(f3.foaie) IS NOT NULL AND f3.zi BETWEEN p_de AND p_pana
             ORDER BY f3.zi, f3.external_id LOOP
      ramas := f.litri; acop := 0; luate := ARRAY[]::text[];
      zile := ARRAY[f.zi];
      FOR k IN 1..w LOOP zile := zile || ARRAY[f.zi - k, f.zi + k]; END LOOP;
      FOREACH dz IN ARRAY zile LOOP
        EXIT WHEN ramas <= 0;
        FOREACH s IN ARRAY f.surse LOOP
          EXIT WHEN ramas <= 0;
          SELECT rest INTO disp FROM _disp2 WHERE zi = dz AND sursa = s;
          IF FOUND AND disp > 0 THEN
            luat := least(disp, ramas);
            UPDATE _disp2 SET rest = rest - luat WHERE zi = dz AND sursa = s;
            ramas := ramas - luat; acop := acop + luat;
            IF NOT s = ANY (luate) THEN luate := luate || s; END IF;
          END IF;
        END LOOP;
      END LOOP;
      IF acop > 0 THEN
        INSERT INTO lde_fuel_foaie_acoperire (foaie_external_id, sursa, vehicle_id, zi, acoperit)
        VALUES (f.external_id, array_to_string(luate, '+'), pr.vehicle_id, f.zi, acop)
        ON CONFLICT (foaie_external_id) DO UPDATE SET acoperit = excluded.acoperit, sursa = excluded.sursa,
          vehicle_id = excluded.vehicle_id, zi = excluded.zi, calculat_la = now();
        n := n + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION lde_fuel_acoperire_calc(date, date) FROM PUBLIC, anon, authenticated;
