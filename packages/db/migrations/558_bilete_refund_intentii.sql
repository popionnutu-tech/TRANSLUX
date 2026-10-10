-- 558_bilete_refund_intentii.sql — intenția de refund durabilă (dezbaterea Claude ⇄ Codex, 10.10.2026: N2 + C3 + Codex C1).
--
-- Ion, 10.10.2026: «plata după ce cursa pleacă nu poate fi, dispecer nu va fi!!!» — niciun flux nu se mai sprijină pe
-- «alertă, dispecerul decide». Până acum anularea (bilete_anuleaza) făcea commit, iar suma returnării trăia doar în
-- răspunsul JSON: un proces oprit între anulare și bancă lăsa comanda «anulata» fără refund și fără reluare. Pe plata
-- comună a unui tur-retur (548) al doilea refund era înlocuit cu o alertă text PACHET_REFUND_OCUPAT.
--
-- Acum: aceeași tranzacție care anulează scrie și INTENȚIA (cine, pe ce plată, ce comenzi, ce sumă). Un worker (împăcarea
-- din cron, apps/admin/src/lib/bilete/refund-intentii.ts) o duce la capăt: revendicare cu termen → (la rezultat necunoscut:
-- împăcare cu banca ÎNAINTE de orice retrimitere) → refundPayment → finalizarea TUTUROR comenzilor-membre în «returnata».
-- Stările:
--   de_trimis          — scrisă, nimic trimis la bancă;
--   revendicata        — un worker o are (revendicata_pana); murind ÎNAINTE de POST, termenul expiră și se reia;
--   trimisa_necunoscut — trecută aici ÎNAINTE de POST: dacă procesul moare sau banca nu răspunde clar, următorul pas e
--                        împăcarea (getPayment: refundedAmount / requestedRefundAmount / refundableAmount față de valorile
--                        de dinainte de POST), niciodată o retrimitere oarbă;
--   creata             — banca a acceptat cererea (refund_id, sau urma găsită la împăcare); se așteaptă «Accepted»;
--   finalizata         — banii sunt înapoi; membrii sunt «returnata» (în aceeași tranzacție);
--   refuzata           — banca a spus NU (ex. al doilea refund parțial pe aceeași plată, D6 — nedecis de maib); rămâne
--                        vizibilă în /bilete și se reîncearcă automat cu pauze, nu devine niciodată «gata» în tăcere;
--   anulata            — nu se mai datorează nimic: comanda a fost reactivată după un refuz (biletele redevin valabile).
-- O singură intenție «în zbor» (revendicata / trimisa_necunoscut / creata) pe o plată: urmele băncii se citesc fără
-- amestecul altui refund. Suma tuturor intențiilor vii pe o plată nu trece de suma plății.

CREATE TABLE IF NOT EXISTS bilete_refund_intentii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES maib_checkouts(checkout_id),
  comenzi uuid[] NOT NULL CHECK (cardinality(comenzi) >= 1),
  suma numeric(10,2) NOT NULL CHECK (suma > 0),
  motiv text NOT NULL,
  origine text NOT NULL CHECK (origine IN ('anulare', 'plata_tarzie', 'fara_bilet')),
  cheie text NOT NULL UNIQUE,
  stare text NOT NULL DEFAULT 'de_trimis'
    CHECK (stare IN ('de_trimis', 'revendicata', 'trimisa_necunoscut', 'creata', 'finalizata', 'refuzata', 'anulata')),
  revendicare_id uuid,
  revendicata_pana timestamptz,
  urmatoarea_la timestamptz NOT NULL DEFAULT now(),
  incercari int NOT NULL DEFAULT 0,
  refund_id uuid,
  -- Urma băncii citită chiar înaintea POST-ului (getPayment): împăcarea compară cu ea, nu cu zero.
  banca_returnat numeric, banca_cerut numeric, banca_returnabil numeric,
  trimisa_la timestamptz,
  ultima_eroare text,
  creata_la timestamptz NOT NULL DEFAULT now(),
  actualizata_la timestamptz NOT NULL DEFAULT now(),
  finalizata_la timestamptz
);
COMMENT ON TABLE bilete_refund_intentii IS 'Intenția de refund (558): scrisă în tranzacția anulării / a plății târzii, dusă la capăt de împăcare. O plată = cel mult o intenție în zbor.';
CREATE UNIQUE INDEX IF NOT EXISTS bilete_refund_intentii_zbor_uq ON bilete_refund_intentii (checkout_id)
  WHERE stare IN ('revendicata', 'trimisa_necunoscut', 'creata');
CREATE INDEX IF NOT EXISTS bilete_refund_intentii_coada_idx ON bilete_refund_intentii (urmatoarea_la)
  WHERE stare NOT IN ('finalizata', 'anulata');
CREATE INDEX IF NOT EXISTS bilete_refund_intentii_comenzi_idx ON bilete_refund_intentii USING gin (comenzi);
ALTER TABLE bilete_refund_intentii ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bilete_refund_intentii FROM PUBLIC, anon, authenticated;
GRANT ALL ON bilete_refund_intentii TO service_role;

-- Intenția nouă, chemată DOAR din funcțiile tranzacției (anulare, plata târzie). Suma 0 → nimic de trimis: membrii
-- primesc refund_finalizat_la. Fără plată legată → alertă (stare imposibilă în fluxurile de azi). Aceeași cheie → aceeași
-- intenție (idempotent). Lacătul pe rândul plății serializează intențiile aceleiași plăți și plafonul sumei.
CREATE OR REPLACE FUNCTION public.bilete_refund_intentie_noua(p_checkout uuid, p_comenzi uuid[], p_suma numeric, p_motiv text,
                                                             p_origine text, p_cheie text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m maib_checkouts; v_id uuid; v_vii numeric;
BEGIN
  IF coalesce(p_suma, 0) <= 0 THEN
    UPDATE bilete_comenzi SET refund_finalizat_la = now(), updated_at = now() WHERE id = ANY (p_comenzi) AND refund_finalizat_la IS NULL;
    RETURN NULL;
  END IF;
  IF p_checkout IS NULL THEN
    INSERT INTO bilete_alerte (comanda_id, tip, detalii)
    VALUES (p_comenzi[1], 'refund_necunoscut', format('%s lei de returnat, dar comanda n-are plată maib legată', p_suma));
    RETURN NULL;
  END IF;
  SELECT id INTO v_id FROM bilete_refund_intentii WHERE cheie = p_cheie;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT * INTO m FROM maib_checkouts WHERE checkout_id = p_checkout FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_FARA_PLATA' USING ERRCODE = 'P0001'; END IF;
  SELECT coalesce(sum(suma), 0) INTO v_vii FROM bilete_refund_intentii WHERE checkout_id = p_checkout AND stare <> 'anulata';
  IF greatest(v_vii, coalesce(m.refunded_amount, 0)) + p_suma > m.amount + 0.001 THEN
    RAISE EXCEPTION 'REFUND_PESTE_PLATA' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO bilete_refund_intentii (checkout_id, comenzi, suma, motiv, origine, cheie)
  VALUES (p_checkout, p_comenzi, round(p_suma, 2), left(coalesce(nullif(trim(p_motiv), ''), 'refund'), 500), p_origine, p_cheie)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Revendicarea cu termen. Întoarce rândul revendicat (stare «revendicata» = de trimis; «trimisa_necunoscut» / «creata» =
-- de împăcat / de finalizat, doar cu termenul pus) sau NULL dacă nu e de luat acum. O intenție de trimis ale cărei comenzi
-- nu mai sunt de returnat (reactivate, emise) devine «anulata» — banii nu pleacă peste un bilet valabil.
CREATE OR REPLACE FUNCTION public.bilete_refund_revendica(p_id uuid, p_termen_s int) RETURNS bilete_refund_intentii
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_refund_intentii;
BEGIN
  SELECT * INTO r FROM bilete_refund_intentii WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.stare IN ('finalizata', 'anulata') THEN RETURN NULL; END IF;
  IF r.revendicata_pana IS NOT NULL AND r.revendicata_pana > now() THEN RETURN NULL; END IF;
  IF r.urmatoarea_la > now() THEN RETURN NULL; END IF;
  IF r.stare IN ('de_trimis', 'refuzata', 'revendicata') THEN
    IF EXISTS (SELECT 1 FROM bilete_comenzi WHERE id = ANY (r.comenzi) AND status NOT IN ('anulata', 'platita_fara_bilet', 'returnata'))
       OR (SELECT count(*) FROM bilete_comenzi WHERE id = ANY (r.comenzi)) <> cardinality(r.comenzi) THEN
      UPDATE bilete_refund_intentii SET stare = 'anulata', revendicare_id = NULL, revendicata_pana = NULL,
             ultima_eroare = 'comanda nu mai e de returnat (reactivată sau emisă)', actualizata_la = now()
       WHERE id = p_id RETURNING * INTO r;
      RETURN r;
    END IF;
    -- Una singură în zbor pe plată (indexul unic ar refuza oricum): dacă alta e în lucru, așteaptă.
    IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE checkout_id = r.checkout_id AND id <> r.id
                AND stare IN ('revendicata', 'trimisa_necunoscut', 'creata')) THEN
      UPDATE bilete_refund_intentii SET urmatoarea_la = now() + interval '2 minutes', actualizata_la = now() WHERE id = p_id;
      RETURN NULL;
    END IF;
    UPDATE bilete_refund_intentii SET stare = 'revendicata', revendicare_id = gen_random_uuid(),
           revendicata_pana = now() + make_interval(secs => p_termen_s), actualizata_la = now()
     WHERE id = p_id RETURNING * INTO r;
  ELSE
    UPDATE bilete_refund_intentii SET revendicare_id = gen_random_uuid(),
           revendicata_pana = now() + make_interval(secs => p_termen_s), actualizata_la = now()
     WHERE id = p_id RETURNING * INTO r;
  END IF;
  RETURN r;
END $$;

-- Finalizarea: banca a confirmat banii înapoi. Intenția «finalizata» și TOȚI membrii «returnata» (biletele «returnat»),
-- într-o tranzacție; doar de către deținătorul revendicării.
CREATE OR REPLACE FUNCTION public.bilete_refund_finalizeaza(p_id uuid, p_revendicare uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_refund_intentii; n int;
BEGIN
  SELECT * INTO r FROM bilete_refund_intentii WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INTENTIE_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF r.stare = 'finalizata' THEN RETURN 0; END IF;
  IF r.stare <> 'creata' OR r.revendicare_id IS DISTINCT FROM p_revendicare THEN RAISE EXCEPTION 'INTENTIE_NEREVENDICATA' USING ERRCODE = 'P0001'; END IF;
  UPDATE bilete_refund_intentii SET stare = 'finalizata', finalizata_la = now(), revendicare_id = NULL, revendicata_pana = NULL,
         actualizata_la = now() WHERE id = p_id;
  UPDATE bilete SET status = 'returnat' WHERE comanda_id = ANY (r.comenzi) AND status = 'anulat';
  UPDATE bilete_comenzi SET status = 'returnata', refund_finalizat_la = now(), updated_at = now()
   WHERE id = ANY (r.comenzi) AND status IN ('anulata', 'platita_fara_bilet');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- bilete_reactiveaza (copiată textual din 548) + 558: nu se reactivează o comandă al cărei refund e trimis, în lucru sau
-- făcut; intențiile refuzate ale ei devin «anulata» în aceeași tranzacție (nu se mai datorează nimic).
CREATE OR REPLACE FUNCTION public.bilete_reactiveaza(p_id uuid) RETURNS bilete_comenzi
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; m maib_checkouts; v_alerta text; v_membri uuid[];
BEGIN
  PERFORM bilete_lacat_pereche(p_id);
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMANDA_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  IF c.status <> 'anulata' THEN RETURN c; END IF;
  -- (returul din pachet anulat singur, «vina noastră», se reactivează singur; checkout-ul e pe tur)
  IF c.checkout_id IS NOT NULL THEN
    SELECT * INTO m FROM maib_checkouts WHERE checkout_id = c.checkout_id;
    IF FOUND AND (m.refund_id IS NOT NULL OR coalesce(m.refunded_amount, 0) <> 0) THEN
      RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- 558: comanda și returul ei din pachet, cu intențiile lor.
  v_membri := ARRAY[p_id] || coalesce((SELECT array_agg(id) FROM bilete_comenzi WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata'), '{}');
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE comenzi && v_membri AND stare NOT IN ('refuzata', 'anulata')) THEN
    RAISE EXCEPTION 'REFUND_EXISTENT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bilete_refund_intentii SET stare = 'anulata', revendicare_id = NULL, revendicata_pana = NULL,
         ultima_eroare = 'comanda reactivată după refuzul băncii', actualizata_la = now()
   WHERE comenzi && v_membri AND stare = 'refuzata';
  UPDATE bilete SET status = 'valid' WHERE comanda_id = p_id AND status = 'anulat';
  -- 548: returul din pachet (același refund refuzat) revine odată cu turul.
  UPDATE bilete SET status = 'valid' WHERE status = 'anulat' AND comanda_id IN
    (SELECT id FROM bilete_comenzi WHERE comanda_tur_id = p_id AND in_pachet AND status = 'anulata');
  UPDATE bilete_comenzi b SET status = CASE WHEN EXISTS (SELECT 1 FROM bilete x WHERE x.comanda_id = b.id) THEN 'platita' ELSE 'platita_fara_bilet' END,
         cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, updated_at = now()
   WHERE b.comanda_tur_id = p_id AND b.in_pachet AND b.status = 'anulata';
  UPDATE bilete_comenzi
     SET status = 'platita', cancelled_at = NULL, cancel_source = NULL, refund_reason = NULL, scazut_la_refund = 0, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO c;
  -- 544 (Codex r2 C2): după un refuz bancar, comanda revine doar dacă e încă eligibilă; altfel așteaptă dispecerul.
  v_alerta := bilete_revalideaza_plata(c);
  IF v_alerta IN ('retur_tur_anulat', 'plafon_student') THEN
    UPDATE bilete SET status = 'anulat' WHERE comanda_id = p_id AND status = 'valid';
    UPDATE bilete_comenzi SET status = 'platita_fara_bilet', updated_at = now() WHERE id = p_id RETURNING * INTO c;
    INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (p_id, v_alerta, 'refund refuzat de bancă; comanda nu mai e eligibilă — se returnează manual');
  END IF;
  RETURN c;
END $$;

-- bilete_anuleaza (copiată textual din 548) + 558: intențiile de refund în aceeași tranzacție cu anularea. Răspunsul păstrează
-- forma (un element pe comandă anulată, cu suma) și adaugă «intentie» pe elementul care o poartă.
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
  SELECT count(*) INTO n FROM bilete WHERE comanda_id = p_id AND status = 'urcat';
  IF n > 0 THEN RAISE EXCEPTION 'BILET_URCAT' USING ERRCODE = 'P0001'; END IF;
  IF p_grila > c.total THEN RAISE EXCEPTION 'GRILA_PESTE_TOTAL' USING ERRCODE = 'P0001'; END IF;

  v_suma := p_grila;
  -- Returul plătit legat de acest tur (doar pentru un tur: comanda_tur_id e null).
  IF c.comanda_tur_id IS NULL THEN
    SELECT * INTO rt FROM bilete_comenzi WHERE comanda_tur_id = c.id
       AND (status = 'platita' OR (in_pachet AND status = 'platita_fara_bilet')) ORDER BY in_pachet DESC LIMIT 1 FOR UPDATE;
  END IF;
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
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_refund_intentie_noua(uuid, uuid[], numeric, text, text, text)', 'bilete_refund_revendica(uuid, integer)',
    'bilete_refund_finalizeaza(uuid, uuid)', 'bilete_reactiveaza(uuid)', 'bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Inventarul anulărilor vechi fără refund (Codex C1): verificat live 10.10.2026 — 0 comenzi «anulata» nefinalizate; toate
-- cele 15 returnate au refund Accepted. Dacă la aplicare apare vreuna, migrația se oprește (nu ghicim suma).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM bilete_comenzi WHERE status = 'anulata' AND refund_finalizat_la IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '558: % comenzi anulate fără refund finalizat — de inventariat înaintea intențiilor', n; END IF;
END $$;

-- Probă (anulată la sfârșit): intenția se scrie odată cu anularea, o singură dată; revendicarea cu termen; finalizarea
-- membrilor; pachetul = o intenție cu doi membri; returul singur + turul = două intenții pe aceeași plată, sub plafon;
-- peste plată = refuz; reactivarea după refuz anulează intenția; după creare, reactivarea e refuzată.
DO $$
DECLARE tur bilete_comenzi; ret bilete_comenzi; s bilete_comenzi; ck uuid; ck2 uuid; ra int; rb int; base jsonb; n int; r jsonb;
        i bilete_refund_intentii; i2 bilete_refund_intentii; v uuid;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 558', 'phone', '37360558558', 'promo_pereche', true, 'test', false, 'seats', 1);

  -- 1. comandă simplă: anulare → o intenție de_trimis cu suma grilei; a doua anulare → «deja», fără a doua intenție
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-01', 'crm_route_id', rb,
        'going_north', false, 'departure_at', '2031-07-01T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150,
        'ip_hash', 'p558s', 'promo_pereche', false));
  ck2 := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck2, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck2 WHERE id = s.id;
  PERFORM bilete_marcheaza_platita(ck2);
  r := bilete_anuleaza(s.id, 'admin', 'probă 558', 100, false, false, NULL);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = (r->0->>'intentie')::uuid;
  IF i.id IS NULL OR i.stare <> 'de_trimis' OR i.suma <> 100 OR i.comenzi <> ARRAY[s.id] OR i.checkout_id <> ck2 THEN RAISE EXCEPTION 'P558: intenția simplă (%)', r; END IF;
  r := bilete_anuleaza(s.id, 'admin', 'probă 558', 100, false, false, NULL);
  SELECT count(*) INTO n FROM bilete_refund_intentii WHERE comenzi && ARRAY[s.id];
  IF NOT (r->0->>'deja')::boolean OR n <> 1 THEN RAISE EXCEPTION 'P558: a doua anulare a scris altă intenție (n=%)', n; END IF;
  -- revendicarea: o dată; a doua cât ține termenul → NULL; după termen → din nou
  i := bilete_refund_revendica(i.id, 60);
  IF i.stare <> 'revendicata' OR i.revendicare_id IS NULL THEN RAISE EXCEPTION 'P558: revendicarea'; END IF;
  IF (bilete_refund_revendica(i.id, 60)).id IS NOT NULL THEN RAISE EXCEPTION 'P558: dublă revendicare'; END IF;
  UPDATE bilete_refund_intentii SET revendicata_pana = now() - interval '1 second' WHERE id = i.id;
  i2 := bilete_refund_revendica(i.id, 60);
  IF i2.id IS NULL OR i2.revendicare_id = i.revendicare_id THEN RAISE EXCEPTION 'P558: revendicarea după termen'; END IF;
  -- finalizarea cere revendicarea curentă și «creata»
  UPDATE bilete_refund_intentii SET stare = 'creata' WHERE id = i.id;
  BEGIN
    PERFORM bilete_refund_finalizeaza(i.id, i.revendicare_id);
    RAISE EXCEPTION 'P558: finalizare cu revendicarea veche';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'INTENTIE_NEREVENDICATA' THEN RAISE; END IF; END;
  n := bilete_refund_finalizeaza(i.id, i2.revendicare_id);
  SELECT * INTO s FROM bilete_comenzi WHERE id = s.id;
  IF n <> 1 OR s.status <> 'returnata' OR s.refund_finalizat_la IS NULL
     OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = s.id AND status <> 'returnat') THEN RAISE EXCEPTION 'P558: finalizarea (%)', s.status; END IF;

  -- 2. pachetul tur 150 + retur 120: o intenție cu ambii membri, 270 lei
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-06-01', 'crm_route_id', ra,
          'going_north', false, 'departure_at', '2031-06-01T06:00:00+03', 'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'ip_hash', 'p558a'));
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-06-03', 'crm_route_id', rb,
           'going_north', true, 'departure_at', '2031-06-03T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120,
           'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true, 'ip_hash', 'p558c'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', 270, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  n := bilete_marcheaza_platita(ck);
  IF n <> 2 THEN RAISE EXCEPTION 'P558: plata pachetului (%)', n; END IF;
  -- 2a. returul singur (vina noastră) → intenție pe plata turului, membru doar returul
  r := bilete_anuleaza(ret.id, 'admin', 'cursa de retur anulată', 120, true, false, NULL);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = (r->0->>'intentie')::uuid;
  IF i.checkout_id <> ck OR i.comenzi <> ARRAY[ret.id] OR i.suma <> 120 THEN RAISE EXCEPTION 'P558: returul singur (%)', r; END IF;
  -- reactivarea după refuz: intenția refuzată devine «anulata», biletele redevin valabile
  UPDATE bilete_refund_intentii SET stare = 'refuzata' WHERE id = i.id;
  PERFORM bilete_reactiveaza(ret.id);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = i.id;
  SELECT * INTO ret FROM bilete_comenzi WHERE id = ret.id;
  IF i.stare <> 'anulata' OR ret.status <> 'platita' THEN RAISE EXCEPTION 'P558: reactivarea (% / %)', i.stare, ret.status; END IF;
  -- 2b. pachetul întreg: o intenție, doi membri, 150 + 120
  r := bilete_anuleaza(tur.id, 'admin', 'probă', 150, false, false, NULL);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = (r->0->>'intentie')::uuid;
  IF jsonb_array_length(r) <> 2 OR i.suma <> 270 OR NOT (i.comenzi @> ARRAY[tur.id, ret.id]) OR cardinality(i.comenzi) <> 2 THEN
    RAISE EXCEPTION 'P558: intenția pachetului (%)', r;
  END IF;
  -- reactivarea cu o intenție în zbor (creata) e refuzată
  UPDATE bilete_refund_intentii SET stare = 'creata' WHERE id = i.id;
  BEGIN
    PERFORM bilete_reactiveaza(tur.id);
    RAISE EXCEPTION 'P558: reactivare peste un refund creat';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REFUND_EXISTENT' THEN RAISE; END IF; END;
  -- o intenție peste suma plății e refuzată (270 deja datorați pe 270)
  BEGIN
    v := bilete_refund_intentie_noua(ck, ARRAY[tur.id], 1, 'probă', 'anulare', 'p558:peste');
    RAISE EXCEPTION 'P558: intenție peste plată';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REFUND_PESTE_PLATA' THEN RAISE; END IF; END;
  -- aceeași cheie → aceeași intenție
  IF bilete_refund_intentie_noua(ck, ARRAY[tur.id], 1, 'probă', 'anulare', i.cheie) <> i.id THEN RAISE EXCEPTION 'P558: cheia nu e idempotentă'; END IF;
  -- trimitere nouă cu membrii reactivați → «anulata», fără revendicare
  UPDATE bilete_refund_intentii SET stare = 'de_trimis' WHERE id = i.id;
  UPDATE bilete_comenzi SET status = 'platita' WHERE id = tur.id;
  i := bilete_refund_revendica(i.id, 60);
  IF i.stare <> 'anulata' THEN RAISE EXCEPTION 'P558: intenția pe comanda reactivată (%)', i.stare; END IF;
  RAISE EXCEPTION 'PROBA558_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA558_OK' THEN RAISE; END IF;
END $$;
