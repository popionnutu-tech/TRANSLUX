-- 430: ION-128 — ziua ideală: ora punctelor de staționare în drumul direct (§8.8) + cifrele săptămânii 14.09.
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(replace(reguli_livrare, $v0$(km reali: mediana GPS a drumurilor directe observate pe aceeași pereche de locuri, cel puțin 3;$v0$, $n0$(km reali: mediana GPS a drumurilor directe observate pe aceeași pereche de locuri, cel puțin 3 — ora unui punct de staționare e începutul și sfârșitul staționării, iar drumul se măsoară doar înainte în timp (ION-128: fără asta, ordinea punctelor se amesteca și 446ASB avea drumul Scumpia ↔ uzină de 37–42 km în loc de 46–49);$n0$), $v1$Săptămâna 14–20.09: 5.424 km măsurat (6.447 extrapolat, după ION-124) — acasă între curse 3.842, noaptea (cu weekendul) 1.612, drum mai lung 223, mai scurt decât idealul −254;$v1$, $n1$Săptămâna 14–20.09: 5.314 km măsurat (6.316 extrapolat, după ION-124 și ION-128) — acasă între curse 3.751, noaptea (cu weekendul) 1.620, drum mai lung 198, mai scurt decât idealul −256;$n1$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 36642 AND md5(reguli_livrare) = 'e6bc675c26bf3ef117c47287e6c95bde';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '430: textul din bază nu e cel de după 429, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 36883 OR md5(t) <> 'e7bf2b69c8cf89b9b00056d0ceb642d0' THEN RAISE EXCEPTION '430: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
