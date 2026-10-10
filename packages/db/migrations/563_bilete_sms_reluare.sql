-- 563: N5 (dezbaterea Claude–Codex despre bronare și plată, 10.10.2026) — SMS-ul de confirmare se reia după un eșec, fără
-- să plece de două ori. Până acum (552) rândul «confirmare» se insera înainte de trimitere și orice rând, în orice stare,
-- scotea comanda din plasa împăcării: un refuz sau o funcție oprită după INSERT = niciun SMS, niciodată. Latent: SMS-ul nu
-- e configurat în producție (0 rânduri «confirmare» la 10.10).
--
-- Protocolul (lib/bilete/sms.ts):
--   1. bilete_sms_confirmare_revendica — revendicare cu TERMEN (revendicat_la + jeton nou, incercari + 1), sub lacătul rândului;
--      prima dată prin INSERT … ON CONFLICT pe indexul unic, apoi doar: refuzat + sub plafonul încercărilor + după pauză +
--      în fereastra de 2 h de la plată; sau in_lucru cu termenul expirat ÎNAINTE de începerea trimiterii.
--   2. bilete_sms_confirmare_incepe — marchează trimitere_la chiar înainte de cererea la furnizor, doar cu jetonul curent.
--   3. bilete_sms_confirmare_rezultat — trimis / refuzat / necunoscut, doar cu jetonul curent.
-- Termen expirat DUPĂ începerea trimiterii (procesul a murit în timpul cererii) = rezultat necunoscut: furnizorul poate să fi
-- primit SMS-ul fără ca noi să-l fi scris → stare «necunoscut», FĂRĂ retrimitere (nu știm să întrebăm furnizorul încă).
-- Rândurile vechi «confirmare» în in_lucru/eroare (adaptorul vechi punea și timeout-ul la «eroare») devin «necunoscut».

ALTER TABLE bilete_sms
  ADD COLUMN IF NOT EXISTS revendicat_la timestamptz,
  ADD COLUMN IF NOT EXISTS incercari int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revendicare uuid,
  ADD COLUMN IF NOT EXISTS trimitere_la timestamptz;
COMMENT ON COLUMN bilete_sms.revendicat_la IS '563: momentul ultimei revendicări (termenul curge de aici)';
COMMENT ON COLUMN bilete_sms.incercari IS '563: câte revendicări de trimitere a avut confirmarea (plafon în cod: 3)';
COMMENT ON COLUMN bilete_sms.revendicare IS '563: jetonul revendicării curente; doar el poate marca începerea și rezultatul';
COMMENT ON COLUMN bilete_sms.trimitere_la IS '563: cererea la furnizor a pornit (după acest moment rezultatul poate fi necunoscut)';

ALTER TABLE bilete_sms DROP CONSTRAINT IF EXISTS bilete_sms_stare_check;
ALTER TABLE bilete_sms ADD CONSTRAINT bilete_sms_stare_check
  CHECK (stare IN ('in_lucru', 'trimis', 'eroare', 'fara_bilete', 'plafon', 'refuzat', 'necunoscut'));

UPDATE bilete_sms SET stare = 'necunoscut', eroare = left(coalesce(eroare, '') || ' [563: rezultat vechi, nereluat]', 300)
 WHERE tip = 'confirmare' AND stare IN ('in_lucru', 'eroare');

CREATE OR REPLACE FUNCTION public.bilete_sms_confirmare_revendica(
  p_comanda uuid, p_telefon text, p_termen_sec int DEFAULT 120, p_max int DEFAULT 3, p_pauza_sec int DEFAULT 120
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE r bilete_sms; v_tok uuid := gen_random_uuid(); v_paid timestamptz;
BEGIN
  INSERT INTO bilete_sms (comanda_id, tip, telefon, stare, revendicare, revendicat_la, incercari)
  VALUES (p_comanda, 'confirmare', p_telefon, 'in_lucru', v_tok, now(), 1)
  ON CONFLICT (comanda_id) WHERE tip = 'confirmare' DO NOTHING
  RETURNING * INTO r;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'id', r.id, 'token', v_tok, 'incercare', 1); END IF;

  SELECT * INTO r FROM bilete_sms WHERE comanda_id = p_comanda AND tip = 'confirmare' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motiv', 'concurenta'); END IF;

  IF r.stare = 'in_lucru' THEN
    IF coalesce(r.revendicat_la, r.created_at) > now() - make_interval(secs => p_termen_sec) THEN
      RETURN jsonb_build_object('ok', false, 'motiv', 'in_lucru');
    END IF;
    IF r.trimitere_la IS NOT NULL THEN
      -- procesul a murit DUPĂ ce a pornit cererea: poate a plecat, poate nu → nu se retrimite orbește
      UPDATE bilete_sms SET stare = 'necunoscut', eroare = 'termenul revendicării a expirat după începerea trimiterii' WHERE id = r.id;
      RETURN jsonb_build_object('ok', false, 'motiv', 'necunoscut');
    END IF;
    -- a murit înainte de cerere: nimic n-a plecat, se poate relua (intră mai jos, ca o încercare nouă)
  ELSIF r.stare = 'refuzat' THEN
    IF r.incercari >= p_max THEN RETURN jsonb_build_object('ok', false, 'motiv', 'epuizat'); END IF;
    IF coalesce(r.revendicat_la, r.created_at) > now() - make_interval(secs => p_pauza_sec) THEN
      RETURN jsonb_build_object('ok', false, 'motiv', 'pauza');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'motiv', r.stare); -- trimis / necunoscut / altceva: gata
  END IF;

  IF r.incercari >= p_max THEN
    UPDATE bilete_sms SET stare = 'refuzat', eroare = left(coalesce(eroare, '') || ' [încercările epuizate]', 300) WHERE id = r.id;
    RETURN jsonb_build_object('ok', false, 'motiv', 'epuizat');
  END IF;
  SELECT paid_at INTO v_paid FROM bilete_comenzi WHERE id = p_comanda;
  IF v_paid IS NULL OR v_paid < now() - interval '2 hours' THEN RETURN jsonb_build_object('ok', false, 'motiv', 'fereastra'); END IF;

  UPDATE bilete_sms SET stare = 'in_lucru', revendicare = v_tok, revendicat_la = now(), incercari = r.incercari + 1,
         trimitere_la = NULL, telefon = p_telefon
   WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'id', r.id, 'token', v_tok, 'incercare', r.incercari + 1);
END $$;

CREATE OR REPLACE FUNCTION public.bilete_sms_confirmare_incepe(p_id uuid, p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
BEGIN
  UPDATE bilete_sms SET trimitere_la = now()
   WHERE id = p_id AND tip = 'confirmare' AND revendicare = p_token AND stare = 'in_lucru' AND trimitere_la IS NULL;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.bilete_sms_confirmare_rezultat(p_id uuid, p_token uuid, p_stare text, p_furnizor text, p_eroare text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
BEGIN
  IF p_stare NOT IN ('trimis', 'refuzat', 'necunoscut') THEN RAISE EXCEPTION 'SMS_STARE_GRESITA'; END IF;
  -- «necunoscut» pus între timp de o revendicare care a găsit termenul expirat se poate îndrepta cu rezultatul real.
  UPDATE bilete_sms SET stare = p_stare,
         trimis_la = CASE WHEN p_stare = 'trimis' THEN now() ELSE trimis_la END,
         furnizor_id = CASE WHEN p_stare = 'trimis' THEN p_furnizor ELSE furnizor_id END,
         eroare = CASE WHEN p_stare = 'trimis' THEN NULL ELSE left(p_eroare, 300) END
   WHERE id = p_id AND tip = 'confirmare' AND revendicare = p_token AND stare IN ('in_lucru', 'necunoscut') AND trimitere_la IS NOT NULL;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_sms_confirmare_revendica(uuid, text, int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bilete_sms_confirmare_incepe(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bilete_sms_confirmare_rezultat(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_sms_confirmare_revendica(uuid, text, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.bilete_sms_confirmare_incepe(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bilete_sms_confirmare_rezultat(uuid, uuid, text, text, text) TO service_role;

-- Probe (anulate la sfârșit): doi lucrători A și B pe aceeași comandă; timpul se mută dând înapoi revendicat_la.
DO $$
DECLARE c uuid; a jsonb; b jsonb; x jsonb; s bilete_sms; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['bilete_sms_confirmare_revendica(uuid, text, int, int, int)', 'bilete_sms_confirmare_incepe(uuid, uuid)', 'bilete_sms_confirmare_rezultat(uuid, uuid, text, text, text)'] LOOP
    IF has_function_privilege('anon', 'public.' || f, 'EXECUTE') OR has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') THEN
      RAISE EXCEPTION 'P563: % executabilă de anon/authenticated', f;
    END IF;
  END LOOP;
  SELECT id INTO c FROM bilete_comenzi ORDER BY created_at LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'PROBA563_OK'; END IF;
  DELETE FROM bilete_sms WHERE comanda_id = c AND tip = 'confirmare';
  UPDATE bilete_comenzi SET paid_at = now() - interval '5 minutes' WHERE id = c;

  -- 1. A revendică; B, în același timp, nu poate
  a := bilete_sms_confirmare_revendica(c, '37360563563');
  b := bilete_sms_confirmare_revendica(c, '37360563563');
  IF NOT (a->>'ok')::boolean OR (b->>'ok')::boolean OR b->>'motiv' <> 'in_lucru' THEN RAISE EXCEPTION 'P563.1: % / %', a, b; END IF;

  -- 2. A moare ÎNAINTE de cerere; după termen B reia (încercarea 2), iar jetonul lui A nu mai poate porni trimiterea
  UPDATE bilete_sms SET revendicat_la = now() - interval '3 minutes' WHERE comanda_id = c AND tip = 'confirmare';
  b := bilete_sms_confirmare_revendica(c, '37360563563');
  IF NOT (b->>'ok')::boolean OR (b->>'incercare')::int <> 2 THEN RAISE EXCEPTION 'P563.2: B n-a reluat (%)', b; END IF;
  IF bilete_sms_confirmare_incepe((a->>'id')::uuid, (a->>'token')::uuid) THEN RAISE EXCEPTION 'P563.2: jetonul vechi a pornit trimiterea'; END IF;
  IF NOT bilete_sms_confirmare_incepe((b->>'id')::uuid, (b->>'token')::uuid) THEN RAISE EXCEPTION 'P563.2: B nu poate porni'; END IF;

  -- 3. B moare DUPĂ ce a pornit cererea; după termen: necunoscut, fără reluare (nici mai târziu)
  UPDATE bilete_sms SET revendicat_la = now() - interval '3 minutes' WHERE comanda_id = c AND tip = 'confirmare';
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean OR x->>'motiv' <> 'necunoscut' THEN RAISE EXCEPTION 'P563.3: %', x; END IF;
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean OR x->>'motiv' <> 'necunoscut' THEN RAISE EXCEPTION 'P563.3b: necunoscut s-a reluat (%)', x; END IF;
  -- B revine totuși cu răspunsul furnizorului «trimis» → îndreptat
  IF NOT bilete_sms_confirmare_rezultat((b->>'id')::uuid, (b->>'token')::uuid, 'trimis', 'f-1', NULL) THEN RAISE EXCEPTION 'P563.3c: rezultatul lui B respins'; END IF;
  SELECT * INTO s FROM bilete_sms WHERE comanda_id = c AND tip = 'confirmare';
  IF s.stare <> 'trimis' OR s.furnizor_id <> 'f-1' THEN RAISE EXCEPTION 'P563.3c: %', s.stare; END IF;
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean THEN RAISE EXCEPTION 'P563.3d: trimisul s-a revendicat din nou'; END IF;

  -- 4. refuz confirmat: pauză, apoi reluare, până la 3 încercări; apoi gata
  DELETE FROM bilete_sms WHERE comanda_id = c AND tip = 'confirmare';
  a := bilete_sms_confirmare_revendica(c, '37360563563');
  PERFORM bilete_sms_confirmare_incepe((a->>'id')::uuid, (a->>'token')::uuid);
  PERFORM bilete_sms_confirmare_rezultat((a->>'id')::uuid, (a->>'token')::uuid, 'refuzat', NULL, 'HTTP 400');
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean OR x->>'motiv' <> 'pauza' THEN RAISE EXCEPTION 'P563.4 pauza: %', x; END IF;
  FOR i IN 2..3 LOOP
    UPDATE bilete_sms SET revendicat_la = now() - interval '3 minutes' WHERE comanda_id = c AND tip = 'confirmare';
    a := bilete_sms_confirmare_revendica(c, '37360563563');
    IF NOT (a->>'ok')::boolean OR (a->>'incercare')::int <> i THEN RAISE EXCEPTION 'P563.4 încercarea %: %', i, a; END IF;
    PERFORM bilete_sms_confirmare_incepe((a->>'id')::uuid, (a->>'token')::uuid);
    PERFORM bilete_sms_confirmare_rezultat((a->>'id')::uuid, (a->>'token')::uuid, 'refuzat', NULL, 'HTTP 400');
  END LOOP;
  UPDATE bilete_sms SET revendicat_la = now() - interval '3 minutes' WHERE comanda_id = c AND tip = 'confirmare';
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean OR x->>'motiv' <> 'epuizat' THEN RAISE EXCEPTION 'P563.4 epuizat: %', x; END IF;

  -- 5. în afara ferestrei de 2 h: refuzul nu se mai reia
  DELETE FROM bilete_sms WHERE comanda_id = c AND tip = 'confirmare';
  a := bilete_sms_confirmare_revendica(c, '37360563563');
  PERFORM bilete_sms_confirmare_incepe((a->>'id')::uuid, (a->>'token')::uuid);
  PERFORM bilete_sms_confirmare_rezultat((a->>'id')::uuid, (a->>'token')::uuid, 'refuzat', NULL, 'HTTP 400');
  UPDATE bilete_sms SET revendicat_la = now() - interval '3 minutes' WHERE comanda_id = c AND tip = 'confirmare';
  UPDATE bilete_comenzi SET paid_at = now() - interval '3 hours' WHERE id = c;
  x := bilete_sms_confirmare_revendica(c, '37360563563');
  IF (x->>'ok')::boolean OR x->>'motiv' <> 'fereastra' THEN RAISE EXCEPTION 'P563.5: %', x; END IF;

  -- 6. rezultatul fără începerea trimiterii nu se scrie (nimic n-a plecat)
  DELETE FROM bilete_sms WHERE comanda_id = c AND tip = 'confirmare';
  a := bilete_sms_confirmare_revendica(c, '37360563563');
  IF bilete_sms_confirmare_rezultat((a->>'id')::uuid, (a->>'token')::uuid, 'trimis', 'f', NULL) THEN RAISE EXCEPTION 'P563.6'; END IF;

  RAISE EXCEPTION 'PROBA563_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA563_OK' THEN RAISE; END IF;
END $$;
