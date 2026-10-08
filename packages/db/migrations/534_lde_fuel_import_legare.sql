-- 534: încărcarea Petrom / Intelect — legarea, proiecția în lde_fuel_alimentari, foaia LDE fără dublură.
-- Plan: docs/plans/2026-10-08-import-combustibil-petrom-peco.md (pașii 4–5).
--  * legarea unui rând: portofel (mașină / șofer / grup / rezervă / în afara flotei); șofer → agrearea Clavei, apoi foaia
--    LDE a zilei (nume_lde confirmat), ambiguu → de_legat; grup → GPS la stația cu coordonate confirmate; manual = neatins;
--  * proiecția: rândurile legate + motorină + susținute de un import neanulat → lde_fuel_alimentari (source petrom/intelect),
--    restul se scot; aceeași funcție la import, anulare, re-legare, agreare și noaptea;
--  * foaia LDE: litri_ef = litri − acoperit (aceeași sursă, aceeași mașină, ziua ±1, în ordinea zilelor); pz_cd → Petrom;
--    pz_u, pz_i, pz_camcer → Intelect; pz_c și restul neatinse. «E dublură» doar scade și doar cât există importul.
--  * lde_fuel_flota, lde_fuel_plin_la_plin, lde_fuel_norma_eb citesc vederea lde_fuel_foaie_ef (corpul lor neschimbat).

CREATE INDEX IF NOT EXISTS idx_lde_fuel_foaie_zi ON lde_fuel_foaie (zi);

CREATE OR REPLACE FUNCTION lde_fuel_norm_nume(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(translate(lower(coalesce(t, '')), 'ăâîșşțţ', 'aaisstt'), '[^a-z]', '', 'g')
$$;
CREATE OR REPLACE FUNCTION lde_fuel_foaie_sursa(foaie text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN foaie = 'pz_cd' THEN 'petrom' WHEN foaie IN ('pz_u', 'pz_i', 'pz_camcer') THEN 'intelect' END
$$;

-- rând activ = susținut de cel puțin un import neanulat
CREATE OR REPLACE FUNCTION lde_fuel_rand_activ(p_ext text) RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM lde_fuel_import_leg l JOIN lde_fuel_import i ON i.id = l.import_id
                 WHERE l.external_id = p_ext AND i.anulat_la IS NULL)
$$;

-- mașina unui șofer într-o zi: agrearea, apoi foaia LDE; ambiguu sau lipsă → vehicle NULL + motiv
CREATE OR REPLACE FUNCTION lde_fuel_masina_sofer(p_driver uuid, p_nume_lde text, p_zi date, OUT vehicle_id uuid, OUT prin text, OUT motiv text)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v uuid[];
BEGIN
  SELECT array_agg(DISTINCT a.vehicle_id) INTO v FROM lde_agreare_sofer a
  WHERE a.driver_id = p_driver AND p_zi BETWEEN a.de AND a.pana;
  IF coalesce(array_length(v, 1), 0) = 1 THEN vehicle_id := v[1]; prin := 'agreare'; RETURN; END IF;
  IF coalesce(array_length(v, 1), 0) > 1 THEN motiv := 'agreat pe ' || array_length(v, 1) || ' mașini în ziua aceea'; RETURN; END IF;
  IF nullif(btrim(p_nume_lde), '') IS NULL THEN motiv := 'neagreat, iar numele din LDE nu e confirmat'; RETURN; END IF;
  SELECT array_agg(DISTINCT f.vehicle_id) INTO v FROM lde_fuel_foaie f
  WHERE f.zi = p_zi AND lde_fuel_norm_nume(f.sofer) = lde_fuel_norm_nume(p_nume_lde);
  IF coalesce(array_length(v, 1), 0) = 1 THEN vehicle_id := v[1]; prin := 'foaie_lde'; RETURN; END IF;
  IF coalesce(array_length(v, 1), 0) > 1 THEN motiv := 'pe foaia LDE pe ' || array_length(v, 1) || ' mașini în ziua aceea'; RETURN; END IF;
  motiv := 'neagreat și fără foaie LDE în ziua aceea';
END $$;

-- legarea unui rând (nu atinge legările manuale)
CREATE OR REPLACE FUNCTION lde_fuel_rand_leaga(p_ext text) RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  r lde_fuel_import_rand; p lde_fuel_portofel; per lde_fuel_rezerva_perioada; st lde_fuel_statie; ms record;
  n_veh uuid; n_drv uuid; n_stare text := 'de_legat'; n_prin text; n_motiv text; vv uuid[];
BEGIN
  SELECT * INTO r FROM lde_fuel_import_rand WHERE external_id = p_ext FOR UPDATE;
  IF NOT FOUND OR r.legat_prin = 'manual' THEN RETURN; END IF;
  IF NOT r.este_dt THEN
    n_stare := 'non_dt'; n_motiv := r.produs;
  ELSE
    SELECT * INTO p FROM lde_fuel_portofel WHERE sursa = r.sursa AND cod = r.cod;
    IF NOT FOUND OR p.tip IS NULL THEN
      n_motiv := 'cardul / portofelul nu e legat încă';
    ELSIF p.tip = 'masina' THEN
      n_veh := p.vehicle_id; n_stare := 'legat'; n_prin := 'portofel';
    ELSIF p.tip = 'strain' THEN
      n_stare := 'strain'; n_motiv := coalesce(p.categorie, 'în afara flotei');
    ELSIF p.tip = 'sofer' THEN
      n_drv := p.driver_id;
      SELECT * INTO ms FROM lde_fuel_masina_sofer(p.driver_id, p.nume_lde, r.zi_local);
      IF ms.vehicle_id IS NOT NULL THEN n_veh := ms.vehicle_id; n_stare := 'legat'; n_prin := ms.prin; ELSE n_motiv := ms.motiv; END IF;
    ELSIF p.tip = 'rezerva' THEN
      SELECT * INTO per FROM lde_fuel_rezerva_perioada
      WHERE sursa = r.sursa AND cod = r.cod AND r.zi_local BETWEEN de AND coalesce(pana, 'infinity'::date) LIMIT 1;
      IF NOT FOUND THEN
        n_motiv := 'rezerva n-are pe nimeni în ziua aceea';
      ELSIF per.vehicle_id IS NOT NULL THEN
        n_veh := per.vehicle_id; n_drv := per.driver_id; n_stare := 'legat'; n_prin := 'rezerva';
      ELSIF per.driver_id IS NOT NULL THEN
        n_drv := per.driver_id;
        SELECT * INTO ms FROM lde_fuel_masina_sofer(per.driver_id, NULL, r.zi_local);
        IF ms.vehicle_id IS NOT NULL THEN n_veh := ms.vehicle_id; n_stare := 'legat'; n_prin := 'rezerva'; ELSE n_motiv := 'rezervă: ' || ms.motiv; END IF;
      ELSE
        n_stare := 'strain'; n_motiv := 'rezervă: ' || coalesce(per.persoana_text, 'persoană din afara flotei');
      END IF;
    ELSIF p.tip = 'grup' THEN
      SELECT * INTO st FROM lde_fuel_statie WHERE sursa = r.sursa AND nume_fisier = r.statie AND confirmat;
      IF NOT FOUND OR st.lat IS NULL THEN
        n_motiv := 'stația nu are coordonate confirmate';
      ELSE
        SELECT array_agg(DISTINCT s.vehicle_id) INTO vv FROM lde_gps_stops s
        WHERE s.date BETWEEN r.zi_local - 1 AND r.zi_local + 1
          AND s.arrival_at <= r.alimentat_at + interval '20 minutes'
          AND coalesce(s.departure_at, s.arrival_at) >= r.alimentat_at - interval '20 minutes'
          AND 111320 * sqrt(power(s.lat - st.lat, 2) + power((s.lon - st.lon) * cos(radians(st.lat)), 2)) <= 300;
        IF coalesce(array_length(vv, 1), 0) = 1 THEN n_veh := vv[1]; n_stare := 'legat'; n_prin := 'gps';
        ELSIF coalesce(array_length(vv, 1), 0) > 1 THEN n_motiv := array_length(vv, 1) || ' mașini la stație la ora aceea';
        ELSE n_motiv := 'nicio mașină de-a noastră la stație la ora aceea'; END IF;
      END IF;
    END IF;
  END IF;
  IF n_veh IS DISTINCT FROM r.vehicle_id OR n_drv IS DISTINCT FROM r.driver_id OR n_stare IS DISTINCT FROM r.stare
     OR n_prin IS DISTINCT FROM r.legat_prin OR n_motiv IS DISTINCT FROM r.motiv THEN
    UPDATE lde_fuel_import_rand SET vehicle_id = n_veh, driver_id = n_drv, stare = n_stare, legat_prin = n_prin, motiv = n_motiv,
      actualizat_la = now() WHERE external_id = p_ext;
  END IF;
END $$;

-- re-legarea tuturor rândurilor automate dintr-un interval (opțional doar ale unor șoferi)
CREATE OR REPLACE FUNCTION lde_fuel_releaga(p_de date, p_pana date, p_soferi uuid[] DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE e text; n integer := 0;
BEGIN
  FOR e IN SELECT r.external_id FROM lde_fuel_import_rand r
           LEFT JOIN lde_fuel_portofel p ON p.sursa = r.sursa AND p.cod = r.cod
           WHERE r.zi_local BETWEEN p_de AND p_pana AND r.legat_prin IS DISTINCT FROM 'manual'
             AND (p_soferi IS NULL OR r.driver_id = ANY (p_soferi) OR p.driver_id = ANY (p_soferi)
                  OR EXISTS (SELECT 1 FROM lde_fuel_rezerva_perioada q WHERE q.sursa = r.sursa AND q.cod = r.cod AND q.driver_id = ANY (p_soferi)))
  LOOP PERFORM lde_fuel_rand_leaga(e); n := n + 1; END LOOP;
  RETURN n;
END $$;

-- cât din fiecare foaie LDE acoperă importul (aceeași sursă, aceeași mașină, ziua ±1, în ordinea zilelor)
CREATE OR REPLACE FUNCTION lde_fuel_acoperire_calc(p_de date, p_pana date) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE pr record; f record; dz date; disp numeric; luat numeric; ramas numeric; acop numeric; n integer := 0;
BEGIN
  DELETE FROM lde_fuel_foaie_acoperire WHERE zi BETWEEN p_de AND p_pana;
  CREATE TEMP TABLE IF NOT EXISTS _disp (zi date PRIMARY KEY, rest numeric) ON COMMIT DROP;
  FOR pr IN SELECT DISTINCT f2.vehicle_id, lde_fuel_foaie_sursa(f2.foaie) AS sursa FROM lde_fuel_foaie f2
            WHERE f2.zi BETWEEN p_de AND p_pana AND lde_fuel_foaie_sursa(f2.foaie) IS NOT NULL LOOP
    DELETE FROM _disp;
    INSERT INTO _disp (zi, rest)
    SELECT r.zi_local, sum(r.litri) FROM lde_fuel_import_rand r
    WHERE r.vehicle_id = pr.vehicle_id AND r.sursa = pr.sursa AND r.stare = 'legat' AND r.este_dt
      AND r.zi_local BETWEEN p_de - 1 AND p_pana + 1 AND lde_fuel_rand_activ(r.external_id)
    GROUP BY r.zi_local;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM _disp);
    -- foile în ordinea zilelor; fiecare ia întâi din ziua ei, apoi din ziua dinainte, apoi din cea de după
    FOR f IN SELECT f3.external_id, f3.zi, f3.litri FROM lde_fuel_foaie f3
             WHERE f3.vehicle_id = pr.vehicle_id AND lde_fuel_foaie_sursa(f3.foaie) = pr.sursa AND f3.zi BETWEEN p_de AND p_pana
             ORDER BY f3.zi, f3.external_id LOOP
      ramas := f.litri; acop := 0;
      FOREACH dz IN ARRAY ARRAY[f.zi, f.zi - 1, f.zi + 1] LOOP
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

-- proiecția în lde_fuel_alimentari: rândurile legate + motorină + active intră; restul (source petrom/intelect) ies
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
  WHERE (lde_fuel_alimentari.vehicle_id, lde_fuel_alimentari.driver_id, lde_fuel_alimentari.litri, lde_fuel_alimentari.notes)
        IS DISTINCT FROM (excluded.vehicle_id, excluded.driver_id, excluded.litri, excluded.notes);
  GET DIAGNOSTICS n_up = ROW_COUNT;
  DELETE FROM lde_fuel_alimentari a
  WHERE a.source IN ('petrom', 'intelect') AND a.alimentat_at >= t0 AND a.alimentat_at < t1
    AND NOT EXISTS (SELECT 1 FROM lde_fuel_import_rand r
                    WHERE r.external_id = a.external_id AND r.sursa = a.source AND r.stare = 'legat' AND r.este_dt
                      AND r.vehicle_id IS NOT NULL AND lde_fuel_rand_activ(r.external_id));
  GET DIAGNOSTICS n_del = ROW_COUNT;
  n_acop := lde_fuel_acoperire_calc(p_de - 1, p_pana + 1);
  RETURN jsonb_build_object('scrise', n_up, 'scoase', n_del, 'foi_acoperite', n_acop);
END $$;

-- un fișier încărcat: import + rânduri + legături + portofele noi, apoi legarea și proiecția — o singură tranzacție
CREATE OR REPLACE FUNCTION lde_fuel_import_aplica(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_sursa text := p->>'sursa'; v_de date := (p->>'de')::date; v_pana date := (p->>'pana')::date;
  v_noi integer; v_sync jsonb;
BEGIN
  IF v_sursa NOT IN ('petrom', 'intelect') THEN RAISE EXCEPTION 'sursă necunoscută'; END IF;
  IF EXISTS (SELECT 1 FROM lde_fuel_import WHERE sha256 = p->>'sha256' AND anulat_la IS NULL) THEN
    RAISE EXCEPTION 'Fișierul acesta e deja încărcat' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO lde_fuel_import (sursa, fisier_nume, sha256, de, pana, randuri, litri_dt, incarcat_de)
  VALUES (v_sursa, p->>'fisier_nume', p->>'sha256', v_de, v_pana, jsonb_array_length(p->'randuri'),
          coalesce((SELECT sum((x->>'litri')::numeric) FROM jsonb_array_elements(p->'randuri') x WHERE (x->>'este_dt')::boolean), 0),
          p->>'incarcat_de')
  RETURNING id INTO v_id;

  INSERT INTO lde_fuel_portofel (sursa, cod, nume_fisier, propus_vehicle_id)
  SELECT v_sursa, x->>'cod', x->>'nume_fisier', nullif(x->>'propus_vehicle_id', '')::uuid
  FROM jsonb_array_elements(p->'portofele') x
  ON CONFLICT (sursa, cod) DO UPDATE SET nume_fisier = excluded.nume_fisier,
    propus_vehicle_id = coalesce(lde_fuel_portofel.propus_vehicle_id, excluded.propus_vehicle_id);

  INSERT INTO lde_fuel_import_rand (external_id, sursa, cod, alimentat_at, zi_local, litri, pret, reducere, suma, statie, produs, este_dt)
  SELECT x->>'external_id', v_sursa, x->>'cod', (x->>'alimentat_at')::timestamptz, (x->>'zi_local')::date, (x->>'litri')::numeric,
         nullif(x->>'pret', '')::numeric, nullif(x->>'reducere', '')::numeric, nullif(x->>'suma', '')::numeric,
         x->>'statie', x->>'produs', (x->>'este_dt')::boolean
  FROM jsonb_array_elements(p->'randuri') x
  ON CONFLICT (external_id) DO NOTHING;
  GET DIAGNOSTICS v_noi = ROW_COUNT;

  INSERT INTO lde_fuel_import_leg (import_id, external_id)
  SELECT v_id, x->>'external_id' FROM jsonb_array_elements(p->'randuri') x
  ON CONFLICT DO NOTHING;

  PERFORM lde_fuel_releaga(v_de, v_pana);
  v_sync := lde_fuel_import_sincronizeaza(v_de, v_pana);
  RETURN jsonb_build_object('import_id', v_id, 'randuri_noi', v_noi, 'sync', v_sync);
END $$;

-- anularea unei încărcări: rândurile susținute doar de ea ies din proiecție, foile LDE revin
CREATE OR REPLACE FUNCTION lde_fuel_import_anuleaza(p_id uuid, p_cine text) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE i lde_fuel_import;
BEGIN
  UPDATE lde_fuel_import SET anulat_la = now(), anulat_de = p_cine WHERE id = p_id AND anulat_la IS NULL RETURNING * INTO i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Încărcarea nu există sau e deja anulată'; END IF;
  RETURN lde_fuel_import_sincronizeaza(i.de, i.pana);
END $$;

-- vederea foilor LDE fără partea acoperită de fișiere; aceleași coloane ca lde_fuel_foaie
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
                           AND r.zi_local BETWEEN f.zi - 1 AND f.zi + 1 AND lde_fuel_rand_activ(r.external_id)))
      THEN 0::numeric
    ELSE greatest(f.litri - coalesce(a.acoperit, 0), 0) END AS litri_ef
) x
WHERE x.litri_ef > 0.005;
COMMENT ON VIEW lde_fuel_foaie_ef IS
  'lde_fuel_foaie fără litrii acoperiți de fișierele Petrom/Intelect încărcate (migr. 534). Toți cititorii foii o folosesc.';
REVOKE ALL ON lde_fuel_foaie_ef FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION lde_fuel_norm_nume(text), lde_fuel_foaie_sursa(text), lde_fuel_rand_activ(text),
  lde_fuel_masina_sofer(uuid, text, date), lde_fuel_rand_leaga(text), lde_fuel_releaga(date, date, uuid[]),
  lde_fuel_acoperire_calc(date, date), lde_fuel_import_sincronizeaza(date, date), lde_fuel_import_aplica(jsonb),
  lde_fuel_import_anuleaza(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── cititorii foii trec pe vedere (corpurile de mai jos sunt cele din bază, doar «lde_fuel_foaie f» → «lde_fuel_foaie_ef f») ──
CREATE OR REPLACE FUNCTION public.lde_fuel_flota(de date, pana date)
 RETURNS TABLE(vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[], benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric, km numeric, km_zile_gps bigint, km_zile_lde bigint, km_prima date, litri_cu_km numeric, norma numeric, norma_teoretica numeric, prima date, ultima date, fereastra_de date, fereastra_pana date, cursa_deschisa boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
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
    FROM lde_fuel_foaie_ef f WHERE f.zi BETWEEN de AND pana GROUP BY f.vehicle_id
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
         + COALESCE((SELECT sum(f.litri) FROM lde_fuel_foaie_ef f WHERE f.vehicle_id = k.vehicle_id
               AND f.zi BETWEEN k.km_prima AND k.km_ultima), 0) AS l
    FROM k WHERE k.km_prima IS NOT NULL
  ), cal AS (   -- ION-162: zilele cu alimentare ale camioanelor, cu marjă pentru cursele care trec peste capetele perioadei
    SELECT x.vehicle_id, x.zi, sum(x.l) AS l FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri AS l FROM lde_fuel_alimentari a
      WHERE a.vehicle_id IN (SELECT id FROM cam)
        AND a.alimentat_at >= ((de - 120)::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < ((pana + 121)::timestamp AT TIME ZONE 'Europe/Chisinau')
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie_ef f
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
$function$
;

CREATE OR REPLACE FUNCTION public.lde_fuel_plin_la_plin(de date, pana date, vehicule uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(vehicle_id uuid, intervale bigint, litri numeric, km numeric, consum numeric, plin_tipic numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH al AS (
    SELECT x.vehicle_id, x.zi, sum(x.litri) AS litri FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri FROM lde_fuel_alimentari a
      WHERE a.alimentat_at >= (de::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')
        AND (vehicule IS NULL OR a.vehicle_id = ANY (vehicule))
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie_ef f
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
$function$
;

CREATE OR REPLACE FUNCTION public.lde_fuel_norma_eb(luna date, vehicule uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(vehicle_id uuid, norma numeric, sursa text, r_masina numeric, km_calib numeric, litri_calib numeric, r_tip numeric, tip_cheie text, q numeric, calib_de date, calib_pana date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT date_trunc('month', luna)::date AS m0, (date_trunc('month', luna) - interval '3 months')::date AS c0
  ), luni AS (
    SELECT (c.c0 + make_interval(months => i))::date AS de FROM c, generate_series(0, 2) i
  ), pm AS (
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
  ), zi AS (
    SELECT x.vehicle_id, x.zi, sum(x.litri) AS l FROM (
      SELECT a.vehicle_id, (a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date AS zi, a.litri FROM lde_fuel_alimentari a, c
      WHERE a.alimentat_at >= (c.c0::timestamp AT TIME ZONE 'Europe/Chisinau') AND a.alimentat_at < (c.m0::timestamp AT TIME ZONE 'Europe/Chisinau')
        AND (vehicule IS NULL OR a.vehicle_id = ANY (vehicule))
      UNION ALL
      SELECT f.vehicle_id, f.zi, f.litri FROM lde_fuel_foaie_ef f, c
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
$function$
;

