-- 540: QR-ul TLX folosit de altă mașină decât cea scrisă pe el.
-- Proba pe sept. 2026 (590 alimentări TLX ale parcului): 549 au pe foaia LDE (introdusă de Clava) exact aceiași litri
-- în ±1 zi; la 72 foaia îi pune pe ALTĂ mașină decât plăcuța QR-ului (QR «VKV 389» → 795MUM 1.059 l, «BRAT 284» →
-- 725YOZ 951 l, «BRAZ 314» → 314BRAT). GPS-ul la stație nu decide: TLX Orhei e lângă baza SEBN, 566 din 590 au mai
-- multe mașini la stație. De aceea:
--  * pe fiecare alimentare TLX: foaia LDE cu exact acești litri pe o singură mașină (±1 zi) bate plăcuța QR-ului;
--  * QR-ul legat automat (nu de Clava) își învață mașina: dacă în ultimele 60 de zile ≥ 3 alimentări și ≥ 60 % din cele
--    regăsite pe foaie sunt pe aceeași altă mașină, QR-ul trece pe ea (pentru zilele în care foaia nu mai e scrisă).

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
      -- QR-ul TLX stă uneori în altă mașină: dacă foaia LDE are exact acești litri pe o singură mașină (±1 zi), e aceea
      IF r.sursa = 'tlx' THEN
        SELECT array_agg(DISTINCT f.vehicle_id) INTO vv FROM lde_fuel_foaie f
        WHERE abs(f.litri - r.litri) < 0.02 AND f.zi BETWEEN r.zi_local - 1 AND r.zi_local + 1
          AND 'tlx' = ANY (lde_fuel_foaie_surse(f.foaie));
        IF coalesce(array_length(vv, 1), 0) = 1 AND vv[1] IS DISTINCT FROM p.vehicle_id THEN
          n_veh := vv[1]; n_prin := 'foaie_lde'; n_motiv := 'QR-ul altei mașini; foaia LDE are alimentarea pe aceasta';
        END IF;
      END IF;
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


CREATE OR REPLACE FUNCTION lde_fuel_tlx_invata_qr(p_pana date) RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH m AS (
    SELECT r.cod, f.vehicle_id, count(*) AS n
    FROM lde_fuel_import_rand r
    JOIN LATERAL (SELECT DISTINCT f2.vehicle_id FROM lde_fuel_foaie f2
                  WHERE abs(f2.litri - r.litri) < 0.02 AND f2.zi BETWEEN r.zi_local - 1 AND r.zi_local + 1
                    AND 'tlx' = ANY (lde_fuel_foaie_surse(f2.foaie))) f ON true
    WHERE r.sursa = 'tlx' AND r.este_dt AND r.zi_local BETWEEN p_pana - 60 AND p_pana AND lde_fuel_rand_activ(r.external_id)
    GROUP BY 1, 2),
  tot AS (SELECT cod, sum(n) AS t FROM m GROUP BY 1),
  dom AS (SELECT DISTINCT ON (m.cod) m.cod, m.vehicle_id, m.n, tot.t FROM m JOIN tot USING (cod) ORDER BY m.cod, m.n DESC)
  UPDATE lde_fuel_portofel p SET vehicle_id = dom.vehicle_id,
    legat_de = 'tlx-qr-worker (după foaia LDE: ' || dom.n || ' din ' || dom.t || ')', legat_la = now()
  FROM dom
  WHERE p.sursa = 'tlx' AND p.cod = dom.cod AND p.tip = 'masina' AND p.legat_de LIKE 'tlx-qr-worker%'
    AND dom.n >= 3 AND dom.n >= 0.6 * dom.t AND p.vehicle_id IS DISTINCT FROM dom.vehicle_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- sincronizarea nocturnă: învață QR-urile înainte de legare
CREATE OR REPLACE FUNCTION lde_fuel_tlx_sync(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_inv integer; v_id uuid; v_de date := (p->>'de')::date; v_pana date := (p->>'pana')::date; v_noi integer; v_scoase integer; v_sync jsonb;
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

  v_inv := lde_fuel_tlx_invata_qr(v_pana);
  PERFORM lde_fuel_releaga(v_de, v_pana);
  v_sync := lde_fuel_import_sincronizeaza(v_de, v_pana);
  RETURN jsonb_build_object('import_id', v_id, 'randuri_noi_sau_schimbate', v_noi, 'retrase', v_scoase, 'qr_invatate', v_inv, 'sync', v_sync);
END $$;

REVOKE EXECUTE ON FUNCTION lde_fuel_rand_leaga(text), lde_fuel_tlx_invata_qr(date), lde_fuel_tlx_sync(jsonb) FROM PUBLIC, anon, authenticated;
