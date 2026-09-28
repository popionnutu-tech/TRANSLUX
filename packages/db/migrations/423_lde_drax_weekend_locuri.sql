-- 423_lde_drax_weekend_locuri.sql — Drăxlmaier §8.8 noaptea de weekend în total (Ion, 28.09.2026: «count in total») + §8.7 locurile pe tip (migr. 422). ION-123.
-- Gard de intrare: textul de după 421 (34757 / 73b71dcfa9601552141352584e9cf73d).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(replace(replace(reguli_livrare, $v0$weekendul (noaptea care atinge sâmbăta sau duminica), nopțile în Bălți (7.4) și mașinile cu posibilă cursă nedetectată (386PKP, 293QVT) sunt SEPARAT, în afara totalului.$v0$, $n0$noaptea de weekend (vineri seara → luni dimineața) intră în total ca orice noapte (Ion, 28.09.2026: «count in total»); nopțile în Bălți (7.4) și mașinile cu posibilă cursă nedetectată (386PKP, 293QVT) sunt SEPARAT, în afara totalului.$n0$), $v1$Săptămâna 14–20.09: 5.059 km măsurat (6.013 extrapolat) — acasă între curse 3.882, noaptea 1.163, drum mai lung 249, mai scurt decât idealul −235; separat weekend 450, Bălți 652; 22 de mașini peste 100 km pe săptămână (710CWN 546, 518MHD 544, 925FTI 450).$v1$, $n1$Săptămâna 14–20.09: 5.489 km măsurat (6.525 extrapolat) — acasă între curse 3.882, noaptea (cu weekendul) 1.612, drum mai lung 249, mai scurt decât idealul −254; separat Bălți 652; 23 de mașini peste 100 km pe săptămână (710CWN 583, 518MHD 572, 925FTI 455).$n1$), $v2$locurile pe tip de mașină lipsesc din bază, deci schimbul rămâne condiționat până la confirmarea lor.$v2$, $n2$locurile (Ion, 28.09.2026: «daf big bus, rest is 20-30 seats, mercedes 518 is 30 seats», migr. 422): DAF 50, Sprinter 518 30; mașina ia o linie dacă locurile ei ≥ clasa liniei sau dacă duce deja o linie de acea clasă (microbuzele de 20–30 locuri rămân pe clasa dusă deja).$n2$)
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 34757 AND md5(reguli_livrare) = '73b71dcfa9601552141352584e9cf73d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '423: textul din bază nu e cel de după 421, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 34995 OR md5(t) <> '89c354ee3d647e004b722c544bbef459' THEN RAISE EXCEPTION '423: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
