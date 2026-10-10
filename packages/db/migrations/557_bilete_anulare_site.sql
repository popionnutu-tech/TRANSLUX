-- 557: anularea biletului și pe site (pagina biletului, deschisă din «Găsește biletul meu») și din asistentul online
-- (Ion, 10.10.2026: «anularea la bilet posibilă și pe site în găsește biletul, și din asistentul online, dacă se
-- identifică clientul»). Identificarea: linkul biletului (codul secret, 128 de biți) + ultimele 4 cifre ale telefonului
-- din comandă. Contorul greșelilor e același cu al botului (retur_cifre_gresite / retur_cifre_la, 554): 5 greșeli →
-- pauză de 15 minute, fără blocare definitivă și fără dispecer.

CREATE OR REPLACE FUNCTION public.bilete_anulare_cifre(p_comanda uuid, p_cifre text, p_max int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
DECLARE c bilete_comenzi; tel text; cif text; n int;
BEGIN
  SELECT * INTO c FROM bilete_comenzi WHERE id = p_comanda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFERTA_COMANDA_INEXISTENTA'; END IF;
  IF c.retur_cifre_gresite >= p_max THEN
    IF c.retur_cifre_la IS NOT NULL AND c.retur_cifre_la > now() - interval '15 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'ramase', 0, 'blocat', true,
        'minute', greatest(1, ceil(extract(epoch FROM (c.retur_cifre_la + interval '15 minutes' - now())) / 60)::int));
    END IF;
    UPDATE bilete_comenzi SET retur_cifre_gresite = 0 WHERE id = p_comanda;
  END IF;
  tel := regexp_replace(coalesce(c.phone, ''), '\D', '', 'g');
  cif := regexp_replace(coalesce(p_cifre, ''), '\D', '', 'g');
  IF length(tel) >= 4 AND length(cif) = 4 AND right(tel, 4) = cif THEN
    UPDATE bilete_comenzi SET retur_cifre_gresite = 0, retur_cifre_la = NULL WHERE id = p_comanda AND retur_cifre_gresite <> 0;
    RETURN jsonb_build_object('ok', true, 'ramase', p_max, 'blocat', false);
  END IF;
  UPDATE bilete_comenzi SET retur_cifre_gresite = retur_cifre_gresite + 1, retur_cifre_la = now() WHERE id = p_comanda RETURNING retur_cifre_gresite INTO n;
  RETURN jsonb_build_object('ok', false, 'ramase', greatest(p_max - n, 0), 'blocat', n >= p_max, 'minute', CASE WHEN n >= p_max THEN 15 ELSE 0 END);
END $$;
REVOKE EXECUTE ON FUNCTION public.bilete_anulare_cifre(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_anulare_cifre(uuid, text, int) TO service_role;

DO $$
DECLARE c uuid; r jsonb; i int; tel text;
BEGIN
  SELECT id, right(regexp_replace(phone, '\D', '', 'g'), 4) INTO c, tel FROM bilete_comenzi WHERE phone ~ '\d{4}$' AND right(phone, 4) <> '0000' LIMIT 1;
  IF c IS NULL THEN RAISE EXCEPTION 'PROBA557_OK'; END IF;
  UPDATE bilete_comenzi SET retur_cifre_gresite = 0, retur_cifre_la = NULL WHERE id = c;
  r := bilete_anulare_cifre(c, tel);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P557: cifrele bune refuzate (%)', r; END IF;
  FOR i IN 1..5 LOOP r := bilete_anulare_cifre(c, '0000'); END LOOP;
  IF NOT (r->>'blocat')::boolean THEN RAISE EXCEPTION 'P557: a 5-a greșeală fără pauză (%)', r; END IF;
  r := bilete_anulare_cifre(c, tel);
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'P557: în pauză cifrele bune au trecut'; END IF;
  UPDATE bilete_comenzi SET retur_cifre_la = now() - interval '16 minutes' WHERE id = c;
  r := bilete_anulare_cifre(c, tel);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'P557: după pauză cifrele bune refuzate (%)', r; END IF;
  RAISE EXCEPTION 'PROBA557_OK';
EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'PROBA557_OK' THEN RAISE; END IF;
END $$;
