-- 376: prin câte sate ALE RUTEI a trecut drumul socotit „gol"
--
-- Operaționalul a adnotat de mână, pe 18.09, cele patru cazuri raportate greșit de mine ca
-- neglijență. Pe fiecare segment „gol" au scris ce a servit de fapt: «Hiliuți - Pîrlița,
-- sate 2», «Dumbrăvița - Cucioaia, sate 5», «Costești - Petrușeni, sate 4», «Alexeevca -
-- Năvîrneț, sate 4». Adică drumurile acelea erau curse, nu plimbări.
--
-- Migrația 375 a adăugat numărul de OPRIRI de pe segmentul gol, care a prins toate patru
-- cazurile. Dar el numără prea puțin: punctele GPS vin la ~30 de secunde, iar o urcare de
-- 30-40 de secunde cade între două puncte. Se vede pe drumul PLIN al lui 912RNK — 13 sate
-- în etalon, o singură oprire detectată.
--
-- Al doilea semnal e chiar ce au scris ei pe hârtie: prin câte sate ale rutelor mașinii a
-- trecut segmentul. Trecerea nu dovedește singură că a luat oameni — un drum spre casă
-- trece și el prin sate — dar combinată cu opririle și cu ora, desparte cursa de plimbare.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS sate_gol_pe_traseu int;

COMMENT ON COLUMN lde_route_run.sate_gol_pe_traseu IS
  'Câte sate ale rutelor mașinii au fost atinse pe segmentul socotit gol. Adnotarea făcută '
  'de operațional pe 18.09 («sate 2», «sate 4», «sate 5») e exact cifra asta.';
