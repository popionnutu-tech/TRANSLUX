-- 415_lde_drax_linii_comasate.sql — Drăxlmaier §1.4: Putinești (R18) și Iabloana (R27) sunt sate deservite în cursele altor linii
-- (Ion, 27.09.2026: «sunt sate parte din itinerare mai lungi … ruta lungă e divizată în câteva mașini»; GPS: Iabloana — R27 Danu, Putinești — R32 Trifănești / R17 Prajila).
-- Gard de intrare: textul de după 414 (27116 / 24cf0ab58e3894f68e0b8e918e8e67af).
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine SET reguli_livrare = replace(reguli_livrare, $v14$Liniile Putinești (R18) și Iabloana (R27) n-au nicio pereche tur–retur pe același schimb în GPS — Putinești e oprire pe drumul R22 Țiplești, Iabloana pe drumul R27 Danu; satele rămân în act (4.4), liniile rămân fără etalon până apar curse.$v14$, $n14$Liniile Putinești (R18) și Iabloana (R27) n-au autobuz propriu: ruta lungă e împărțită între mai multe mașini (Ion, 27.09.2026), iar satele sunt deservite în cursele altor linii — Iabloana de linia Danu a aceleiași rute R27 (441ASB, 447ASB: 23 de curse cu oprire în septembrie), Putinești de R32 Trifănești (146BRAZ: 32 de curse cu oprire în septembrie, tur și retur) și, în mai–iulie, de R17 Prajila (763LYY). Satele rămân în act (4.4); liniile n-au km proprii (km-ii sunt în liniile care le deservesc), până apar curse proprii.$n14$), reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI' AND length(reguli_livrare) = 27116 AND md5(reguli_livrare) = '24cf0ab58e3894f68e0b8e918e8e67af';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '415: textul din bază nu e cel de după 414, rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 27406 OR md5(t) <> '1cfc6c53c3e0c23a3269c7bd834bdeef' THEN RAISE EXCEPTION '415: text neașteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
