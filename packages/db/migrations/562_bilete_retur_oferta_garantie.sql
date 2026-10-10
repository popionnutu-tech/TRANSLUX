-- 562: C6 (dezbaterea Claude–Codex despre bronare și plată, 10.10.2026) — garanția de lansare nu mergea din botul Telegram.
-- Cu garanția activă (app_config.bilete_garantie_100_pana ≥ azi, ziua Chișinăului; Ion, 07.10: «100% garantat banii dacă
-- călătoria nu a fost»), codul (retur-bot-reguli.ts, calculeazaOferta) dă biletului nefolosit toată suma și sub 4 h, până
-- la plecare + 24 h, iar pagina biletului și asistentul site-ului o și execută. Funcția ofertei din bot (503) respingea
-- însă orice expirare după «plecarea − 240 min» → botul răspundea «sub 4 h, fără bani», contrar condițiilor. Acum: cu
-- garanția activă, expirarea e acceptată până la plecare + 24 h; fără garanție, regula din 503 rămâne neschimbată.
-- Corpul e copiat textual din definiția vie (pg_get_functiondef, 10.10.2026, identică cu 503); se schimbă doar linia expirării.
-- Comparația datei e textuală, ca în cod (garantieActiva: «azi ≤ data», ambele YYYY-MM-DD), deci o valoare stricată nu aruncă.

CREATE OR REPLACE FUNCTION public.bilete_retur_oferta_noua(
  p_comanda uuid, p_telegram bigint, p_noimi int, p_suma numeric, p_total numeric, p_expira timestamptz
) RETURNS bilete_retur_oferte
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; o bilete_retur_oferte; v_pana text; v_garantie boolean;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF p_telegram IS NULL OR c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NELEGAT'; END IF;
  IF c.telegram_verificat_pentru IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NEVERIFICAT'; END IF;
  IF c.status NOT IN ('platita', 'platita_fara_bilet') THEN RAISE EXCEPTION 'OFERTA_STARE'; END IF;
  -- 562 (C6): garanția de lansare — aceeași regulă ca garantieActiva() din cod.
  SELECT btrim(coalesce(value, '')) INTO v_pana FROM app_config WHERE key = 'bilete_garantie_100_pana';
  v_garantie := coalesce(v_pana ~ '^\d{4}-\d{2}-\d{2}$' AND to_char((now() AT TIME ZONE 'Europe/Chisinau')::date, 'YYYY-MM-DD') <= v_pana, false);
  IF p_expira <= now()
     OR (v_garantie AND p_expira > c.departure_at + interval '24 hours')
     OR (NOT v_garantie AND p_expira > c.departure_at - interval '240 minutes') THEN
    RAISE EXCEPTION 'OFERTA_EXPIRARE_GRESITA';
  END IF;
  IF p_total <> c.total OR p_suma <= 0 OR p_suma > c.total THEN RAISE EXCEPTION 'OFERTA_SUMA_GRESITA'; END IF;
  UPDATE bilete_retur_oferte SET inchisa_la = now()
   WHERE comanda_id = p_comanda AND folosita_la IS NULL AND inchisa_la IS NULL;
  INSERT INTO bilete_retur_oferte (comanda_id, telegram_id, noimi, suma, total, expira_la)
  VALUES (p_comanda, p_telegram, p_noimi, p_suma, p_total, p_expira) RETURNING * INTO o;
  RETURN o;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz) TO service_role;

-- Probe (anulate la sfârșit): o comandă existentă pusă în starea «plătită, legată, verificată».
DO $$
DECLARE c uuid; o bilete_retur_oferte; tot numeric;
BEGIN
  IF has_function_privilege('anon', 'public.bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bilete_retur_oferta_noua(uuid, bigint, int, numeric, numeric, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P562: funcția e executabilă de anon/authenticated';
  END IF;
  SELECT id, total INTO c, tot FROM bilete_comenzi WHERE NOT in_pachet ORDER BY created_at LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'PROBA562_OK'; END IF;
  UPDATE bilete_comenzi SET telegram_id = 562562562, telegram_verificat_pentru = 562562562, status = 'platita', departure_at = now() + interval '2 hours' WHERE id = c;

  -- 1. fără garanție (cheie goală): 2 h înainte → respinsă, ca în 503
  DELETE FROM app_config WHERE key = 'bilete_garantie_100_pana';
  INSERT INTO app_config (key, value) VALUES ('bilete_garantie_100_pana', '');
  BEGIN
    o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
    RAISE EXCEPTION 'P562: fără garanție, oferta sub 4 h a trecut';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OFERTA_EXPIRARE_GRESITA' THEN RAISE; END IF; END;

  -- 2. garanția expirată ieri → tot respinsă
  UPDATE app_config SET value = to_char((now() AT TIME ZONE 'Europe/Chisinau')::date - 1, 'YYYY-MM-DD') WHERE key = 'bilete_garantie_100_pana';
  BEGIN
    o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
    RAISE EXCEPTION 'P562: garanția de ieri a acceptat oferta';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OFERTA_EXPIRARE_GRESITA' THEN RAISE; END IF; END;

  -- 3. garanția până AZI (inclusiv) → acceptată cu 2 h înainte
  UPDATE app_config SET value = to_char((now() AT TIME ZONE 'Europe/Chisinau')::date, 'YYYY-MM-DD') WHERE key = 'bilete_garantie_100_pana';
  o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
  IF o.id IS NULL OR o.suma <> tot THEN RAISE EXCEPTION 'P562: oferta din garanție (2 h înainte) n-a fost creată'; END IF;

  -- 4. garanția, 10 h DUPĂ plecare → acceptată; 23 h 55 min după plecare cu expirarea peste 15 min → respinsă (> plecare + 24 h)
  UPDATE bilete_comenzi SET departure_at = now() - interval '10 hours' WHERE id = c;
  o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
  IF o.id IS NULL THEN RAISE EXCEPTION 'P562: oferta din garanție după plecare n-a fost creată'; END IF;
  UPDATE bilete_comenzi SET departure_at = now() - interval '23 hours 55 minutes' WHERE id = c;
  BEGIN
    o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
    RAISE EXCEPTION 'P562: expirarea după plecare + 24 h a trecut';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OFERTA_EXPIRARE_GRESITA' THEN RAISE; END IF; END;

  -- 5. valoare stricată în config → fără garanție, fără eroare de conversie
  UPDATE app_config SET value = '2026-13-45x' WHERE key = 'bilete_garantie_100_pana';
  UPDATE bilete_comenzi SET departure_at = now() + interval '2 hours' WHERE id = c;
  BEGIN
    o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
    RAISE EXCEPTION 'P562: valoarea stricată a pornit garanția';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'OFERTA_EXPIRARE_GRESITA' THEN RAISE; END IF; END;

  -- 6. regula fără garanție neschimbată: 30 h înainte → acceptată
  UPDATE app_config SET value = '' WHERE key = 'bilete_garantie_100_pana';
  UPDATE bilete_comenzi SET departure_at = now() + interval '30 hours' WHERE id = c;
  o := bilete_retur_oferta_noua(c, 562562562, 9, tot, tot, now() + interval '15 minutes');
  IF o.id IS NULL THEN RAISE EXCEPTION 'P562: oferta obișnuită (30 h) n-a fost creată'; END IF;

  RAISE EXCEPTION 'PROBA562_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA562_OK' THEN RAISE; END IF;
END $$;
