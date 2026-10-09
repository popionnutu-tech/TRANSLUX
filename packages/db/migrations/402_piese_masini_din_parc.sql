-- 402: Mașinile din parc care lipseau la Piese, legate direct de 1C.
--
-- Eduard (09.10): «ДОБАВИТЬ В БАЗУ НОМЕРА ГРУЗОВИКОВ И ДАФОВ». Comparând lista Piese cu evidența parcului
-- (`vehicles`) lipseau 17 — din care 6 sunt cele curățate azi (dubluri și redenumiri, migr. 398) și una
-- (`186OMM`) e aceeași mașină ca `OMM186`, scrisă invers. Rămân 10 reale.
--
-- Nouă s-au regăsit în nomenclatorul «Виды деятельности» al contabilului, deci intră direct legate.
-- `297LVY` nu e acolo — rămâne nelegată, de întrebat.
WITH nou(plate, guid) AS (VALUES
  ('125COY','63dc8419-fb57-11ec-811f-2cfda1bbfecf'),
  ('127COY','025cb84c-4197-11ea-80ea-2cfda1bbfecf'),
  ('270QXK','ecc0535e-41b1-11ea-80ea-2cfda1bbfecf'),
  ('405LLA','ecc05379-41b1-11ea-80ea-2cfda1bbfecf'),
  ('589BRAY','ecc05392-41b1-11ea-80ea-2cfda1bbfecf'),
  ('614WYW','f45c8cb2-bbe8-11ec-811c-2cfda1bbfecf'),
  ('740IZX','d3775d16-41b2-11ea-80ea-2cfda1bbfecf'),
  ('809MUM','d3775d27-41b2-11ea-80ea-2cfda1bbfecf'),
  ('846QXK','a73bdeb8-78c7-11ed-8128-2cfda1bbfecf'),
  ('297LVY', NULL))
INSERT INTO piese_vehicles (plate, model, km_current, active, guid_1c_activitate)
SELECT n.plate, 'Autobuz/microbuz', 0, true, n.guid::uuid
  FROM nou n
 WHERE NOT EXISTS (SELECT 1 FROM piese_vehicles v WHERE v.plate = n.plate)
   AND (n.guid IS NULL OR NOT EXISTS (SELECT 1 FROM piese_vehicles v WHERE v.guid_1c_activitate = n.guid::uuid));
