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
--   anulata            — nu se mai datorează nimic: comanda a fost reactivată după un refuz (biletele redevin valabile);
--   blocata            — (revizia 10.10, H2/H1) banca a pus refund-ul în «Manual», sau pe plată e un refund străin care nu
--                        e al acestei intenții: NICIO retrimitere automată; cu refund_id se recitește rar (Manual → Accepted
--                        se finalizează; Rejected → retrimitere doar dacă banca arată zero mișcare); vizibilă în /bilete, o alertă;
--   finalizata_de_altul — (H1) membrii au fost returnați de alt mecanism (fluxul vechi, în fereastra migrație → deploy).
-- O singură intenție «în zbor» (revendicata / trimisa_necunoscut / creata / blocata) pe o plată: urmele băncii se citesc fără
-- amestecul altui refund. Suma tuturor intențiilor vii pe o plată nu trece de suma plății.

CREATE TABLE IF NOT EXISTS bilete_refund_intentii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES maib_checkouts(checkout_id),
  comenzi uuid[] NOT NULL CHECK (cardinality(comenzi) >= 1),
  suma numeric(10,2) NOT NULL CHECK (suma > 0),
  motiv text NOT NULL,
  origine text NOT NULL CHECK (origine IN ('anulare', 'plata_tarzie', 'fara_bilet', 'import_vechi')),
  cheie text NOT NULL UNIQUE,
  stare text NOT NULL DEFAULT 'de_trimis'
    CHECK (stare IN ('de_trimis', 'revendicata', 'trimisa_necunoscut', 'creata', 'finalizata', 'refuzata', 'anulata', 'blocata', 'finalizata_de_altul')),
  -- import_vechi: suma e estimată din comenzi (fluxul vechi n-a păstrat-o); workerul o ia de la bancă (getRefund.amount).
  suma_estimata boolean NOT NULL DEFAULT false,
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
  WHERE stare IN ('revendicata', 'trimisa_necunoscut', 'creata', 'blocata');
CREATE INDEX IF NOT EXISTS bilete_refund_intentii_coada_idx ON bilete_refund_intentii (urmatoarea_la)
  WHERE stare NOT IN ('finalizata', 'anulata', 'finalizata_de_altul');
CREATE INDEX IF NOT EXISTS bilete_refund_intentii_comenzi_idx ON bilete_refund_intentii USING gin (comenzi);
ALTER TABLE bilete_refund_intentii ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bilete_refund_intentii FROM PUBLIC, anon, authenticated;
GRANT ALL ON bilete_refund_intentii TO service_role;

-- Revizia 10.10 (M2): «banii se întorc» pe comandă — true cât comanda e membru al unei intenții care nu e «anulata».
-- O comandă «platita_fara_bilet» cu banii în drum înapoi nu mai ține loc din cotă (bilete_cota_ocupata) și nu se mai
-- arată ca bilet activ / de anulat (site, bot). Ținut de declanșatorul de mai jos, în aceeași tranzacție cu intenția;
-- același câmp îl citesc TS-ul plafonului (bilete-localitati.ts, comenzi.ts) și paginile clientului.
ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS bani_inapoi boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN bilete_comenzi.bani_inapoi IS 'Membru al unei intenții de refund vii (558, stare <> anulata): banii plății se întorc automat; nu ține loc din cotă.';

CREATE OR REPLACE FUNCTION public.bilete_refund_intentii_bani_inapoi() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  UPDATE bilete_comenzi c SET bani_inapoi = EXISTS (SELECT 1 FROM bilete_refund_intentii x WHERE x.comenzi && ARRAY[c.id] AND x.stare <> 'anulata')
   WHERE c.id = ANY (NEW.comenzi)
     AND c.bani_inapoi IS DISTINCT FROM EXISTS (SELECT 1 FROM bilete_refund_intentii x WHERE x.comenzi && ARRAY[c.id] AND x.stare <> 'anulata');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS bilete_refund_intentii_bani_inapoi_ins ON bilete_refund_intentii;
CREATE TRIGGER bilete_refund_intentii_bani_inapoi_ins AFTER INSERT ON bilete_refund_intentii
  FOR EACH ROW EXECUTE FUNCTION bilete_refund_intentii_bani_inapoi();
-- Doar când se schimbă «anulata sau nu»: workerul (stări intermediare) nu atinge rândurile comenzilor.
DROP TRIGGER IF EXISTS bilete_refund_intentii_bani_inapoi_upd ON bilete_refund_intentii;
CREATE TRIGGER bilete_refund_intentii_bani_inapoi_upd AFTER UPDATE OF stare ON bilete_refund_intentii
  FOR EACH ROW WHEN ((OLD.stare = 'anulata') IS DISTINCT FROM (NEW.stare = 'anulata'))
  EXECUTE FUNCTION bilete_refund_intentii_bani_inapoi();
REVOKE EXECUTE ON FUNCTION public.bilete_refund_intentii_bani_inapoi() FROM PUBLIC, anon, authenticated;

-- bilete_comanda_activa (546) cu «banii se întorc»: fără refund în curs numărat (cota, returul activ), «platita_fara_bilet»
-- cu banii în drum înapoi NU e activă — ca «anulata». Cu refund în curs numărat (studentul: jetonul și plafonul pe 7 zile),
-- rămâne activă, exact ca anulata cu refund nefinalizat. Varianta cu 4 argumente (546) rămâne pentru apelanții vechi.
CREATE OR REPLACE FUNCTION public.bilete_comanda_activa(s text, creat timestamptz, refund_fin timestamptz, cu_refund_in_curs boolean, bani_inapoi boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT s = 'platita'
      OR (s = 'platita_fara_bilet' AND (cu_refund_in_curs OR NOT coalesce(bani_inapoi, false)))
      OR (s IN ('noua', 'eroare_creare') AND creat > now() - interval '30 minutes')
      OR (cu_refund_in_curs AND s = 'anulata' AND refund_fin IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.bilete_cota_ocupata(p_trip_date date, p_route int, p_north boolean, p_cheie text, p_fara uuid)
RETURNS int LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(sum(seats), 0)::int FROM bilete_comenzi
   WHERE trip_date = p_trip_date AND crm_route_id = p_route AND going_north = p_north AND NOT test
     AND loc_cheie @> ARRAY[p_cheie] AND id IS DISTINCT FROM p_fara
     AND bilete_comanda_activa(status, created_at, refund_finalizat_la, false, bani_inapoi)
$$;

CREATE OR REPLACE FUNCTION public.bilete_retur_activ(p_tur uuid, p_fara uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT id FROM bilete_comenzi
   WHERE comanda_tur_id = p_tur AND id IS DISTINCT FROM p_fara
     AND bilete_comanda_activa(status, created_at, refund_finalizat_la, false, bani_inapoi)
   ORDER BY created_at LIMIT 1
$$;
-- (bilete_locuri_ocupate, 501: o comandă «platita_fara_bilet» n-are bilete «valid»/«urcat» și nu e rezervare deschisă —
-- nu ține niciun loc pe hartă; nu se schimbă.)

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

-- Revendicarea cu termen. Întoarce rândul revendicat (stare «revendicata» = de trimis; «trimisa_necunoscut» / «creata» /
-- «blocata» cu refund_id = de împăcat / de finalizat / de recitit, doar cu termenul pus) sau NULL dacă nu e de luat acum.
-- O intenție de trimis ale cărei comenzi nu mai sunt de returnat (reactivate, emise) devine «anulata» — banii nu pleacă
-- peste un bilet valabil.
-- Revizia 10.10:
--   H1 — membrii deja «returnata» (fluxul vechi a trimis și a finalizat banii, în fereastra migrație → deploy): intenția
--        devine «finalizata_de_altul», nu se trimite a doua oară; un amestec (unii returnați, alții nu) → «blocata», vizibilă;
--   M1 — ordinea lacătelor e aceeași cu anularea / reactivarea / emiterea: lacătul perechii ÎNTÂI, apoi rândul intenției.
--        Reactivarea și emiterea blochează și ele rândurile intențiilor înainte de verificare, deci decizia de aici
--        («anulata» la noi? se trimite?) și a lor nu se mai pot suprapune.
CREATE OR REPLACE FUNCTION public.bilete_refund_revendica(p_id uuid, p_termen_s int) RETURNS bilete_refund_intentii
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_refund_intentii; v_membri uuid[]; n_tot int; n_ret int; n_vii int;
BEGIN
  SELECT comenzi INTO v_membri FROM bilete_refund_intentii WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM bilete_lacat_pereche(v_membri[1]);
  SELECT * INTO r FROM bilete_refund_intentii WHERE id = p_id FOR UPDATE;
  IF r.stare IN ('finalizata', 'anulata', 'finalizata_de_altul') THEN RETURN NULL; END IF;
  -- «blocata» fără refund la bancă (refund străin pe plată; urmatoarea_la = infinity): nimic automat; doar «Reîncearcă»
  -- din /bilete o repune (de_trimis → verificarea H1 se reface înaintea oricărei trimiteri).
  IF r.stare = 'blocata' AND r.refund_id IS NULL THEN RETURN NULL; END IF;
  IF r.revendicata_pana IS NOT NULL AND r.revendicata_pana > now() THEN RETURN NULL; END IF;
  IF r.urmatoarea_la > now() THEN RETURN NULL; END IF;
  IF r.stare IN ('de_trimis', 'refuzata', 'revendicata') THEN
    SELECT count(*), count(*) FILTER (WHERE status = 'returnata'), count(*) FILTER (WHERE status IN ('anulata', 'platita_fara_bilet'))
      INTO n_tot, n_ret, n_vii FROM bilete_comenzi WHERE id = ANY (r.comenzi);
    IF n_tot <> cardinality(r.comenzi) OR n_ret + n_vii <> n_tot THEN
      UPDATE bilete_refund_intentii SET stare = 'anulata', revendicare_id = NULL, revendicata_pana = NULL,
             ultima_eroare = 'comanda nu mai e de returnat (reactivată sau emisă)', actualizata_la = now()
       WHERE id = p_id RETURNING * INTO r;
      RETURN r;
    END IF;
    IF n_ret = n_tot THEN
      UPDATE bilete_refund_intentii SET stare = 'finalizata_de_altul', finalizata_la = now(), revendicare_id = NULL, revendicata_pana = NULL,
             ultima_eroare = 'membrii returnați deja de alt refund (fluxul vechi); nu se trimite a doua oară', actualizata_la = now()
       WHERE id = p_id RETURNING * INTO r;
      RETURN r;
    END IF;
    IF n_ret > 0 THEN
      UPDATE bilete_refund_intentii SET stare = 'blocata', revendicare_id = NULL, revendicata_pana = NULL, urmatoarea_la = 'infinity',
             ultima_eroare = 'o parte din membri e deja returnată de alt refund; nu se trimite nimic automat', actualizata_la = now()
       WHERE id = p_id RETURNING * INTO r;
      INSERT INTO bilete_alerte (comanda_id, tip, detalii)
      VALUES (r.comenzi[1], 'refund_necunoscut', format('intentia %s: o parte din comenzi e deja returnată de alt refund; intenția e blocată în /bilete → «Returnări de bani»', r.id));
      RETURN r;
    END IF;
    -- Una singură în zbor pe plată (indexul unic ar refuza oricum): dacă alta e în lucru, așteaptă.
    IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE checkout_id = r.checkout_id AND id <> r.id
                AND stare IN ('revendicata', 'trimisa_necunoscut', 'creata', 'blocata')) THEN
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
-- într-o tranzacție; doar de către deținătorul revendicării. «blocata» cu refund_id (Manual → Accepted) se finalizează
-- la fel. Lacătul perechii întâi (M1), ca la anulare / reactivare. p_suma: suma confirmată de bancă pentru intențiile
-- importate cu suma estimată (null = păstrează).
DROP FUNCTION IF EXISTS public.bilete_refund_finalizeaza(uuid, uuid);
CREATE OR REPLACE FUNCTION public.bilete_refund_finalizeaza(p_id uuid, p_revendicare uuid, p_suma numeric DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_refund_intentii; n int; v_membri uuid[];
BEGIN
  SELECT comenzi INTO v_membri FROM bilete_refund_intentii WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INTENTIE_INEXISTENTA' USING ERRCODE = 'P0001'; END IF;
  PERFORM bilete_lacat_pereche(v_membri[1]);
  SELECT * INTO r FROM bilete_refund_intentii WHERE id = p_id FOR UPDATE;
  IF r.stare = 'finalizata' THEN RETURN 0; END IF;
  IF r.stare NOT IN ('creata', 'blocata') OR r.revendicare_id IS DISTINCT FROM p_revendicare THEN RAISE EXCEPTION 'INTENTIE_NEREVENDICATA' USING ERRCODE = 'P0001'; END IF;
  UPDATE bilete_refund_intentii SET stare = 'finalizata', finalizata_la = now(), revendicare_id = NULL, revendicata_pana = NULL,
         suma = CASE WHEN r.suma_estimata AND coalesce(p_suma, 0) > 0 THEN round(p_suma, 2) ELSE suma END,
         suma_estimata = r.suma_estimata AND NOT coalesce(p_suma, 0) > 0,
         actualizata_la = now() WHERE id = p_id;
  UPDATE bilete SET status = 'returnat' WHERE comanda_id = ANY (r.comenzi) AND status = 'anulat';
  UPDATE bilete_comenzi SET status = 'returnata', refund_finalizat_la = now(), updated_at = now()
   WHERE id = ANY (r.comenzi) AND status IN ('anulata', 'platita_fara_bilet');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- bilete_reactiveaza (copiată textual din 548) + 558: nu se reactivează o comandă al cărei refund e trimis, în lucru sau
-- făcut; intențiile refuzate ale ei devin «anulata» în aceeași tranzacție (nu se mai datorează nimic).
-- Revizia 10.10 (M1): rândurile intențiilor se blochează (FOR UPDATE) ÎNAINTE de verificare — o revendicare concurentă
-- (refuzata → revendicata → POST la bancă) fie a terminat și se vede aici (REFUND_EXISTENT), fie așteaptă și apoi vede
-- intenția «anulata». Ordinea: perechea → lacătul global → comanda → intențiile (revendicarea ia tot perechea întâi).
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
  PERFORM 1 FROM bilete_refund_intentii WHERE comenzi && v_membri ORDER BY id FOR UPDATE;
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

-- Revizia 10.10 (importul refund-urilor vechi în zbor): anulările făcute de fluxul VECHI (lib/bilete/refund.ts dinainte de
-- 558) au refund-ul cerut direct la bancă, fără intenție. Verificat live 10.10 seara: perechea tur f989089b… + returul din
-- pachet 91c3d4f4… (plata 3c50b39d…, refund 7348b233… «Created») — între timp finalizate de fluxul vechi (19 «returnata»,
-- 0 «anulata»); funcția rămâne pentru orice anulare veche în zbor la momentul aplicării. Ea NU trimite nimic: fiecare plată
-- cu comenzi «anulata» nefinalizate și cu urmă de refund vechi devine o intenție
--   * «creata» cu refund_id-ul existent (workerul doar citește getRefund și finalizează; nicio retrimitere), sau
--   * «trimisa_necunoscut» când fluxul vechi a rămas la «Pending» / «Necunoscut» fără refund_id (workerul împacă întâi cu
--     banca: urma există → «creata»; zero mișcare după liniște → abia atunci se poate trimite).
-- Suma: fluxul vechi n-a păstrat-o pe comandă (doar în răspunsul bilete_anuleaza și în motiv; bilete_comenzi are doar
-- scazut_la_refund). Se estimează Σ(total − scazut_la_refund) pe membri, plafonată la suma plății, cu suma_estimata = true;
-- workerul o înlocuiește cu getRefund.amount la finalizare. Membrii marcați PACHET_REFUND_OCUPAT (refund-ul plății e al
-- celuilalt bilet) nu intră: n-au refund la bancă și opresc migrația mai jos, ca orice anulare fără refund.
-- Tot aici, refund-urile vechi DEJA încheiate (comenzi «returnata», refund_id pe plată, fără intenție) devin intenții
-- «finalizata» istorice, cu suma confirmată de bancă (maib_checkouts.refunded_amount, scrisă de finalizarea veche): astfel
-- workerul nou recunoaște refund_id-ul lor ca «al nostru» și nu blochează (H1) al doilea refund legitim pe aceeași plată
-- (ex. returul din pachet returnat de fluxul vechi, turul anulat acum).
CREATE OR REPLACE FUNCTION public.bilete_refund_importa_vechi() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m maib_checkouts; v_membri uuid[]; v_suma numeric; n int := 0;
BEGIN
  FOR m IN SELECT k.* FROM maib_checkouts k
            WHERE EXISTS (SELECT 1 FROM bilete_comenzi c
                           WHERE (c.checkout_id = k.checkout_id
                                  OR (c.in_pachet AND c.comanda_tur_id IN (SELECT t.id FROM bilete_comenzi t WHERE t.checkout_id = k.checkout_id)))
                             AND c.status = 'anulata' AND c.refund_finalizat_la IS NULL)
              AND (k.refund_id IS NOT NULL OR k.refund_status IN ('Pending', 'Necunoscut'))
            ORDER BY k.checkout_id FOR UPDATE
  LOOP
    SELECT array_agg(x.id ORDER BY x.in_pachet, x.id), sum(x.total - coalesce(x.scazut_la_refund, 0)) INTO v_membri, v_suma
      FROM bilete_comenzi x
     WHERE (x.checkout_id = m.checkout_id
            OR (x.in_pachet AND x.comanda_tur_id IN (SELECT t.id FROM bilete_comenzi t WHERE t.checkout_id = m.checkout_id)))
       AND x.status = 'anulata' AND x.refund_finalizat_la IS NULL
       AND NOT EXISTS (SELECT 1 FROM bilete_refund_intentii i WHERE i.comenzi && ARRAY[x.id] AND i.stare <> 'anulata')
       AND NOT EXISTS (SELECT 1 FROM bilete_alerte a WHERE a.comanda_id = x.id AND a.detalii LIKE 'PACHET_REFUND_OCUPAT%');
    CONTINUE WHEN v_membri IS NULL OR coalesce(v_suma, 0) <= 0;
    INSERT INTO bilete_refund_intentii (checkout_id, comenzi, suma, suma_estimata, motiv, origine, cheie, stare, refund_id,
                                        banca_returnat, banca_cerut, banca_returnabil, trimisa_la, incercari, urmatoarea_la, ultima_eroare)
    VALUES (m.checkout_id, v_membri, round(least(v_suma, m.amount), 2), true,
            left(coalesce(nullif(trim(m.refund_reason), ''), 'refund cerut de fluxul vechi'), 500), 'import_vechi',
            format('import558:%s', m.checkout_id),
            CASE WHEN m.refund_id IS NOT NULL THEN 'creata' ELSE 'trimisa_necunoscut' END, m.refund_id,
            0, 0, NULL, coalesce(m.updated_at, now()), 1, now(),
            format('importat din fluxul vechi (refund %s, %s): doar se citește la bancă, nu se retrimite', coalesce(m.refund_id::text, 'fără id'), coalesce(m.refund_status, '-')))
    ON CONFLICT (cheie) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  FOR m IN SELECT k.* FROM maib_checkouts k
            WHERE k.refund_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM bilete_refund_intentii i WHERE i.checkout_id = k.checkout_id AND i.refund_id = k.refund_id)
              AND EXISTS (SELECT 1 FROM bilete_comenzi c WHERE c.checkout_id = k.checkout_id)
            ORDER BY k.checkout_id
  LOOP
    SELECT array_agg(x.id ORDER BY x.in_pachet, x.id), sum(x.total - coalesce(x.scazut_la_refund, 0)) INTO v_membri, v_suma
      FROM bilete_comenzi x
     WHERE (x.checkout_id = m.checkout_id
            OR (x.in_pachet AND x.comanda_tur_id IN (SELECT t.id FROM bilete_comenzi t WHERE t.checkout_id = m.checkout_id)))
       AND x.status = 'returnata'
       AND NOT EXISTS (SELECT 1 FROM bilete_refund_intentii i WHERE i.comenzi && ARRAY[x.id] AND i.stare <> 'anulata');
    CONTINUE WHEN v_membri IS NULL;
    INSERT INTO bilete_refund_intentii (checkout_id, comenzi, suma, suma_estimata, motiv, origine, cheie, stare, refund_id,
                                        incercari, urmatoarea_la, finalizata_la, ultima_eroare)
    VALUES (m.checkout_id, v_membri,
            round(CASE WHEN coalesce(m.refunded_amount, 0) > 0 THEN least(m.refunded_amount, m.amount) ELSE least(coalesce(v_suma, m.amount), m.amount) END, 2),
            NOT coalesce(m.refunded_amount, 0) > 0,
            left(coalesce(nullif(trim(m.refund_reason), ''), 'refund încheiat de fluxul vechi'), 500), 'import_vechi',
            format('import558f:%s', m.checkout_id), 'finalizata', m.refund_id, 1, now(),
            coalesce((SELECT max(refund_finalizat_la) FROM bilete_comenzi WHERE id = ANY (v_membri)), now()),
            'refund încheiat de fluxul vechi (istoric, 558)')
    ON CONFLICT (cheie) DO NOTHING;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bilete_refund_intentie_noua(uuid, uuid[], numeric, text, text, text)', 'bilete_refund_revendica(uuid, integer)',
    'bilete_refund_finalizeaza(uuid, uuid, numeric)', 'bilete_reactiveaza(uuid)',
    'bilete_comanda_activa(text, timestamptz, timestamptz, boolean, boolean)', 'bilete_cota_ocupata(date, int, boolean, text, uuid)',
    'bilete_retur_activ(uuid, uuid)', 'bilete_refund_importa_vechi()', 'bilete_anuleaza(uuid, text, text, numeric, boolean, boolean, numeric)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', t);
  END LOOP;
END $$;

-- Importul refund-urilor vechi în zbor (vezi bilete_refund_importa_vechi), apoi inventarul: o comandă «anulata»
-- nefinalizată care nici după import n-are intenție = anulare fără niciun refund la bancă → migrația se oprește
-- (nu ghicim dacă banii trebuie trimiși). Verificat live 10.10 seara: 0 astfel de comenzi.
DO $$
DECLARE n int; v_imp int;
BEGIN
  v_imp := bilete_refund_importa_vechi();
  RAISE NOTICE '558: % refund-uri vechi importate ca intenții (în zbor: %, istorice: %)', v_imp, (SELECT count(*) FROM bilete_refund_intentii WHERE origine = 'import_vechi' AND stare <> 'finalizata'), (SELECT count(*) FROM bilete_refund_intentii WHERE origine = 'import_vechi' AND stare = 'finalizata');
  SELECT count(*) INTO n FROM bilete_comenzi c WHERE c.status = 'anulata' AND c.refund_finalizat_la IS NULL
     AND NOT EXISTS (SELECT 1 FROM bilete_refund_intentii i WHERE i.comenzi && ARRAY[c.id] AND i.stare <> 'anulata');
  IF n > 0 THEN RAISE EXCEPTION '558: % comenzi anulate fără refund la bancă și fără intenție — de inventariat', n; END IF;
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

-- Probă a reviziei 10.10 (anulată la sfârșit): H1 (membrii returnați de fluxul vechi → «finalizata_de_altul»; amestec →
-- «blocata»), M2 (bani_inapoi și cota), importul refund-urilor vechi (refund_id → «creata»; Pending → «trimisa_necunoscut»;
-- suma de la bancă la finalizare), «blocata» (fără refund_id nu se revendică; cu refund_id se finalizează), M1 (reactivarea
-- blochează intențiile — aici: după o revendicare comisă, reactivarea vede «revendicata» și refuză).
DO $$
DECLARE s bilete_comenzi; tur bilete_comenzi; ret bilete_comenzi; ck uuid; ra int; rb int; base jsonb; n int; r jsonb;
        i bilete_refund_intentii; v uuid;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 558r', 'phone', '37360558559', 'test', false, 'seats', 1,
                             'from_name', 'Bălți', 'to_name', 'Chișinău', 'price_per_seat', 150, 'total', 150, 'promo_pereche', false, 'going_north', false, 'crm_route_id', rb);

  -- H1. anulare nouă (intenție de_trimis), apoi fluxul vechi a returnat comanda → nu se trimite a doua oară
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-11', 'departure_at', '2031-07-11T06:00:00+03', 'ip_hash', 'p558r1'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  PERFORM bilete_marcheaza_platita(ck);
  r := bilete_anuleaza(s.id, 'admin', 'probă 558r', 150, false, false, NULL);
  IF NOT (SELECT bani_inapoi FROM bilete_comenzi WHERE id = s.id) THEN RAISE EXCEPTION 'P558r: bani_inapoi nu s-a pus la anulare'; END IF;
  UPDATE bilete_comenzi SET status = 'returnata', refund_finalizat_la = now() WHERE id = s.id;
  i := bilete_refund_revendica((r->0->>'intentie')::uuid, 60);
  IF i.stare <> 'finalizata_de_altul' THEN RAISE EXCEPTION 'P558r H1: membru returnat de altul (%)', i.stare; END IF;
  IF (bilete_refund_revendica(i.id, 60)).id IS NOT NULL THEN RAISE EXCEPTION 'P558r H1: finalizata_de_altul revendicată'; END IF;

  -- H1 amestec: pachetul anulat (o intenție, doi membri), returul returnat de altul → «blocata», fără revendicare, alertă
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-12', 'crm_route_id', ra,
          'departure_at', '2031-07-12T06:00:00+03', 'promo_pereche', true, 'ip_hash', 'p558r2'));
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-14', 'going_north', true,
           'departure_at', '2031-07-14T15:00:00+03', 'from_name', 'Chișinău', 'to_name', 'Bălți', 'price_per_seat', 120, 'total', 120, 'promo_pereche', true,
           'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id, 'in_pachet', true, 'ip_hash', 'p558r3'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, tur.id::text, 'sandbox', 270, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = tur.id;
  PERFORM bilete_marcheaza_platita(ck);
  r := bilete_anuleaza(tur.id, 'admin', 'probă 558r', 150, false, false, NULL);
  UPDATE bilete_comenzi SET status = 'returnata' WHERE id = ret.id;
  i := bilete_refund_revendica((r->0->>'intentie')::uuid, 60);
  IF i.stare <> 'blocata' OR i.urmatoarea_la <> 'infinity' OR NOT EXISTS (SELECT 1 FROM bilete_alerte WHERE comanda_id = tur.id AND detalii LIKE 'intentia ' || i.id || '%') THEN
    RAISE EXCEPTION 'P558r H1: amestec (%)', i.stare;
  END IF;
  UPDATE bilete_refund_intentii SET urmatoarea_la = now() - interval '1 second' WHERE id = i.id;
  IF (bilete_refund_revendica(i.id, 60)).id IS NOT NULL THEN RAISE EXCEPTION 'P558r: blocata fără refund_id revendicată'; END IF;
  -- «blocata» cu refund_id (Manual): se revendică pentru citire și se finalizează (Manual → Accepted)
  UPDATE bilete_refund_intentii SET refund_id = gen_random_uuid() WHERE id = i.id;
  UPDATE bilete_comenzi SET status = 'anulata' WHERE id = ret.id;
  i := bilete_refund_revendica(i.id, 60);
  IF i.stare <> 'blocata' OR i.revendicare_id IS NULL THEN RAISE EXCEPTION 'P558r: blocata cu refund_id nerevendicată'; END IF;
  -- M1: reactivarea vede intenția în zbor (blocata) și refuză
  BEGIN
    PERFORM bilete_reactiveaza(tur.id);
    RAISE EXCEPTION 'P558r M1: reactivare peste o intenție blocată la bancă';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'REFUND_EXISTENT' THEN RAISE; END IF; END;
  n := bilete_refund_finalizeaza(i.id, i.revendicare_id);
  IF n <> 2 THEN RAISE EXCEPTION 'P558r: finalizarea din blocata (%)', n; END IF;

  -- M2. «platita_fara_bilet» cu banii în drum înapoi nu ține loc din cotă; intenția anulată → îl ține din nou
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-15', 'departure_at', '2031-07-15T06:00:00+03', 'ip_hash', 'p558r4', 'seats', 2, 'total', 300));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 300, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck, status = 'platita_fara_bilet', loc_cheie = ARRAY['proba558r'] WHERE id = s.id;
  IF bilete_cota_ocupata(s.trip_date, s.crm_route_id, s.going_north, 'proba558r', NULL) <> 2 THEN RAISE EXCEPTION 'P558r M2: fără intenție ține locul'; END IF;
  v := bilete_refund_intentie_noua(ck, ARRAY[s.id], 300, 'probă', 'plata_tarzie', 'p558r:m2');
  IF NOT (SELECT bani_inapoi FROM bilete_comenzi WHERE id = s.id) OR bilete_cota_ocupata(s.trip_date, s.crm_route_id, s.going_north, 'proba558r', NULL) <> 0
     OR bilete_comanda_activa('platita_fara_bilet', now(), NULL, false, true) OR NOT bilete_comanda_activa('platita_fara_bilet', now(), NULL, true, true) THEN
    RAISE EXCEPTION 'P558r M2: banii înapoi încă țin locul';
  END IF;
  UPDATE bilete_refund_intentii SET stare = 'anulata' WHERE id = v;
  IF (SELECT bani_inapoi FROM bilete_comenzi WHERE id = s.id) OR bilete_cota_ocupata(s.trip_date, s.crm_route_id, s.going_north, 'proba558r', NULL) <> 2 THEN
    RAISE EXCEPTION 'P558r M2: intenția anulată n-a redat locul';
  END IF;

  -- Import: anulare veche cu refund_id «Created» → «creata», suma estimată, finalizată cu suma băncii
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-16', 'departure_at', '2031-07-16T06:00:00+03', 'ip_hash', 'p558r5'));
  ck := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount) VALUES (ck, s.id::text, 'sandbox', 150, 'Completed', 'Executed', 0);
  UPDATE bilete_comenzi SET checkout_id = ck WHERE id = s.id;
  PERFORM bilete_marcheaza_platita(ck);
  UPDATE bilete SET status = 'anulat' WHERE comanda_id = s.id;
  UPDATE bilete_comenzi SET status = 'anulata', cancelled_at = now(), cancel_source = 'pasager' WHERE id = s.id;
  v := gen_random_uuid();
  UPDATE maib_checkouts SET refund_id = v, refund_status = 'Created', refund_reason = 'anulare veche (135 lei după grilă)' WHERE checkout_id = ck;
  -- returul fără refund la bancă (fluxul vechi: Pending) pe altă plată
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-17', 'departure_at', '2031-07-17T06:00:00+03', 'ip_hash', 'p558r6'));
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, refund_status)
  VALUES (gen_random_uuid(), tur.id::text, 'sandbox', 150, 'Completed', 'Executed', 0, 'Pending') RETURNING checkout_id INTO ck;
  UPDATE bilete_comenzi SET checkout_id = ck, status = 'anulata', cancelled_at = now() WHERE id = tur.id;
  n := bilete_refund_importa_vechi();
  IF n < 2 THEN RAISE EXCEPTION 'P558r import: % intenții', n; END IF;
  -- istoricul: comanda H1 (returnată «de altul», fără refund_id pe plată) nu primește intenție istorică; una returnată de
  -- fluxul vechi cu refund_id pe plată primește «finalizata» cu suma băncii
  IF EXISTS (SELECT 1 FROM bilete_refund_intentii WHERE stare = 'finalizata' AND origine = 'import_vechi' AND checkout_id IN
             (SELECT checkout_id FROM maib_checkouts WHERE refund_id IS NULL)) THEN RAISE EXCEPTION 'P558r import istoric fără refund_id'; END IF;
  SELECT * INTO i FROM bilete_refund_intentii WHERE comenzi = ARRAY[s.id];
  IF i.stare <> 'creata' OR i.refund_id <> v OR i.suma <> 150 OR NOT i.suma_estimata OR i.origine <> 'import_vechi' THEN RAISE EXCEPTION 'P558r import creata (% %)', i.stare, i.suma; END IF;
  IF bilete_refund_importa_vechi() <> 0 THEN RAISE EXCEPTION 'P558r import: al doilea import a dublat'; END IF;
  i := bilete_refund_revendica(i.id, 60);
  IF i.stare <> 'creata' OR i.revendicare_id IS NULL THEN RAISE EXCEPTION 'P558r import: revendicarea pentru citire'; END IF;
  PERFORM bilete_refund_finalizeaza(i.id, i.revendicare_id, 135);
  SELECT * INTO i FROM bilete_refund_intentii WHERE id = i.id;
  IF i.stare <> 'finalizata' OR i.suma <> 135 OR i.suma_estimata OR (SELECT status FROM bilete_comenzi WHERE id = s.id) <> 'returnata' THEN
    RAISE EXCEPTION 'P558r import: finalizarea cu suma băncii (% %)', i.stare, i.suma;
  END IF;
  SELECT * INTO i FROM bilete_refund_intentii WHERE comenzi = ARRAY[tur.id];
  IF i.stare <> 'trimisa_necunoscut' OR i.refund_id IS NOT NULL OR i.trimisa_la IS NULL THEN RAISE EXCEPTION 'P558r import Pending (%)', i.stare; END IF;
  -- istoric: returnată de fluxul vechi (refund_id + refunded_amount pe plată) → «finalizata» cu suma băncii, refund_id-ul ei
  s := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'trip_date', '2031-07-18', 'departure_at', '2031-07-18T06:00:00+03', 'ip_hash', 'p558r7'));
  v := gen_random_uuid();
  INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, refund_id, refund_status)
  VALUES (gen_random_uuid(), s.id::text, 'sandbox', 150, 'Completed', 'Refunded', 127.5, v, 'Accepted') RETURNING checkout_id INTO ck;
  UPDATE bilete_comenzi SET checkout_id = ck, status = 'returnata', refund_finalizat_la = now() WHERE id = s.id;
  IF bilete_refund_importa_vechi() <> 1 THEN RAISE EXCEPTION 'P558r import istoric: numărul'; END IF;
  SELECT * INTO i FROM bilete_refund_intentii WHERE checkout_id = ck;
  IF i.stare <> 'finalizata' OR i.suma <> 127.5 OR i.suma_estimata OR i.refund_id <> v OR i.comenzi <> ARRAY[s.id] THEN RAISE EXCEPTION 'P558r import istoric (% %)', i.stare, i.suma; END IF;
  RAISE EXCEPTION 'PROBA558R_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA558R_OK' THEN RAISE; END IF;
END $$;
