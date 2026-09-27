-- 412_lde_drax_capat_din_gps.sql — Drăxlmaier §4.1: excepția «capătul din GPS» când cursa reală pornește dintr-un sat al rutei
-- dincolo de «Starting point» (R37 → Năvîrneț, R28 → Balatina); §4.7 fără Balatina și Năvîrneț (au opriri cu oameni).
-- Ion, 27.09.2026: «fă schimbarea» (ION-110; dovezile: opriri §4.5 pe urmele săptămânilor 07.09 și 14.09 + toată fereastra scheletului).
-- Gard de intrare: textul de după 408 (24334 / 810297f3c831a2cf4b2dbaea0d6e2c22); ieșire verificată pe lungime + md5 din simulare.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = replace(replace(reguli_livrare, $v41$4.1 Linia = de la capăt până la poartă. Capătul = «Starting point»-ul liniei din act (startul e capătul), același sat la tur și la retur.$v41$, $n41$4.1 Linia = de la capăt până la poartă. Capătul = «Starting point»-ul liniei din act (startul e capătul), același sat la tur și la retur. Excepție (Ion, 27.09.2026, ION-110): când cursa reală pornește turul și termină returul, în mod regulat, într-un sat al RUTEI (din numele rutei din act) aflat dincolo de «Starting point», cu opriri reale (§4.5) în ambele sensuri și la mai multe mașini, capătul liniei = acel sat, din GPS; linia își păstrează numele din act. Azi: R37 Musteața → capăt Năvîrneț (925FTI și 351KAJ așteaptă acolo 4–9 minute înainte de tur și coboară oameni acolo după retur), R28 Cuhnești → capăt Balatina (760BXI, 351KAJ, 710CWN: ramura spre Balatina cu oprire și întoarcere). Nu fac capăt: drumul de acasă al șoferului care doar trece prin sat și orașele din §5.1.$n41$), $v47$4.7 Sate din act fără nicio oprire pe rută în GPS: Mîndîc (R1), Sofrîncani (R2), Recea (R7), Obreja Nouă (R26), Balatina (R28), Năvîrneț (R37). Rămân în act; nu schimbă capătul.$v47$, $n47$4.7 Sate din act fără nicio oprire pe rută în GPS: Mîndîc (R1), Sofrîncani (R2), Recea (R7), Obreja Nouă (R26). Rămân în act; nu schimbă capătul. Balatina (R28) și Năvîrneț (R37) au opriri cu oameni pe urma GPS și sunt capetele liniilor lor (4.1, ION-110, 27.09.2026).$n47$),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND length(reguli_livrare) = 24334
     AND md5(reguli_livrare) = '810297f3c831a2cf4b2dbaea0d6e2c22';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '412: textul din bază nu e cel de după 408 (24334 / md5), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 25072 OR md5(t) <> '62eace0d0dd8f37e678a27ef639f5c0e' OR position('Balatina (R28), Năvîrneț (R37). Rămân' in t) > 0
  THEN RAISE EXCEPTION '412: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
