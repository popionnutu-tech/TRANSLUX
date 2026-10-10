-- 552: jurnalul SMS-urilor biletelor (Ion, 10.10.2026: «să vină mesaj la client cu bronarea și cum poate el pe site să-și
-- găsească biletul; să facem un buton «Găsește biletul meu»; mesajele putem trimite prin PBX Moldcell»). PBX-ul Moldcell a
-- răspuns «501 Method Not Implemented» la SIP MESSAGE (10.10, test din Asterisk) → SMS printr-un API SMS de la Moldcell,
-- date cerute de Ion. Până atunci codul nu trimite nimic (neconfigurat). Tabelul: revendicarea confirmării (o dată pe
-- comandă), plafoanele «Găsește biletul» (pe telefon, IP și global) și urma trimiterilor; se golește la 90 de zile.

CREATE TABLE IF NOT EXISTS bilete_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id uuid REFERENCES bilete_comenzi(id) ON DELETE SET NULL,
  tip text NOT NULL CHECK (tip IN ('confirmare', 'gaseste')),
  telefon text NOT NULL,
  ip_hash text,
  text text,
  stare text NOT NULL DEFAULT 'in_lucru' CHECK (stare IN ('in_lucru', 'trimis', 'eroare', 'fara_bilete', 'plafon')),
  eroare text,
  furnizor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  trimis_la timestamptz
);
COMMENT ON TABLE bilete_sms IS 'SMS-urile biletelor (552): confirmarea după plată (una pe comandă) și «Găsește biletul meu» (linkurile pe telefonul cumpărătorului); golit la 90 de zile.';
CREATE UNIQUE INDEX IF NOT EXISTS bilete_sms_confirmare_uq ON bilete_sms (comanda_id) WHERE tip = 'confirmare';
CREATE INDEX IF NOT EXISTS bilete_sms_tel_idx ON bilete_sms (telefon, created_at);
CREATE INDEX IF NOT EXISTS bilete_sms_ip_idx ON bilete_sms (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS bilete_sms_creat_idx ON bilete_sms (created_at);
ALTER TABLE bilete_sms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bilete_sms FROM PUBLIC, anon, authenticated;
GRANT ALL ON bilete_sms TO service_role;

-- Cererea «Găsește biletul meu», sub lacăt: plafoanele (3 pe telefon / oră, 10 pe IP / oră, 300 pe zi) și rândul jurnalului.
CREATE OR REPLACE FUNCTION public.bilete_sms_gaseste_incepe(p_telefon text, p_ip text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE n_tel int; n_ip int; n_tot int; v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bilete_sms_gaseste'));
  SELECT count(*) FILTER (WHERE telefon = p_telefon AND created_at > now() - interval '1 hour'),
         count(*) FILTER (WHERE ip_hash = coalesce(p_ip, '') AND created_at > now() - interval '1 hour'),
         count(*)
    INTO n_tel, n_ip, n_tot FROM bilete_sms WHERE tip = 'gaseste' AND stare <> 'plafon' AND created_at > now() - interval '1 day';
  IF n_tel >= 3 OR n_ip >= 10 OR n_tot >= 300 THEN
    INSERT INTO bilete_sms (tip, telefon, ip_hash, stare) VALUES ('gaseste', p_telefon, coalesce(p_ip, ''), 'plafon');
    RETURN jsonb_build_object('ok', false, 'motiv', CASE WHEN n_tot >= 300 THEN 'plafon_global' WHEN n_tel >= 3 THEN 'plafon_telefon' ELSE 'plafon_ip' END);
  END IF;
  INSERT INTO bilete_sms (tip, telefon, ip_hash) VALUES ('gaseste', p_telefon, coalesce(p_ip, '')) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.bilete_sms_gaseste_incepe(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_sms_gaseste_incepe(text, text) TO service_role;

-- Probă (anulată la sfârșit): 3 cereri pe telefon trec, a 4-a cade pe plafon; confirmarea e unică pe comandă.
DO $$
DECLARE r jsonb; i int; c uuid;
BEGIN
  FOR i IN 1..3 LOOP
    r := bilete_sms_gaseste_incepe('37360552552', 'p552-' || i);
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P552: cererea % refuzată (%)', i, r; END IF;
  END LOOP;
  r := bilete_sms_gaseste_incepe('37360552552', 'p552-4');
  IF (r->>'ok')::boolean OR r->>'motiv' <> 'plafon_telefon' THEN RAISE EXCEPTION 'P552: a 4-a cerere (%)', r; END IF;
  SELECT id INTO c FROM bilete_comenzi LIMIT 1;
  IF c IS NOT NULL THEN
    INSERT INTO bilete_sms (comanda_id, tip, telefon) VALUES (c, 'confirmare', '37360552552');
    BEGIN
      INSERT INTO bilete_sms (comanda_id, tip, telefon) VALUES (c, 'confirmare', '37360552552');
      RAISE EXCEPTION 'P552: a doua confirmare pe aceeași comandă a trecut';
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END IF;
  RAISE EXCEPTION 'PROBA552_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA552_OK' THEN RAISE; END IF;
END $$;
