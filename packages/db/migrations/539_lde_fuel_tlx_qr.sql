-- 539: alimentările parcului cu QR la stațiile TLX (Reovis) intră automat în evidența motorinei.
-- Ion, 08.10.2026: «noi am dat la Reovis QR cod alimentări auto parc, trebuie aceste alimentări să le legăm de sistemul
-- evidență motorină». În baza TLX parcul e clientul corporativ «Pat 9» cu 93 de QR-uri (sub-conturi), fiecare cu plăcuța
-- mașinii; 2.268 de alimentări diesel din 28.05.2026. Verificat pe sept.: foaia LDE `pz_c` (introdusă de mână) = exact
-- alimentările TLX pe mașină (541NPL 2.615 = 2.615, 584BRAX 1.472 = 1.472 …); la camioane și în `pz_i` foile amestecă
-- TLX cu Intelect.
--  * sursa nouă 'tlx' în tabelele importului (migr. 533);
--  * foaia → surse (mai multe): pz_cd → {petrom}; pz_u → {intelect}; pz_c → {tlx}; pz_i, pz_camcer → {intelect, tlx};
--    acoperirea scade din foaie alimentările oricărei surse a ei (aceeași mașină, ±1 zi / ±4 la camioane);
--  * lde_fuel_tlx_sync(jsonb): chemat noaptea de lde-geo-worker/tlx-qr-worker.mjs (VPS, are cheile TLX): un import
--    permanent «TLX automat», QR-ul cu plăcuță găsită în parc se leagă singur de mașină (fără să suprascrie ce a legat
--    Clava), anulările din TLX (is_reversed) ies, apoi legarea și proiecția.

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lde_fuel_import','lde_fuel_import_rand','lde_fuel_portofel','lde_fuel_rezerva_perioada','lde_fuel_statie','lde_fuel_foaie_decizie'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_sursa_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (sursa IN (''petrom'', ''intelect'', ''tlx''))', t, t || '_sursa_check');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION lde_fuel_foaie_surse(foaie text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN foaie = 'pz_cd' THEN ARRAY['petrom']
    WHEN foaie = 'pz_u' THEN ARRAY['intelect']
    WHEN foaie = 'pz_c' THEN ARRAY['tlx']
    WHEN foaie IN ('pz_i', 'pz_camcer') THEN ARRAY['intelect', 'tlx']
  END
$$;

-- acoperirea pe mai multe surse: pentru fiecare mașină, foile (ordinea zilelor) iau din alimentările surselor lor,
-- ziua cea mai apropiată întâi (±1 zi la autobuze, ±4 la camioane)
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
    DELETE FROM _disp2;
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

CREATE OR REPLACE VIEW lde_fuel_foaie_ef AS
SELECT f.id, f.vehicle_id, f.zi, x.litri_ef AS litri, f.foaie, f.external_id, f.sofer, f.km_total, f.imported_at
FROM lde_fuel_foaie f
LEFT JOIN lde_fuel_foaie_acoperire a ON a.foaie_external_id = f.external_id
CROSS JOIN LATERAL (
  SELECT CASE WHEN EXISTS (SELECT 1 FROM vehicles v WHERE v.id = f.vehicle_id AND 'camioane' = ANY (v.directions)) THEN 4 ELSE 1 END AS w
) fw
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN lde_fuel_foaie_surse(f.foaie) IS NOT NULL AND EXISTS (
           SELECT 1 FROM lde_fuel_foaie_decizie d
           WHERE d.vehicle_id = f.vehicle_id AND d.zi = f.zi AND d.sursa = ANY (lde_fuel_foaie_surse(f.foaie))
             AND EXISTS (SELECT 1 FROM lde_fuel_import_rand r
                         WHERE r.vehicle_id = f.vehicle_id AND r.sursa = d.sursa AND r.stare = 'legat' AND r.este_dt
                           AND r.zi_local BETWEEN f.zi - fw.w AND f.zi + fw.w AND lde_fuel_rand_activ(r.external_id)))
      THEN 0::numeric
    ELSE greatest(f.litri - coalesce(a.acoperit, 0), 0) END AS litri_ef
) x
WHERE x.litri_ef > 0.005;
REVOKE ALL ON lde_fuel_foaie_ef FROM anon, authenticated;

-- proiecția: și sursa 'tlx'
CREATE OR REPLACE FUNCTION lde_fuel_import_sincronizeaza(p_de date, p_pana date) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE n_up integer; n_del integer; n_acop integer;
  t0 timestamptz := (p_de::timestamp AT TIME ZONE 'Europe/Chisinau');
  t1 timestamptz := ((p_pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau');
BEGIN
  WITH elig AS (
    SELECT r.* FROM lde_fuel_import_rand r
    WHERE r.zi_local BETWEEN p_de AND p_pana AND r.stare = 'legat' AND r.este_dt AND r.vehicle_id IS NOT NULL
      AND lde_fuel_rand_activ(r.external_id))
  INSERT INTO lde_fuel_alimentari (vehicle_id, driver_id, alimentat_at, litri, suma_lei, statie, is_full, source, external_id, notes, imported_at)
  SELECT e.vehicle_id, e.driver_id, e.alimentat_at, e.litri, coalesce(e.suma, 0), coalesce(e.statie, ''), false, e.sursa, e.external_id,
         'fișier ' || e.sursa || ' · ' || e.cod || coalesce(' · ' || e.legat_prin, ''), now()
  FROM elig e
  ON CONFLICT (source, external_id) DO UPDATE SET vehicle_id = excluded.vehicle_id, driver_id = excluded.driver_id,
    alimentat_at = excluded.alimentat_at, litri = excluded.litri, suma_lei = excluded.suma_lei, statie = excluded.statie,
    notes = excluded.notes
  WHERE (lde_fuel_alimentari.vehicle_id, lde_fuel_alimentari.driver_id, lde_fuel_alimentari.litri, lde_fuel_alimentari.notes,
         lde_fuel_alimentari.alimentat_at)
        IS DISTINCT FROM (excluded.vehicle_id, excluded.driver_id, excluded.litri, excluded.notes, excluded.alimentat_at);
  GET DIAGNOSTICS n_up = ROW_COUNT;
  DELETE FROM lde_fuel_alimentari a
  WHERE a.source IN ('petrom', 'intelect', 'tlx') AND a.alimentat_at >= t0 AND a.alimentat_at < t1
    AND NOT EXISTS (SELECT 1 FROM lde_fuel_import_rand r
                    WHERE r.external_id = a.external_id AND r.sursa = a.source AND r.stare = 'legat' AND r.este_dt
                      AND r.vehicle_id IS NOT NULL AND lde_fuel_rand_activ(r.external_id));
  GET DIAGNOSTICS n_del = ROW_COUNT;
  n_acop := lde_fuel_acoperire_calc(p_de - 4, p_pana + 4);
  RETURN jsonb_build_object('scrise', n_up, 'scoase', n_del, 'foi_acoperite', n_acop);
END $$;

-- sincronizarea nocturnă din TLX: p = {de, pana, portofele:[{cod, nume_fisier, vehicle_id}], randuri:[…]}
-- (randuri = toate alimentările nereversate ale clientului «Pat 9» din [de, pana])
CREATE OR REPLACE FUNCTION lde_fuel_tlx_sync(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_de date := (p->>'de')::date; v_pana date := (p->>'pana')::date; v_noi integer; v_scoase integer; v_sync jsonb;
BEGIN
  SELECT id INTO v_id FROM lde_fuel_import WHERE sursa = 'tlx' AND sha256 = 'tlx-automat' AND anulat_la IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO lde_fuel_import (sursa, fisier_nume, sha256, de, pana, randuri, litri_dt, incarcat_de)
    VALUES ('tlx', 'TLX automat (QR «Pat 9»)', 'tlx-automat', v_de, v_pana, 0, 0, 'tlx-qr-worker') RETURNING id INTO v_id;
  END IF;

  -- QR-urile: plăcuța găsită în parc → mașina, singur; ce a legat deja Clava nu se atinge
  INSERT INTO lde_fuel_portofel (sursa, cod, nume_fisier, tip, vehicle_id, propus_vehicle_id, legat_de, legat_la)
  SELECT 'tlx', x->>'cod', x->>'nume_fisier',
         CASE WHEN nullif(x->>'vehicle_id', '') IS NOT NULL THEN 'masina' END,
         nullif(x->>'vehicle_id', '')::uuid, nullif(x->>'vehicle_id', '')::uuid,
         CASE WHEN nullif(x->>'vehicle_id', '') IS NOT NULL THEN 'tlx-qr-worker (plăcuța QR)' END,
         CASE WHEN nullif(x->>'vehicle_id', '') IS NOT NULL THEN now() END
  FROM jsonb_array_elements(p->'portofele') x
  ON CONFLICT (sursa, cod) DO UPDATE SET nume_fisier = excluded.nume_fisier,
    propus_vehicle_id = excluded.propus_vehicle_id,
    tip = coalesce(lde_fuel_portofel.tip, excluded.tip),
    vehicle_id = CASE WHEN lde_fuel_portofel.tip IS NULL THEN excluded.vehicle_id ELSE lde_fuel_portofel.vehicle_id END,
    legat_de = CASE WHEN lde_fuel_portofel.tip IS NULL THEN excluded.legat_de ELSE lde_fuel_portofel.legat_de END,
    legat_la = CASE WHEN lde_fuel_portofel.tip IS NULL THEN excluded.legat_la ELSE lde_fuel_portofel.legat_la END;

  INSERT INTO lde_fuel_import_rand (external_id, sursa, cod, alimentat_at, zi_local, litri, pret, reducere, suma, statie, produs, este_dt)
  SELECT x->>'external_id', 'tlx', x->>'cod', (x->>'alimentat_at')::timestamptz, (x->>'zi_local')::date, (x->>'litri')::numeric,
         nullif(x->>'pret', '')::numeric, NULL, nullif(x->>'suma', '')::numeric, x->>'statie', x->>'produs', (x->>'este_dt')::boolean
  FROM jsonb_array_elements(p->'randuri') x
  WHERE (x->>'litri')::numeric > 0
  ON CONFLICT (external_id) DO UPDATE SET litri = excluded.litri, alimentat_at = excluded.alimentat_at, zi_local = excluded.zi_local,
    pret = excluded.pret, suma = excluded.suma, statie = excluded.statie, produs = excluded.produs, este_dt = excluded.este_dt,
    actualizat_la = now()
  WHERE (lde_fuel_import_rand.litri, lde_fuel_import_rand.alimentat_at, lde_fuel_import_rand.statie)
        IS DISTINCT FROM (excluded.litri, excluded.alimentat_at, excluded.statie);
  GET DIAGNOSTICS v_noi = ROW_COUNT;

  INSERT INTO lde_fuel_import_leg (import_id, external_id)
  SELECT v_id, x->>'external_id' FROM jsonb_array_elements(p->'randuri') x WHERE (x->>'litri')::numeric > 0
  ON CONFLICT DO NOTHING;
  -- ce nu mai e în TLX în fereastră (anulat / șters) nu mai e susținut
  DELETE FROM lde_fuel_import_leg l USING lde_fuel_import_rand r
  WHERE l.import_id = v_id AND r.external_id = l.external_id AND r.zi_local BETWEEN v_de AND v_pana
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'randuri') x WHERE x->>'external_id' = l.external_id);
  GET DIAGNOSTICS v_scoase = ROW_COUNT;

  UPDATE lde_fuel_import i SET de = least(i.de, v_de), pana = greatest(i.pana, v_pana),
    randuri = (SELECT count(*) FROM lde_fuel_import_leg l WHERE l.import_id = v_id),
    litri_dt = (SELECT coalesce(sum(r.litri), 0) FROM lde_fuel_import_leg l JOIN lde_fuel_import_rand r USING (external_id)
                WHERE l.import_id = v_id AND r.este_dt),
    incarcat_la = now()
  WHERE i.id = v_id;

  PERFORM lde_fuel_releaga(v_de, v_pana);
  v_sync := lde_fuel_import_sincronizeaza(v_de, v_pana);
  RETURN jsonb_build_object('import_id', v_id, 'randuri_noi_sau_schimbate', v_noi, 'retrase', v_scoase, 'sync', v_sync);
END $$;

REVOKE EXECUTE ON FUNCTION lde_fuel_foaie_surse(text), lde_fuel_acoperire_calc(date, date), lde_fuel_import_sincronizeaza(date, date),
  lde_fuel_tlx_sync(jsonb) FROM PUBLIC, anon, authenticated;
