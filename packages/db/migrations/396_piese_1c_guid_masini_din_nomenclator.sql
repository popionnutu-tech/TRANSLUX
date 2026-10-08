-- 396: 42 de mașini legate de 1C, din nomenclatorul «Виды деятельности» primit de la contabilă (08.10.2026).
--
-- Contabila a descărcat nomenclatorul ei de «виды деятельности» (628 de obiecte, din care 552 elemente
-- utile — restul grupe sau marcate la ștergere). Din cele 49 de mașini nelegate ale noastre, 42 s-au
-- regăsit acolo.
--
-- CAPCANA care era să mă păcălească: prima potrivire a dat ZERO rezultate. Numărul e scris INVERS în 1C
-- față de noi — `QDQ364` la noi e «364 QDQ» acolo, `BNQ069` e «069 BNQ». Nu la toate: `263NSX` e «263 NSX»,
-- adică deja în ordinea noastră. Deci potrivirea încearcă ambele ordini, după ce scoate tot ce nu e literă
-- sau cifră.
--
-- Zero ar fi fost un rezultat „curat" și complet greșit — l-am prins doar fiindcă am verificat metoda pe o
-- mașină despre care ȘTIAM că e legată (263NSX, al cărei GUID era deja în bază) și care n-a ieșit nici ea.
--
-- Verificat înainte de scriere: 42 de GUID-uri distincte, toate cele 42 de numere există la noi, niciun
-- GUID nu era deja folosit de altă mașină, nicio mașină nu era deja legată. Scrierea are `WHERE
-- guid_1c_activitate IS NULL`, deci nu poate suprascrie o legătură existentă.
--
-- Rezultat: 157 → 199 mașini legate din 206. Rămân 7, care NU există în nomenclatorul contabilei:
-- 061COY, 314BRAZ, 526WVW, 725YOZ, 745RSN, 768RSN, 998TOP. Ultimele două sunt adăugate de noi ieri, deci
-- normal că lipsesc; celelalte cinci trebuie create de ea în 1C sau sunt mașini ieșite din parc.
WITH nou(plate, guid) AS (VALUES
  ('ANT316','b53f27d2-d5a3-11ec-811c-2cfda1bbfecf'),('ANT341','b53f27df-d5a3-11ec-811c-2cfda1bbfecf'),
  ('ANT344','b53f27da-d5a3-11ec-811c-2cfda1bbfecf'),('ANT347','b53f27c5-d5a3-11ec-811c-2cfda1bbfecf'),
  ('BNQ069','e8b06d5e-2da6-11ed-8124-2cfda1bbfecf'),('BNQ076','057d2c5e-33f3-11ed-8124-2cfda1bbfecf'),
  ('BNQ085','e8b06d72-2da6-11ed-8124-2cfda1bbfecf'),('BNQ088','dde65c94-38a4-11ed-8126-2cfda1bbfecf'),
  ('BNQ091','e8b06d64-2da6-11ed-8124-2cfda1bbfecf'),('DKE248','91ca0a27-286d-11ed-8122-2cfda1bbfecf'),
  ('GHT553','9d4df0c4-446f-11ed-8126-2cfda1bbfecf'),('GHT577','9d4df0c0-446f-11ed-8126-2cfda1bbfecf'),
  ('HMK127','57d976b9-dbea-11ec-811c-2cfda1bbfecf'),('HMK135','57d976c1-dbea-11ec-811c-2cfda1bbfecf'),
  ('HMK139','57d976c8-dbea-11ec-811c-2cfda1bbfecf'),('HMK145','b53f27cc-d5a3-11ec-811c-2cfda1bbfecf'),
  ('IIC230','a1ba1694-3e24-11ed-8126-2cfda1bbfecf'),('IIC263','a1ba1695-3e24-11ed-8126-2cfda1bbfecf'),
  ('KWX620','f86f9d16-fdff-11ec-811f-2cfda1bbfecf'),('KWX632','f86f9d18-fdff-11ec-811f-2cfda1bbfecf'),
  ('KYK692','f506f595-13ea-11ed-811f-2cfda1bbfecf'),('KYK742','f506f593-13ea-11ed-811f-2cfda1bbfecf'),
  ('KYK784','f506f594-13ea-11ed-811f-2cfda1bbfecf'),('LJN075','85a485e1-90f4-11ed-812a-2cfda1bbfecf'),
  ('LJN076','85a485dd-90f4-11ed-812a-2cfda1bbfecf'),('LJN080','85a485d9-90f4-11ed-812a-2cfda1bbfecf'),
  ('LML973','9b325e1a-fc67-11ec-811f-2cfda1bbfecf'),('MOW214','f86f9d19-fdff-11ec-811f-2cfda1bbfecf'),
  ('MOW218','f86f9d17-fdff-11ec-811f-2cfda1bbfecf'),('MWC069','9b325e12-fc67-11ec-811f-2cfda1bbfecf'),
  ('OMM186','025cb85a-4197-11ea-80ea-2cfda1bbfecf'),('QDQ348','7769def3-1938-11ed-8120-2cfda1bbfecf'),
  ('QDQ357','0c8df79e-1729-11ed-8120-2cfda1bbfecf'),('QDQ364','7769deed-1938-11ed-8120-2cfda1bbfecf'),
  ('QDQ375','7769def9-1938-11ed-8120-2cfda1bbfecf'),('QDQ395','0c8df79d-1729-11ed-8120-2cfda1bbfecf'),
  ('QDQ396','0c8df79f-1729-11ed-8120-2cfda1bbfecf'),('QDQ419','948af3a5-1f84-11ed-8121-2cfda1bbfecf'),
  ('QDQ714','12b7bdde-2378-11ed-8121-2cfda1bbfecf'),('RWN169','6ab8ab3e-e1b7-11ec-811c-2cfda1bbfecf'),
  ('RWN193','6ab8ab40-e1b7-11ec-811c-2cfda1bbfecf'),('YJX724','4e99764d-3b43-11ed-8126-2cfda1bbfecf'))
UPDATE piese_vehicles v SET guid_1c_activitate = nou.guid::uuid
  FROM nou WHERE v.plate = nou.plate AND v.guid_1c_activitate IS NULL;
