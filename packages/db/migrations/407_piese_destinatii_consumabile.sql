-- 407: Cele două „mașini" care nu erau mașini, puse sub denumirea lor reală din 1C.
--
-- Eduard inventase `1ZERNOHRAN` și `2MAGBRICENI` ca să poată da consumabile — discuri de tăiat, electrozi,
-- diluant, mănuși, biți — unui LOC, nu unui autobuz. Eliberarea cere obligatoriu o mașină, deci a făcut
-- două mașini false. Ocol inteligent, dar strica și evidența, și exportul.
--
-- Mariana a ales denumirile din «виды деятельности» ale contabilului:
--   1ZERNOHRAN  → «Depozit cereale»
--   2MAGBRICENI → «Remzona Briceni»  (materialele alea sunt muncă de atelier, nu de magazin)
--
-- `model` devine „Destinație (nu e mașină)" ca să se vadă în liste ce sunt — altfel cineva eliberează din
-- greșeală o piesă de autobuz pe „Depozit cereale", mai ales acum când începe să lucreze și Lidia.
--
-- GOLUL FUNCȚIONAL RĂMÂNE: consumabilele se dau unui loc de muncă, nu unui vehicul. Astea două sunt
-- rezolvate, dar la al treilea loc se va inventa iar o mașină. Soluția curată e o noțiune separată de
-- destinație, nu mașini deghizate.
WITH dest(vechi, nou, guid) AS (VALUES
  ('1ZERNOHRAN','DEPOZIT CEREALE','97f1f2f9-da93-11ec-811c-2cfda1bbfecf'),
  ('2MAGBRICENI','REMZONA BRICENI','a8e061f2-48ec-11ea-80ea-2cfda1bbfecf'))
UPDATE piese_vehicles v
   SET plate = d.nou, guid_1c_activitate = d.guid::uuid, model = 'Destinație (nu e mașină)'
  FROM dest d
 WHERE v.plate = d.vechi
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.plate = d.nou)
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.guid_1c_activitate = d.guid::uuid);
