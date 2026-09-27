-- 414_lde_drax_r13_tranzit_opriri.sql — Drăxlmaier: scheletul ideal-v4.2 (ION-111, dezbaterea Claude + Codex, 2 runde, Codex 8,0 pass):
-- §1.4 R13 Hăsnășenii Noi are etalon (49 din 51 de linii), §4.2 cursa din afara graficului cu opriri în satele rutei nu e «tranzit»,
-- §6.5 turele pe zi și km/zi după v4.2. Ion, 27.09.2026: «dacă au opriri și rutele sunt în schelet — de ce mai întrebi?»
-- Gard de intrare: textul de după 413 (26373 / 56dfde040fe3c376618fb75d4507501d); ieșire verificată pe lungime + md5 din simulare.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = replace(replace(replace(reguli_livrare, $va14$: 48 din 51 de linii. Liniile Hasnasenii Noi (R13), Putinești (R18) și Iabloana (R27) n-au nicio cursă care să pornească din startul lor în GPS; satele rămân în act (4.4), liniile rămân fără etalon până apar curse.$va14$, $na14$: 49 din 51 de linii (ideal-v4.2, activ din 27.09.2026, ION-111). R13 Hăsnășenii Noi are etalon din 27.09 (744ARF, 9,5 km): cursele ei erau aruncate ca «tranzit» (4.2). Liniile Putinești (R18) și Iabloana (R27) n-au nicio pereche tur–retur pe același schimb în GPS — Putinești e oprire pe drumul R22 Țiplești, Iabloana pe drumul R27 Danu; satele rămân în act (4.4), liniile rămân fără etalon până apar curse.$na14$), $va42$Pe o rută cu mai multe linii, capătul cursei = cel mai depărtat start al rutei atins.$va42$, $na42$Pe o rută cu mai multe linii, capătul cursei = cel mai depărtat start al rutei atins. Drumul de acasă care doar trece prin sat nu face capătul (4.1). Cursa unei mașini din afara graficului liniei, cu drumul gol mai lung decât cel cu oameni, e a liniei (nu «tranzit») când are opriri (sub 8 km/h, cel puțin 20 s) în satele rutei: cel puțin două în afara capetelor cursei (casa, parcarea) sau una la capătul liniei (Ion, 27.09.2026: «dacă au opriri și rutele sunt în schelet»; ION-109, ION-111).$na42$), $va65$Rezultat: 29 de linii × 1, 16 × 2, 3 × 3 (Dominteni, Prajila, Sturzovca). Km pe zi ai liniei = 2 × km × ture pe zi; pe toată uzina 5.843 km/zi cu oameni.$va65$, $na65$Rezultat (ideal-v4.2, 27.09.2026): 29 de linii × 1, 18 × 2, 2 × 3 (Prajila, Sturzovca); Dominteni are 1 tură (serviciul lui 710CWN prin Lazo e al liniei R13 Lazo), Țiplești 2 ture (returul de noapte al lui 804MUM). Km pe zi ai liniei = 2 × km × ture pe zi; pe toată uzina 5.789 km/zi cu oameni.$na65$),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND length(reguli_livrare) = 26373
     AND md5(reguli_livrare) = '56dfde040fe3c376618fb75d4507501d';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '414: textul din bază nu e cel de după 413 (26373 / md5), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 27116 OR md5(t) <> '24cf0ab58e3894f68e0b8e918e8e67af' OR position('5.843 km/zi' in t) > 0
  THEN RAISE EXCEPTION '414: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
