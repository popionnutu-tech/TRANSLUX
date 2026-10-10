-- 561: N4 (dezbaterea Claude–Codex despre bronare și plată, 10.10.2026) — returul din tur-retur cumpărat în mini app-ul
-- Telegram nu primea contul: /api/bilete/comanda lega doar turul, deci botul nu livra returul în chat și «Biletele mele»
-- nu-l arăta. Codul nou leagă turul + returul din pachet (lib/bilete/leaga-telegram.ts). Aici, o singură dată, retururile
-- din pachet ÎNCĂ ACTIVE ale căror tururi au contul DOVEDIT (telegram_verificat_pentru = telegram_id: mini app-ul cu
-- initData verificat sau cele 4 cifre ale telefonului) primesc același cont. Fără nicio asociere după telefon: turul legat
-- doar prin trigger-ul 555 (oprit de 556) nu dă contul returului. La 10.10 în bază: 0 rânduri de acest fel (cele 4 găsite
-- sunt «returnata», probe), deci UPDATE-ul atinge 0 rânduri azi; rămâne ca plasă pentru comenzile dintre 10.10 și deploy.
-- Livrarea nu se dublează: returul are propria revendicare (telegram_livrare_la / telegram_livrat_la, 516); rândurile
-- deja livrate sau cu mesaj nu se ating.

CREATE FUNCTION pg_temp.n4_leaga_retururi() RETURNS int LANGUAGE sql AS $$
  WITH upd AS (
    UPDATE bilete_comenzi r
       SET telegram_id = t.telegram_id, telegram_verificat_pentru = t.telegram_id
      FROM bilete_comenzi t
     WHERE r.in_pachet = true
       AND r.comanda_tur_id = t.id
       AND r.telegram_id IS NULL
       AND r.telegram_livrat_la IS NULL AND r.telegram_mesaj_id IS NULL
       AND r.status IN ('noua', 'platita', 'platita_fara_bilet')
       AND r.departure_at > now()
       AND t.telegram_id IS NOT NULL
       AND t.telegram_verificat_pentru = t.telegram_id
    RETURNING r.id)
  SELECT count(*)::int FROM upd
$$;

-- Probă (anulată la sfârșit): o pereche tur + retur pusă pe două comenzi existente; doar returul din pachet al turului
-- dovedit primește contul; un tur nedovedit (cont fără telegram_verificat_pentru) nu dă nimic.
DO $$
DECLARE a uuid; b uuid; c uuid; n int; r bilete_comenzi;
BEGIN
  -- o pereche reală din pachet (constrângerea bilete_comenzi_pachet_retur), pusă în starea de probă
  SELECT comanda_tur_id, id INTO a, b FROM bilete_comenzi WHERE in_pachet ORDER BY created_at LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'PROBA561_OK'; END IF;
  SELECT id INTO c FROM bilete_comenzi WHERE id NOT IN (a, b) ORDER BY created_at LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'PROBA561_OK'; END IF;
  UPDATE bilete_comenzi SET telegram_id = 561561561, telegram_verificat_pentru = 561561561, in_pachet = false, comanda_tur_id = NULL WHERE id = a;
  UPDATE bilete_comenzi SET telegram_id = NULL, telegram_livrat_la = NULL, telegram_mesaj_id = NULL,
         status = 'platita', departure_at = now() + interval '2 days' WHERE id = b;
  -- c: retur al aceluiași tur, dar NU din pachet → neatins
  UPDATE bilete_comenzi SET telegram_id = NULL, in_pachet = false, comanda_tur_id = a, status = 'noua', departure_at = now() + interval '2 days' WHERE id = c;
  n := pg_temp.n4_leaga_retururi();
  SELECT * INTO r FROM bilete_comenzi WHERE id = b;
  IF r.telegram_id IS DISTINCT FROM 561561561 OR r.telegram_verificat_pentru IS DISTINCT FROM 561561561 THEN RAISE EXCEPTION 'P561: returul din pachet n-a primit contul (%)', r.telegram_id; END IF;
  IF (SELECT telegram_id FROM bilete_comenzi WHERE id = c) IS NOT NULL THEN RAISE EXCEPTION 'P561: returul din afara pachetului a primit contul'; END IF;
  -- a doua rulare: nimic (idempotentă)
  IF pg_temp.n4_leaga_retururi() <> 0 THEN RAISE EXCEPTION 'P561: a doua rulare a mai legat ceva'; END IF;
  -- turul nedovedit: contul fără verificare nu se propagă
  UPDATE bilete_comenzi SET telegram_id = NULL, telegram_verificat_pentru = NULL WHERE id = b;
  UPDATE bilete_comenzi SET telegram_verificat_pentru = NULL WHERE id = a;
  IF pg_temp.n4_leaga_retururi() <> 0 THEN RAISE EXCEPTION 'P561: turul nedovedit a dat contul returului'; END IF;
  RAISE EXCEPTION 'PROBA561_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA561_OK' THEN RAISE; END IF;
END $$;

-- Corectura propriu-zisă.
DO $$
DECLARE n int;
BEGIN
  n := pg_temp.n4_leaga_retururi();
  RAISE NOTICE '561: retururi din pachet legate de contul turului: %', n;
END $$;

DROP FUNCTION pg_temp.n4_leaga_retururi();
