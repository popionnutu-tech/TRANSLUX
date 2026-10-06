-- Testul de stres al biletelor online (Ion, 06.10: «fă 10000 de ori test la tot sistemul, de la căutare până la plată,
-- apoi scanare»). Rulează ÎNTR-O TRANZACȚIE care se anulează (db-migrate --dry-run): nu rămâne nimic în bază.
-- 10.000 de cicluri pe funcțiile reale din bază: comanda → sesiunea maib plătită → biletele emise → scanarea la urcare
-- (prima câștigă, a doua nu mai trece) → anulare / anulare refuzată pe bilet urcat → plăți greșite (refund, sumă diferită).
-- La sfârșit: invarianții pe toate cursele (locuri unice, capacitate 20, bilete = locuri plătite). Orice abatere → EXCEPTION.
SET LOCAL statement_timeout = 0;
DO $$
DECLARE
  rute int[]; nrute int; i int; k int; r int; north boolean; zi date; seats int; pret numeric; c bilete_comenzi;
  ck uuid; n int; b_first uuid; ok_scan int; err text;
  cnt_comenzi int := 0; cnt_bilete int := 0; cnt_scan_ok int := 0; cnt_scan_dublu_refuzat int := 0;
  cnt_anulate int := 0; cnt_anulare_refuzata int := 0; cnt_refund_fara_bilet int := 0; cnt_suma_gresita int := 0;
  cnt_idempotent int := 0; cnt_scan_pe_anulat_refuzat int := 0; cnt_loc_ales int := 0; cnt_loc_ocupat int := 0;
  esecuri int := 0; t0 timestamptz := clock_timestamp();
  locuri smallint[];
BEGIN
  SELECT array_agg(id ORDER BY id) INTO rute FROM crm_routes WHERE active;
  nrute := cardinality(rute);
  IF nrute IS NULL OR nrute = 0 THEN RAISE EXCEPTION 'nicio rută activă'; END IF;

  FOR i IN 1..10000 LOOP
    k := i % 10;
    r := rute[1 + (i % nrute)];
    north := (i / nrute) % 2 = 1;
    zi := DATE '2026-11-01' + ((i / (nrute * 2)) % 30);
    seats := 1 + (i % 4);
    pret := 50 + (i % 7) * 15;
    locuri := NULL;
    -- 1 din 5 comenzi retur alege locurile (ca pe site); se pot ciocni — LOC_OCUPAT e un refuz corect.
    IF north AND i % 5 = 0 THEN
      SELECT array_agg(x::smallint) INTO locuri FROM (SELECT x FROM generate_series(1, 20) x ORDER BY md5(i::text || x::text) LIMIT seats) s;
    END IF;

    BEGIN
      c := bilete_creeaza_comanda(jsonb_build_object(
        'idempotency_key', gen_random_uuid(), 'trip_date', zi, 'crm_route_id', r, 'going_north', north,
        'from_stop_order', 10, 'to_stop_order', 340, 'from_name', 'Stres', 'to_name', 'Stres',
        'departure_at', (zi::timestamp + interval '6 hours') AT TIME ZONE 'Europe/Chisinau', 'seats', seats,
        'price_per_seat', pret, 'total', pret * seats, 'passenger_name', 'Stres ' || i, 'phone', '3736' || lpad(i::text, 7, '0'),
        'ip_hash', 'stres' || i, 'test', true, 'locuri_alese', coalesce(to_jsonb(locuri), '[]'::jsonb)));
    EXCEPTION WHEN OTHERS THEN
      err := SQLERRM;
      IF err LIKE 'LOC_OCUPAT%' THEN cnt_loc_ocupat := cnt_loc_ocupat + 1; CONTINUE; END IF;
      RAISE EXCEPTION 'ciclul % (creare): %', i, err;
    END;
    cnt_comenzi := cnt_comenzi + 1;
    IF locuri IS NOT NULL THEN cnt_loc_ales := cnt_loc_ales + 1; END IF;

    -- Plata: sesiunea maib. k=9 → returnată înainte de emitere; i%97=0 → suma diferită. Restul: plată executată.
    ck := gen_random_uuid();
    INSERT INTO maib_checkouts (checkout_id, order_id, mediu, amount, status, payment_status, refunded_amount, refund_id)
    VALUES (ck, c.id::text, 'sandbox',
            CASE WHEN i % 97 = 0 THEN c.total + 1 ELSE c.total END,
            'Completed', 'Executed',
            CASE WHEN k = 9 THEN c.total ELSE 0 END,
            CASE WHEN k = 9 THEN gen_random_uuid() ELSE NULL END);
    UPDATE bilete_comenzi SET checkout_id = ck WHERE id = c.id;
    n := bilete_marcheaza_platita(ck);

    IF k = 9 OR i % 97 = 0 THEN
      IF n <> 0 OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = c.id) THEN
        esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: bilete emise pe o plată greșită', i;
      END IF;
      IF k = 9 THEN cnt_refund_fara_bilet := cnt_refund_fara_bilet + 1; ELSE cnt_suma_gresita := cnt_suma_gresita + 1; END IF;
      UPDATE bilete_comenzi SET status = 'expirata' WHERE id = c.id;  -- ca plafonul «noua» să nu se umple
      CONTINUE;
    END IF;

    IF n <> seats OR (SELECT count(*) FROM bilete WHERE comanda_id = c.id AND status = 'valid') <> seats
       OR (SELECT status FROM bilete_comenzi WHERE id = c.id) <> 'platita' THEN
      esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: emiterea a dat % bilete în loc de %', i, n, seats;
    END IF;
    cnt_bilete := cnt_bilete + seats;

    -- Callback-ul repetat de bancă: nimic nou.
    IF bilete_marcheaza_platita(ck) <> 0 OR (SELECT count(*) FROM bilete WHERE comanda_id = c.id) <> seats THEN
      esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: plata repetată a schimbat biletele', i;
    ELSE cnt_idempotent := cnt_idempotent + 1; END IF;

    SELECT id INTO b_first FROM bilete WHERE comanda_id = c.id ORDER BY nr LIMIT 1;

    IF k <= 5 OR k = 8 THEN
      -- Scanarea la urcare, exact ca ruta șoferului: UPDATE … WHERE status = 'valid' — prima câștigă.
      UPDATE bilete SET status = 'urcat', urcat_at = now(), urcat_sursa = 'scan' WHERE id = b_first AND status = 'valid';
      GET DIAGNOSTICS ok_scan = ROW_COUNT;
      IF ok_scan <> 1 THEN esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: prima scanare nu a trecut', i; ELSE cnt_scan_ok := cnt_scan_ok + 1; END IF;
      UPDATE bilete SET status = 'urcat', urcat_at = now() WHERE id = b_first AND status = 'valid';
      GET DIAGNOSTICS ok_scan = ROW_COUNT;
      IF ok_scan <> 0 THEN esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: a doua scanare a trecut', i; ELSE cnt_scan_dublu_refuzat := cnt_scan_dublu_refuzat + 1; END IF;
    END IF;

    IF k = 8 THEN
      -- Biletul urcat nu se mai poate anula.
      BEGIN
        PERFORM bilete_anuleaza(c.id, 'admin', 'stres');
        esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: anularea a trecut deși un bilet e urcat', i;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'BILET_URCAT' THEN cnt_anulare_refuzata := cnt_anulare_refuzata + 1;
        ELSE RAISE EXCEPTION 'ciclul % (anulare): %', i, SQLERRM; END IF;
      END;
    ELSIF k IN (6, 7) THEN
      PERFORM bilete_anuleaza(c.id, 'admin', 'stres');
      IF (SELECT status FROM bilete_comenzi WHERE id = c.id) <> 'anulata'
         OR EXISTS (SELECT 1 FROM bilete WHERE comanda_id = c.id AND status <> 'anulat') THEN
        esecuri := esecuri + 1; RAISE NOTICE 'ciclul %: anularea n-a închis biletele', i;
      ELSE cnt_anulate := cnt_anulate + 1; END IF;
      -- Scanarea unui bilet anulat nu trece.
      UPDATE bilete SET status = 'urcat' WHERE id = b_first AND status = 'valid';
      GET DIAGNOSTICS ok_scan = ROW_COUNT;
      IF ok_scan <> 0 THEN esecuri := esecuri + 1; ELSE cnt_scan_pe_anulat_refuzat := cnt_scan_pe_anulat_refuzat + 1; END IF;
      -- Anularea repetată: idempotentă.
      PERFORM bilete_anuleaza(c.id, 'admin', 'stres');
    END IF;
  END LOOP;

  -- Invarianți pe toate cursele de test: un loc nu e dat de două ori; locurile sunt 1..20; biletele vii au loc,
  -- iar cele fără loc au alertă «fara_loc».
  SELECT count(*) INTO n FROM (
    SELECT b.trip_date, b.crm_route_id, b.going_north, b.loc_nr FROM bilete b JOIN bilete_comenzi cc ON cc.id = b.comanda_id
     WHERE cc.passenger_name LIKE 'Stres %' AND b.status IN ('valid', 'urcat') AND b.loc_nr IS NOT NULL
     GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) d;
  IF n > 0 THEN esecuri := esecuri + 1; RAISE NOTICE 'INVARIANT: % locuri date de două ori', n; END IF;
  SELECT count(*) INTO n FROM bilete b JOIN bilete_comenzi cc ON cc.id = b.comanda_id
   WHERE cc.passenger_name LIKE 'Stres %' AND (b.loc_nr < 1 OR b.loc_nr > 20);
  IF n > 0 THEN esecuri := esecuri + 1; RAISE NOTICE 'INVARIANT: % locuri în afara 1..20', n; END IF;
  SELECT count(*) INTO n FROM bilete b JOIN bilete_comenzi cc ON cc.id = b.comanda_id
   WHERE cc.passenger_name LIKE 'Stres %' AND b.status IN ('valid', 'urcat') AND b.loc_nr IS NULL
     AND NOT EXISTS (SELECT 1 FROM bilete_alerte a WHERE a.comanda_id = cc.id AND a.tip = 'fara_loc');
  IF n > 0 THEN esecuri := esecuri + 1; RAISE NOTICE 'INVARIANT: % bilete vii fără loc și fără alertă', n; END IF;

  RAISE NOTICE 'REZUMAT: % cicluri în % s; comenzi %; bilete emise %; plată repetată fără efect %; scanări ok %; a doua scanare refuzată %; anulate %; scanare pe anulat refuzată %; anulare refuzată pe bilet urcat %; refund înainte de emitere fără bilete %; sumă greșită fără bilete %; locuri alese %; LOC_OCUPAT refuzate corect %; ESECURI %',
    10000, round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1), cnt_comenzi, cnt_bilete, cnt_idempotent, cnt_scan_ok,
    cnt_scan_dublu_refuzat, cnt_anulate, cnt_scan_pe_anulat_refuzat, cnt_anulare_refuzata, cnt_refund_fara_bilet, cnt_suma_gresita,
    cnt_loc_ales, cnt_loc_ocupat, esecuri;
  SELECT count(*) INTO n FROM bilete_alerte a JOIN bilete_comenzi cc ON cc.id = a.comanda_id WHERE cc.passenger_name LIKE 'Stres %' AND a.tip = 'fara_loc';
  RAISE NOTICE 'curse pline (alertă fara_loc): %', n;
  IF esecuri > 0 THEN RAISE EXCEPTION 'TESTUL A GĂSIT % ABATERI', esecuri; END IF;
END $$;
