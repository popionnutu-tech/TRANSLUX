-- 559_bilete_anulare_blocheaza_biletele.sql — scanarea și anularea în aceeași clipă (dezbaterea Claude ⇄ Codex, 10.10.2026: N1).
--
-- bilete_anuleaza număra biletele «urcat» FĂRĂ lacăt pe rândurile din bilete; scanarea șoferului
-- (apps/admin/src/app/api/bilete-sofer/scan/route.ts: UPDATE bilete SET status = 'urcat' … WHERE status = 'valid') nu ia
-- lacătul perechii. Sub READ COMMITTED, o scanare comisă între numărare și UPDATE-ul anulării dădea: omul în autobuz ȘI
-- banii înapoi. Acum anularea identifică întâi returul legat (pachet sau −20%), apoi blochează biletele ambelor comenzi
-- în ordinea id-ului, și abia apoi verifică «urcat». Scanarea nu are nevoie de alt lacăt (Codex C1: UPDATE-ul ei ia deja
-- lacăt pe rând). Funcția e copiată textual din 558 (care a copiat-o din 548); se schimbă doar ordinea de mai sus.

CREATE OR REPLACE FUNCTION public.bilete_anuleaza(p_id uuid, p_sursa text, p_motiv text, p_grila numeric,
                                                  p_vina_noastra boolean, p_si_returul boolean, p_grila_retur numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; rt bilete_comenzi; n int; v_suma numeric; v_scazut numeric := 0; rez jsonb := '[]'::jsonb; v_rt_urcat boolean;
        v_rt_anulat boolean := false; v_ck uuid; v_int uuid; v_int_rt uuid; v_cheie text := extract(epoch FROM now())::text;
BEGIN
  IF p_sursa NOT IN ('pasager', 'admin', 'sistem', 'ai') THEN RAISE EXCEPTION 'SURSA_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  IF p_grila IS NULL OR p_grila < 0 THEN RAISE EXCEPTION 'GRILA_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
  PERFORM bilete_lacat_pereche(p_id);
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status IN ('anulata', 'returnata') THEN
    RETURN jsonb_build_array(jsonb_build_object('id', c.id, 'suma', null, 'status', c.status, 'deja', true));
  END IF;
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'STARE_%', upper(c.status) USING ERRCODE = 'P0001'; END IF;
  -- 548: tur-returul plătit o dată se anulează doar împreună, din tur.
  -- Excepția: cursa de retur anulată de firmă (sursa «sistem» sau dispecerul cu «vina noastră») — returul singur.
  IF c.in_pachet AND NOT (coalesce(p_vina_noastra, false) OR p_sursa = 'sistem') THEN RAISE EXCEPTION 'PACHET_DOAR_IMPREUNA' USING ERRCODE = 'P0001'; END IF;
  -- Returul plătit legat de acest tur (doar pentru un tur: comanda_tur_id e null).
  -- 559 (N1): returul se identifică ÎNAINTE de lacătul pe bilete, ca ambele comenzi să fie blocate deodată.
  IF c.comanda_tur_id IS NULL THEN
    SELECT * INTO rt FROM bilete_comenzi WHERE comanda_tur_id = c.id
       AND (status = 'platita' OR (in_pachet AND status = 'platita_fara_bilet')) ORDER BY in_pachet DESC LIMIT 1 FOR UPDATE;
  END IF;
  -- 559 (N1, dezbaterea Claude ⇄ Codex 10.10): biletele comenzii și ale returului legat, blocate într-o ordine stabilă
  -- (id) ÎNAINTE de verificarea «urcat». Scanarea șoferului (UPDATE … WHERE status = 'valid') așteaptă acest lacăt și,
  -- după commit, nu mai găsește biletul «valid»; o scanare comisă înainte e văzută aici → BILET_URCAT / RETUR_URCAT.
  PERFORM 1 FROM bilete WHERE comanda_id IN (c.id, rt.id) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;
  IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL' USING ERRCODE = 'P0001'; END IF;

  v_suma := p_grila;
  IF rt.id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM bilete WHERE comanda_id = rt.id AND status = 'urcat') INTO v_rt_urcat;
    IF coalesce(p_si_returul, false) OR rt.in_pachet THEN
      IF v_rt_urcat THEN RAISE EXCEPTION 'RETUR_URCAT' USING ERRCODE = 'P0001'; END IF;
      -- Fără grila returului (dispecerul din /bilete) = integral: returul n-a plecat, banii lui se întorc toți.
      p_grila_retur := coalesce(p_grila_retur, rt.total);
      IF p_grila_retur < 0 OR p_grila_retur > rt.total THEN RAISE EXCEPTION 'GRILA_RETUR_NEVALIDA' USING ERRCODE = 'P0001'; END IF;
      UPDATE bilete SET status = 'anulat' WHERE comanda_id = rt.id AND status = 'valid';
      UPDATE bilete_comenzi SET status = 'anulata', cancelled_at = now(), cancel_source = p_sursa,
             refund_reason = left('împreună cu turul: ' || coalesce(p_motiv, ''), 500), updated_at = now()
       WHERE id = rt.id;
      v_rt_anulat := true;
    ELSIF NOT coalesce(p_vina_noastra, false) THEN
      v_suma := greatest(0, p_grila - rt.reducere_lei_loc * rt.seats);
      v_scazut := p_grila - v_suma;
    END IF;
  END IF;

  UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
  UPDATE bilete_comenzi
     SET status = 'anulata', cancelled_at = now(), cancel_source = p_sursa, refund_reason = left(p_motiv, 500),
         scazut_la_refund = v_scazut, updated_at = now()
   WHERE id = p_id;

  -- 558: intențiile de refund, în aceeași tranzacție. Plata comună a pachetului (548) = o intenție cu ambii membri.
  IF c.in_pachet THEN
    -- returul din pachet anulat singur (vina noastră): refund parțial pe plata turului
    SELECT checkout_id INTO v_ck FROM bilete_comenzi WHERE id = c.comanda_tur_id;
    v_int := bilete_refund_intentie_noua(v_ck, ARRAY[c.id], v_suma, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
  ELSIF v_rt_anulat AND rt.in_pachet THEN
    v_int := bilete_refund_intentie_noua(c.checkout_id, ARRAY[c.id, rt.id], v_suma + p_grila_retur, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
  ELSE
    v_int := bilete_refund_intentie_noua(c.checkout_id, ARRAY[c.id], v_suma, p_motiv, 'anulare', format('anulare:%s:%s', c.id, v_cheie));
    IF v_rt_anulat THEN
      -- returul −20% cumpărat separat: banii lui pe sesiunea lui
      v_int_rt := bilete_refund_intentie_noua(rt.checkout_id, ARRAY[rt.id], p_grila_retur, 'împreună cu turul: ' || coalesce(p_motiv, ''),
                                              'anulare', format('anulare:%s:%s', rt.id, v_cheie));
    END IF;
  END IF;

  IF v_rt_anulat THEN
    rez := jsonb_build_array(jsonb_build_object('id', rt.id, 'suma', p_grila_retur, 'status', 'anulata', 'intentie', v_int_rt));
  END IF;
  rez := jsonb_build_array(jsonb_build_object('id', c.id, 'suma', v_suma, 'status', 'anulata', 'scazut', v_scazut, 'intentie', v_int)) || rez;
  RETURN rez;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric) TO service_role;
END $$;

-- Probă (anulată la sfârșit): cele două ordini ale aceleiași clipe, pe o comandă de 2 locuri și pe un tur-retur.
-- «Scanarea» de mai jos e exact UPDATE-ul rutei șoferului. O singură sesiune nu poate ține două tranzacții deschise;
-- dar cu lacătul pe rânduri, ordinile de commit posibile sunt doar două: scanarea comisă întâi → anularea o vede (refuz,
-- nicio intenție de refund); anularea comisă întâi → UPDATE-ul scanării, reevaluat după lacăt, nu mai găsește «valid».
DO $$
DECLARE s bilete_comenzi; tur bilete_comenzi; ret bilete_comenzi; ck uuid; ra int; rb int; base jsonb; n int; r jsonb; b uuid;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 559', 'phone', '37360559559', 'test', false);

  -- 1. scanarea întâi, apoi anularea: refuz BILET_URCAT, comanda rămâne plătită, nicio intenție de refund
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-08-01', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-08-01T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150,
        'total', 300, 'seats', 2, 'promo_pereche', false, 'ip_hash', 'p559a'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 300, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  IF bilete_marcheaza_platita(ck) <> 2 THEN RAISE EXCEPTION 'P559: plata'; END IF;
  SELECT id INTO b FROM bilete WHERE comanda_id = s.id ORDER BY nr LIMIT 1;
  UPDATE bilete SET status = 'urcat', urcat_at = now(), urcat_sursa = 'scan' WHERE id = b AND status = 'valid';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'P559: scanarea întâi'; END IF;
  BEGIN
    PERFORM bilete_anuleaza(s.id, 'pasager', 'probă 559', 300, false, false, NULL);
    RAISE EXCEPTION 'P559: anulare peste un bilet urcat';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'BILET_URCAT' THEN RAISE; END IF; END;
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  IF s.status <> 'platita' OR EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && ARRAY[s.id]) THEN RAISE EXCEPTION 'P559: după refuz (%)', s.status; END IF;

  -- 2. anularea întâi, apoi scanarea: 0 rânduri, niciun bilet «urcat» pe comanda anulată
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-08-02', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-08-02T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150,
        'total', 300, 'seats', 2, 'promo_pereche', false, 'ip_hash', 'p559b'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 300, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  PERFORM bilete_marcheaza_platita(ck);
  r := bilete_anuleaza(s.id, 'pasager', 'probă 559', 300, false, false, NULL);
  IF (r->0->>'intentie') IS NULL THEN RAISE EXCEPTION 'P559: anularea fără intenție (%)', r; END IF;
  UPDATE bilete SET status = 'urcat', urcat_at = now(), urcat_sursa = 'scan' WHERE comanda_id = s.id AND status = 'valid';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = s.id AND status <> 'anulat') THEN RAISE EXCEPTION 'P559: scanare reușită pe comanda anulată'; END IF;

  -- 3. tur-retur (pachet): returul scanat întâi → anularea turului e refuzată (RETUR_URCAT), fără intenție
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-08-03', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-08-03T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150,
          'total', 150, 'seats', 1, 'promo_pereche', true, 'ip_hash', 'p559c'));
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-08-05', 'crm_route_id', rb,
           'going_north', true, 'departure_at', '2031-08-05T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
           'seats', 1, 'promo_pereche', true, 'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true, 'ip_hash', 'p559d'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', 270, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  IF bilete_marcheaza_platita(ck) <> 2 THEN RAISE EXCEPTION 'P559: plata pachetului'; END IF;
  UPDATE bilete SET status = 'urcat', urcat_at = now(), urcat_sursa = 'scan' WHERE comanda_id = ret.id AND status = 'valid';
  BEGIN
    PERFORM bilete_anuleaza(tur.id, 'admin', 'probă 559', 150, false, false, NULL);
    RAISE EXCEPTION 'P559: pachet anulat peste returul urcat';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'RETUR_URCAT' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && ARRAY[tur.id, ret.id]) THEN RAISE EXCEPTION 'P559: intenție după refuz'; END IF;
  -- 3b. ordinea inversă pe pachet: anularea turului întâi → scanarea returului nu mai trece
  UPDATE bilete SET status = 'valid', urcat_at = NULL, urcat_sursa = NULL WHERE comanda_id = ret.id;
  r := bilete_anuleaza(tur.id, 'admin', 'probă 559', 150, false, false, NULL);
  IF jsonb_array_length(r) <> 2 THEN RAISE EXCEPTION 'P559: anularea pachetului (%)', r; END IF;
  UPDATE bilete SET status = 'urcat', urcat_at = now(), urcat_sursa = 'scan' WHERE comanda_id IN (tur.id, ret.id) AND status = 'valid';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'P559: scanare reușită pe pachetul anulat'; END IF;
  RAISE EXCEPTION 'PROBA559_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA559_OK' THEN RAISE; END IF;
END $$;
