-- 550_bilete_inlocuieste_incercare.sql — o încercare eșuată de cumpărare nu mai ține locurile (Ion, 10.10.2026: «gândește-te
-- tot acest proces să fie ușor pentru client și intuitiv»; planul docs/plans/2026-10-10-tur-retur-ux-simplu.md, 3 runde
-- Claude + Codex, «Tranzițiile înlocuirii»).
--
-- Când omul schimbă alegerea după o încercare care a creat deja rândul turului (ex. returul a picat pe cota de 4), site-ul
-- trimite comanda nouă cu cheia de idempotență VECHE a turului (UUID aleator generat în browserul lui — dovada posesiei;
-- telefonul singur nu e dovadă, Codex r2 C2). Funcția expiră atomic acea încercare și returul ei din pachet, dar numai dacă
-- nu poate exista bani pe ea:
--   * `noua`, fără nicio încercare la bancă → `inlocuit`;
--   * `noua`/`eroare_creare` cu încercări la bancă → doar după ce aplicația a verificat la maib că nu există sesiune
--     deschisă, cu `p_incercari` = numărul citit atunci (o încercare nouă între timp îl schimbă → `la_banca`);
--   * sesiune legată sau revendicare în curs → `la_banca`; plătită/anulată/expirată/alt telefon/test → `nimic`.
-- Protocolul de blocare din 546/548: lacătul perechii (turul), apoi cel global, apoi rândul (UPDATE condiționat). Revendicarea
-- sesiunii (comenzi.ts asiguraSesiunea) e tot un UPDATE condiționat pe același rând: doar una dintre ele reușește.

CREATE OR REPLACE FUNCTION public.bilete_inlocuieste_incercare(p_cheie uuid, p_phone text, p_incercari int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; n int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE idempotency_key = p_cheie;
  IF NOT FOUND OR c.phone IS DISTINCT FROM p_phone OR c.test OR c.comanda_tur_id IS NOT NULL THEN RETURN 'nimic'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bilete_pereche:' || c.id::text));
  PERFORM pg_advisory_xact_lock(hashtext('bilete_comanda'));
  SELECT * INTO c FROM bilete_comenzi WHERE id = c.id;
  IF c.status NOT IN ('noua', 'eroare_creare') THEN RETURN 'nimic'; END IF;
  IF c.checkout_id IS NOT NULL OR c.creare_in_curs_la IS NOT NULL THEN RETURN 'la_banca'; END IF;
  IF c.creare_incercari > 0 AND (p_incercari IS NULL OR p_incercari <> c.creare_incercari) THEN RETURN 'la_banca'; END IF;
  UPDATE bilete_comenzi SET status = 'expirata', updated_at = now()
   WHERE id = c.id AND status IN ('noua', 'eroare_creare') AND checkout_id IS NULL AND creare_in_curs_la IS NULL
     AND creare_incercari = c.creare_incercari;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RETURN 'la_banca'; END IF;
  UPDATE bilete_comenzi SET status = 'expirata', updated_at = now()
   WHERE comanda_tur_id = c.id AND in_pachet AND status IN ('noua', 'eroare_creare');
  RETURN 'inlocuit';
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_inlocuieste_incercare(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_inlocuieste_incercare(uuid, text, int) TO service_role;

-- Probe (anulate la sfârșit): 3 locuri pe cota 4 → înlocuire → 2 locuri trec; alt telefon → nimic; încercare la bancă fără
-- confirmare → la_banca; cu numărul confirmat → inlocuit; returul din pachet expiră cu turul; un rând plătit → nimic.
DO $$
DECLARE tur bilete_comenzi; ret bilete_comenzi; t2 bilete_comenzi; ra int; rb int; base jsonb; k uuid := gen_random_uuid(); r text; n int;
BEGIN
  SELECT min(id) INTO ra FROM crm_routes WHERE active;
  SELECT min(id) INTO rb FROM crm_routes WHERE active AND id <> ra;
  base := jsonb_build_object('from_stop_order', 1, 'to_stop_order', 2, 'passenger_name', 'Proba 550', 'phone', '37360550550',
    'promo_pereche', true, 'test', false, 'from_name', 'Bălți', 'to_name', 'Chișinău', 'going_north', false,
    'trip_date', '2031-07-01', 'crm_route_id', ra, 'departure_at', '2031-07-01T06:00:00+03',
    'loc_cheie', jsonb_build_array('balti'), 'cota_online', 4);
  tur := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', k, 'seats', 3, 'price_per_seat', 150, 'total', 450, 'ip_hash', 'p550a'));
  ret := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'seats', 3, 'going_north', true,
    'from_name', 'Chișinău', 'to_name', 'Bălți', 'trip_date', '2031-07-03', 'crm_route_id', rb, 'departure_at', '2031-07-03T15:00:00+03',
    'price_per_seat', 120, 'total', 360, 'pret_intreg', 150, 'reducere_tip', 'retur', 'reducere_pct', 20, 'comanda_tur_id', tur.id,
    'in_pachet', true, 'ip_hash', 'p550b', 'loc_cheie', jsonb_build_array('balti')));
  -- fără înlocuire: 2 locuri pe aceeași cursă depășesc cota (3 + 2 > 4)
  BEGIN
    PERFORM bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'seats', 2, 'price_per_seat', 150, 'total', 300, 'ip_hash', 'p550c'));
    RAISE EXCEPTION 'P550: cota nu a oprit încercarea dublă';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'COTA_PLINA:%' THEN RAISE; END IF; END;
  r := bilete_inlocuieste_incercare(k, '37360000000', 0);
  IF r <> 'nimic' THEN RAISE EXCEPTION 'P550: alt telefon a înlocuit (%)', r; END IF;
  UPDATE bilete_comenzi SET creare_incercari = 1, status = 'eroare_creare' WHERE id = tur.id;
  r := bilete_inlocuieste_incercare(k, '37360550550', NULL);
  IF r <> 'la_banca' THEN RAISE EXCEPTION 'P550: încercarea la bancă neconfirmată a trecut (%)', r; END IF;
  r := bilete_inlocuieste_incercare(k, '37360550550', 1);
  IF r <> 'inlocuit' THEN RAISE EXCEPTION 'P550: înlocuirea confirmată (%)', r; END IF;
  SELECT * INTO ret FROM bilete_comenzi WHERE id = ret.id;
  IF ret.status <> 'expirata' THEN RAISE EXCEPTION 'P550: returul din pachet a rămas %', ret.status; END IF;
  t2 := bilete_creeaza_comanda(base || jsonb_build_object('idempotency_key', gen_random_uuid(), 'seats', 2, 'price_per_seat', 150, 'total', 300, 'ip_hash', 'p550d'));
  IF t2.seats <> 2 THEN RAISE EXCEPTION 'P550: comanda nouă n-a trecut'; END IF;
  UPDATE bilete_comenzi SET status = 'platita' WHERE id = t2.id;
  r := bilete_inlocuieste_incercare(t2.idempotency_key, '37360550550', 0);
  IF r <> 'nimic' THEN RAISE EXCEPTION 'P550: o comandă plătită a fost atinsă (%)', r; END IF;
  RAISE EXCEPTION 'PROBA550_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA550_OK' THEN RAISE; END IF;
END $$;
