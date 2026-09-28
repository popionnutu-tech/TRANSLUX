-- 425_lde_drax_locuri_pe_masina.sql — Drăxlmaier §8.7: locurile pe mașină (Ion, 28.09.2026: «27 locuri 043/041/917/302/457/912, restul 20 locuri, daf-urile 50»; migr. 424). ION-123.
-- Gard de intrare: textul de după 423 (34995 / 89c354ee3d647e004b722c544bbef459).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(reguli_livrare, $v0$locurile (Ion, 28.09.2026: «daf big bus, rest is 20-30 seats, mercedes 518 is 30 seats», migr. 422): DAF 50, Sprinter 518 30; mașina ia o linie dacă locurile ei ≥ clasa liniei sau dacă duce deja o linie de acea clasă (microbuzele de 20–30 locuri rămân pe clasa dusă deja).$v0$, $n0$locurile pe mașină (Ion, 28.09.2026: «27 locuri 043/041/917/302/457/912, restul 20 locuri, daf-urile 50», migr. 424, vehicles.passenger_seats): DAF-urile 50; 043BRAU, 041BRAU, 917FTI, 302YEK, 457BRAX, 912RNK 27; restul 20; mașina ia o linie dacă locurile ei ≥ clasa liniei sau dacă duce deja o linie de acea clasă.$n0$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 34995 AND md5(reguli_livrare) = '89c354ee3d647e004b722c544bbef459';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '425: textul din bază nu e cel de după 423, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 35037 OR md5(t) <> '84362bd7a2c6ac7416d92c1d3b06d4dc' THEN RAISE EXCEPTION '425: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
