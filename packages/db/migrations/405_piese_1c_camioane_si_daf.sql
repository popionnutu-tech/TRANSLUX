-- 405: Camioanele, DAF-urile și remorcile — legate de 1C. Și dovada că zece perechi sunt dubluri.
--
-- Mariana a întrebat direct: «în lista «вид деятельности» nu sunt aceste mașini?». Verificarea de dinainte
-- fusese făcută DOAR pe cele 49 nelegate de atunci, înainte ca Eduard să introducă camioanele. Refăcută
-- acum pe toate cele 36 nelegate: 30 SUNT acolo. Afirmația mea anterioară era greșită.
--
-- Legate 20. Celelalte 10 NU se pot lega, și motivul e cel mai valoros rezultat al verificării:
--
-- GUID-ul lor e DEJA folosit de o altă mașină a noastră. Adică în 1C există UN SINGUR obiect, iar la noi
-- două rânduri. Asta încetează să mai fie o bănuială: `553GHT` și `GHT553` SUNT același autobuz, fiindcă
-- la contabil există un singur «553 GHT». La fel toate celelalte nouă.
--
--   135HMK = HMK135    214MOW = MOW214    230IIC = IIC230    263IIC = IIC263    341ANT = ANT341
--   357QDQ = QDQ357    553GHT = GHT553    724YJX = YJX724    742KYK = KYK742    784KYK = KYK784
--
-- Pe variantele noi s-au emis deja 22 de documente (4 pe 553GHT, câte 2 pe restul). Fuziunea nu se face
-- aici: mișcările de stoc sunt append-only, deci nu pot fi mutate pe rândul corect. E o decizie despre
-- registru, nu una tehnică — rămâne la Mariana.
WITH g(plate, guid) AS (VALUES
  ('213OMM','025cb85e-4197-11ea-80ea-2cfda1bbfecf'),('308GHT','24352019-9f7c-11f1-8176-2cfda1bbfecf'),
  ('554NPL','ecc05390-41b1-11ea-80ea-2cfda1bbfecf'),('601NPL','ecc05393-41b1-11ea-80ea-2cfda1bbfecf'),
  ('622NPL','ecc05396-41b1-11ea-80ea-2cfda1bbfecf'),('624WYW','f45c8cae-bbe8-11ed-812d-2cfda1bbfecf'),
  ('631IZX','ecc05399-41b1-11ea-80ea-2cfda1bbfecf'),('633WYW','f45c8caa-bbe8-11ed-812d-2cfda1bbfecf'),
  ('655WYW','f45c8ca6-bbe8-11ed-812d-2cfda1bbfecf'),('680TAZ','0b567a32-4df9-11ed-8127-2cfda1bbfecf'),
  ('683GXP','71430d41-41a6-11ea-80ea-2cfda1bbfecf'),('785TBG','34486ab9-1eb7-11ed-8121-2cfda1bbfecf'),
  ('797MUM','d3775d20-41b2-11ea-80ea-2cfda1bbfecf'),('801MUM','d3775d21-41b2-11ea-80ea-2cfda1bbfecf'),
  ('805RNK','d3775d24-41b2-11ea-80ea-2cfda1bbfecf'),('855QXK','46a2a29f-9872-11eb-810e-2cfda1bbfecf'),
  ('865TGV','a22c2db1-426e-11ea-80ea-2cfda1bbfecf'),('938GHT','62cbc47e-74df-11eb-8108-2cfda1bbfecf'),
  ('940TBV','7eacd390-f777-11f0-816c-2cfda1bbfecf'),('L180MM','f86f9d1a-fdff-11ec-811f-2cfda1bbfecf'))
UPDATE piese_vehicles v SET guid_1c_activitate = g.guid::uuid
  FROM g
 WHERE v.plate = g.plate AND v.guid_1c_activitate IS NULL
   -- garda care face vizibile dublurile: un GUID nu poate fi al două mașini
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles x WHERE x.guid_1c_activitate = g.guid::uuid);
