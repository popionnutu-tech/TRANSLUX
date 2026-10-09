-- 406: Cele 13 perechi de dubluri, rezolvate fără niciun storno. Toate mașinile sunt legate de 1C.
--
-- Corecțiile Marianei (09.10), verificate una câte una în nomenclatorul contabilului:
--   `075LJM` → de fapt `075 LJN` — greșeala era la noi
--   `369VKF` → de fapt `369 VKV`
--   `880NPL` → de fapt `880 RNK`
-- Toate trei există la contabil sub forma corectată; formele noastre greșite nu existau nicăieri.
--
-- CUM S-A REZOLVAT, și de ce n-a fost nevoie de storno: în toate cele 13 perechi, rândul care ținea
-- GUID-ul era GOL — zero documente, zero mișcări — iar documentele erau pe rândul fără GUID. Deci se
-- șterge rândul gol, iar GUID-ul trece pe cel cu istoric. Registrul append-only nu se atinge, documentele
-- rămân exact unde sunt, și devin exportabile.
--
-- Mă pregăteam să-ți propun stornarea a 22 de documente. Verificarea a arătat că nu e necesar niciunul.
--
-- DOVADA că erau aceeași mașină, nu două: în 1C există un singur obiect pentru fiecare, iar ambele noastre
-- rânduri duceau la același GUID. Nu mai e o bănuială despre cum se scriu numerele.
WITH goale(plate) AS (VALUES ('HMK135'),('MOW214'),('IIC230'),('IIC263'),('ANT341'),('QDQ357'),
                             ('GHT553'),('YJX724'),('KYK742'),('KYK784'),('LJN075'),('880RNK'))
DELETE FROM piese_vehicles v USING goale g
 WHERE v.plate = g.plate
   -- garda: se șterge DOAR ce chiar n-are nimic pe el
   AND NOT EXISTS (SELECT 1 FROM piese_stock_documents d WHERE d.vehicle_id = v.id)
   AND NOT EXISTS (SELECT 1 FROM piese_stock_movements m WHERE m.vehicle_id = v.id);

WITH fix(vechi, nou, guid) AS (VALUES
  ('075LJM','075LJN','85a485e1-90f4-11ed-812a-2cfda1bbfecf'),
  ('369VKF','369VKV','a22c2dae-426e-11ea-80ea-2cfda1bbfecf'),
  ('880NPL','880RNK','f770a1d8-c5ab-11ea-80f3-2cfda1bbfecf'))
UPDATE piese_vehicles v SET plate = f.nou, guid_1c_activitate = f.guid::uuid
  FROM fix f WHERE v.plate = f.vechi
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.plate = f.nou);

WITH g(plate, guid) AS (VALUES
  ('135HMK','57d976c1-dbea-11ec-811c-2cfda1bbfecf'),('214MOW','f86f9d19-fdff-11ec-811f-2cfda1bbfecf'),
  ('230IIC','a1ba1694-3e24-11ed-8126-2cfda1bbfecf'),('263IIC','a1ba1695-3e24-11ed-8126-2cfda1bbfecf'),
  ('341ANT','b53f27df-d5a3-11ec-811c-2cfda1bbfecf'),('357QDQ','0c8df79e-1729-11ed-8120-2cfda1bbfecf'),
  ('553GHT','9d4df0c4-446f-11ed-8126-2cfda1bbfecf'),('724YJX','4e99764d-3b43-11ed-8126-2cfda1bbfecf'),
  ('742KYK','f506f593-13ea-11ed-811f-2cfda1bbfecf'),('784KYK','f506f594-13ea-11ed-811f-2cfda1bbfecf'))
UPDATE piese_vehicles v SET guid_1c_activitate = g.guid::uuid
  FROM g WHERE v.plate = g.plate AND v.guid_1c_activitate IS NULL
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.guid_1c_activitate = g.guid::uuid);

-- Scris greșit la introducere.
UPDATE piese_vehicles SET model = 'Actros' WHERE model = 'Actos';
