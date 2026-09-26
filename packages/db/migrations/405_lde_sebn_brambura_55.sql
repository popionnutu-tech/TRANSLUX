-- 405 — SEBN Orhei + Strășeni: §5.5 «brambura = mediana + 15» (18.09) rămăsese în textul viu lângă §11.3 (25.09), care a
-- înlocuit-o (migr. 400, sebn-liber.mjs:3-5). Ion, 26.09: «fa». Rândul devine o trimitere la 11.3; numerotarea 5.6/5.7 rămâne.
-- Înlocuire gardată (Ion editează textul pe /lde/livrare-reguli fără istoric): pică zgomotos dacă nu schimbă exact 2 rânduri.
-- Fără funcții, fără GRANT.
BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE lde_uzine
  SET reguli_livrare = replace(reguli_livrare,
        $v$5.5 BRAMBURA = doar excesul peste ziua obișnuită a mașinii (mediana zilelor ei + 15 km), «ceva ieșit din comun»; se listează pe zile, cu locul și ora, nu ca medie. Pe listă: zilele peste 20 km.$v$,
        $n$5.5 BRAMBURA: vezi 11.3 — km pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii, ≥ 5 km pe cursă (regula din 25.09; «mediana zilelor + 15 km» din 18.09 nu se mai folosește).$n$),
      reguli_livrare_la = now()
  WHERE id IN ('SEBN_ORHEI', 'SEBN_STRASENI')
    AND position('5.5 BRAMBURA = doar excesul peste ziua obișnuită a mașinii (mediana zilelor ei + 15 km)' IN reguli_livrare) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION '405: trebuiau 2 texte SEBN cu §5.5 vechi, s-au schimbat %', n; END IF;
END
$$;

COMMIT;
