-- 554: cele 4 cifre ale telefonului la returnarea din bot nu mai blochează pentru totdeauna (Ion, 10.10.2026: «fac test,
-- permite să returnez; pe viitor nu este niciun dispecer, nu bloca utilizatorii»; «niciodată nu trebuie decide
-- dispecerul»). 5 greșeli → pauză de 15 minute, apoi contorul pornește de la zero. 10.000 de combinații × 5 încercări
-- pe 15 minute ≈ 500 de ore pentru a ghici — frâna rămâne, blocarea definitivă (și dispecerul) dispare.

ALTER TABLE bilete_comenzi ADD COLUMN IF NOT EXISTS retur_cifre_la timestamptz;
COMMENT ON COLUMN bilete_comenzi.retur_cifre_la IS 'Ultima greșeală a celor 4 cifre la returnarea din bot (554): după 5 greșeli, pauză de 15 minute de la ea.';

CREATE OR REPLACE FUNCTION public.bilete_retur_cifre(p_comanda uuid, p_telegram bigint, p_cifre text, p_max int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; tel text; cif text; n int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF c.telegram_id IS DISTINCT FROM p_telegram THEN RAISE EXCEPTION 'OFERTA_NELEGAT'; END IF;
  IF c.telegram_verificat_pentru IS NOT DISTINCT FROM p_telegram THEN RETURN jsonb_build_object('ok', true, 'ramase', p_max, 'blocat', false); END IF;
  IF c.retur_cifre_gresite >= p_max THEN
    IF c.retur_cifre_la IS NOT NULL AND c.retur_cifre_la > now() - interval '15 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'ramase', 0, 'blocat', true,
        'minute', greatest(1, ceil(extract(epoch FROM (c.retur_cifre_la + interval '15 minutes' - now())) / 60)::int));
    END IF;
    UPDATE bilete_comenzi SET retur_cifre_gresite = 0 WHERE id = p_comanda;
    c.retur_cifre_gresite := 0;
  END IF;
  tel := regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
  cif := regexp_replace(coalesce(p_cifre, ''), '\D', '', 'g');
  IF length(tel) >= 4 AND length(cif) = 4 AND right(tel, 4) = cif THEN
    UPDATE bilete_comenzi SET telegram_verificat_pentru = p_telegram, retur_cifre_gresite = 0, retur_cifre_la = NULL WHERE id = p_comanda;
    RETURN jsonb_build_object('ok', true, 'ramase', p_max, 'blocat', false);
  END IF;
  UPDATE bilete_comenzi SET retur_cifre_gresite = retur_cifre_gresite + 1, retur_cifre_la = now() WHERE id = p_comanda RETURNING retur_cifre_gresite INTO n;
  RETURN jsonb_build_object('ok', false, 'ramase', greatest(p_max - n, 0), 'blocat', n >= p_max, 'minute', CASE WHEN n >= p_max THEN 15 ELSE 0 END);
END $$;
REVOKE EXECUTE ON FUNCTION public.bilete_retur_cifre(uuid, bigint, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_retur_cifre(uuid, bigint, text, int) TO service_role;

-- Probă (anulată la sfârșit): 5 greșeli → pauză; după 15 minute (simulat) contorul pornește iar și cifrele bune trec.
DO $$
DECLARE c uuid; r jsonb; i int;
BEGIN
  SELECT id INTO c FROM bilete_comenzi WHERE phone ~ '\d{4}$' LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'PROBA554_OK'; END IF;
  UPDATE bilete_comenzi SET telegram_id = 554554554, telegram_verificat_pentru = NULL, retur_cifre_gresite = 0, retur_cifre_la = NULL WHERE id = c;
  FOR i IN 1..5 LOOP r := bilete_retur_cifre(c, 554554554, '0000'); END LOOP;
  IF NOT (r->>'blocat')::boolean THEN
    -- telefonul s-ar putea termina chiar în 0000: atunci proba nu spune nimic
    IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'PROBA554_OK'; END IF;
    RAISE EXCEPTION 'P554: a 5-a greșeală nu a pus pauza (%)', r;
  END IF;
  r := bilete_retur_cifre(c, 554554554, right(regexp_replace((SELECT phone FROM bilete_comenzi WHERE id = c), '\D', '', 'g'), 4));
  IF (r->>'ok')::boolean OR NOT (r->>'blocat')::boolean THEN RAISE EXCEPTION 'P554: în pauză cifrele bune au trecut (%)', r; END IF;
  UPDATE bilete_comenzi SET retur_cifre_la = now() - interval '16 minutes' WHERE id = c;
  r := bilete_retur_cifre(c, 554554554, right(regexp_replace((SELECT phone FROM bilete_comenzi WHERE id = c), '\D', '', 'g'), 4));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P554: după pauză cifrele bune n-au trecut (%)', r; END IF;
  RAISE EXCEPTION 'PROBA554_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA554_OK' THEN RAISE; END IF;
END $$;
