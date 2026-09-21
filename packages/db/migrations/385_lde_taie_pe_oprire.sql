-- 385: rutele la care tăietura livrării se face pe OPRIREA reală, nu pe satul din denumire
--
-- Ion, 21.09.2026: «nu are cum la 812MUM așa să fie, de la Cucuruzeni la Crihana e 4 km».
-- Are dreptate. Pe ruta 2, schimbul 2 (unde migr. 380 a mutat startul la Cucuruzenii de
-- Sus) iese cu 5,0 km de livrare — exact cifra lui. Schimburile 1 și 3 rămân cu 16–22,5 km,
-- deși pe ACELEAȘI curse autobuzul a oprit în Cucuruzenii de Sus, Inculeț și Cucuruzeni.
--
-- Cauza: regula cere ca UN SINGUR sat să apară în ≥60% din tururi. Aici bucla de strâns
-- oameni se împarte între patru sate vecine (Crihana, Cucuruzenii de Sus, Cucuruzeni,
-- Inculeț — toate la 3–6 km unul de altul) și niciunul nu adună singur 60% pe schimburile
-- 1 și 3. Împreună apar în aproape fiecare tur, dar regula nu le adună.
--
-- Steagul de aici spune: pe rută×schimb, autobuzul oprește SISTEMATIC dincolo de satul de
-- start (≥60% din tururi au cel puțin o oprire mai departe de poartă decât startul). Când
-- e ridicat, worker-ul taie livrarea pe fiecare cursă la prima oprire reală de urcare —
-- nu poți fi «gol» după ce ai luat primul om.
--
-- ⚠️ De ce NU se face asta peste tot: tăietura pe opriri e evitată intenționat de la
-- 18.09, fiindcă la Popescu (552BRAO, Chiperceni ↔ Vatici) dădea 77 km în loc de 240 —
-- la el drumurile chiar sunt ale șoferului. Măsurat pe 39 de tururi din 10.08: la Popescu
-- satele dincolo de start apar în ~28% din tururi, la Cociorvă în ~100%. Pragul de 60%
-- desparte curat cele două cazuri.
ALTER TABLE lde_route_etalon
  ADD COLUMN IF NOT EXISTS taie_pe_oprire boolean;

COMMENT ON COLUMN lde_route_etalon.taie_pe_oprire IS
  'true = ruta oprește sistematic dincolo de satul de start (≥60% din tururi), deci '
  'livrarea se taie pe fiecare cursă la prima oprire reală, nu la satul din denumire. '
  'Scris de etalon-aggregate.mjs; citit de etalon-write.mjs.';
