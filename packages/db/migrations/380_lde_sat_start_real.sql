-- 380: satul de unde ÎNCEPE REAL ruta — dedus din opririle care se repetă, nu din nume
--
-- Ion, 19.09: «dacă asta se întâmplă sistematic, zilnic — e rută; scrii sub denumirea
-- rutei primul sat de unde urcă». Nomenclatorul numește ruta după un sat care nu e mereu
-- capătul: ruta 2 «Cișmea» pleacă zilnic din Ocnița-Răzeși (20 km dincolo de Cișmea),
-- 18 «Telenești» din Mîndrești, 27 «Cășunca» din Prodăneștii Vechi. Tăiată la satul din
-- nume, naveta șoferului ieșea 125 km/zi la Cociorvă, deși autobuzul TREBUIE să meargă
-- la Ocnița-Răzeși — acolo urcă oamenii.
--
-- Deci: pe fiecare cursă se scriu satele în care autobuzul a OPRIT (≥40 s, nu acasă, nu
-- la poartă) — `sate_oprire`; agregatorul ia, pe fiecare rută, satele unde se oprește în
-- cel puțin 60% din tururi, sare peste satul de casă al șoferului, și îl scrie pe cel mai
-- depărtat pe traseu ca `sat_start_real`. Worker-ul taie livrarea acolo, înaintea satului
-- din nume. Naveta = tot ce e dincolo de el; ruta = de acolo la uzină.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS sate_oprire text[];
COMMENT ON COLUMN lde_route_run.sate_oprire IS
  'Satele în care autobuzul a oprit ≥40 s pe drumul cu pasageri ÎNTREG (înainte de tăierea '
  'livrării), în ordine, fără casa șoferului și fără poartă. Din ele se deduce satul de start real.';

ALTER TABLE lde_route_etalon
  ADD COLUMN IF NOT EXISTS sat_start_real text;
COMMENT ON COLUMN lde_route_etalon.sat_start_real IS
  'Primul sat de pe traseu în care autobuzul oprește în ≥60% din tururile rutei (fără satul '
  'de casă al șoferului). Când există, livrarea se taie aici, nu la satul din denumire.';
