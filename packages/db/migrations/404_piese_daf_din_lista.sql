-- 404: Cele 12 DAF-uri care lipseau, din lista trimisă de Eduard (даф.xlsx, 45 de poziții).
--
-- Din cele 45 din listă: 31 existau deja scrise identic, una (`186 OMM`) există ca `OMM186` — aceeași
-- mașină, cu cifrele în cealaltă ordine — iar 13 lipseau. Se adaugă 12.
--
-- `369 VKV` NU se adaugă, deliberat: la noi există `369VKF`, marcată chiar „Autobuz/Daf". O literă
-- diferență. Dacă e aceeași mașină, adăugarea ar crea exact dublura care ne-a costat ieri 27 de mișcări
-- de stoc pe rândul greșit. De lămurit cu Eduard înainte.
--
-- La fel rămâne de verificat `880 RNK` din listă față de `880NPL` pe care îl avem tot ca „Autobuz/DAF":
-- cifrele coincid, literele nu. Aici n-am adăugat nimic, fiindcă `880RNK` nu era în lista celor lipsă —
-- îl notez ca întrebare, nu ca acțiune.
--
-- Modelul vine din listă (VDL BERKHOF, SB200 AMBASSADOR etc.), prefixat „Autobuz/DAF" ca la cele două
-- care existau deja — altfel am fi avut trei convenții de scriere pentru același fel de vehicul.
--
-- Garda din INSERT verifică ȘI forma inversă a numărului, nu doar scrierea exactă.
WITH nou(plate, model) AS (VALUES
 ('213OMM','Autobuz/DAF VDL BERKHOF'),('554NPL','Autobuz/DAF AMBASSADOR SB 200'),
 ('601NPL','Autobuz/DAF AMBASSADOR'),('622NPL','Autobuz/DAF AMBASSADOR'),
 ('624WYW','Autobuz/DAF VDL AMBASADOR 200'),('631IZX','Autobuz/DAF SB200 AMBASSADOR'),
 ('633WYW','Autobuz/DAF VDL AMBASADOR 200'),('655WYW','Autobuz/DAF VDL AMBASADOR 200'),
 ('683GXP','Autobuz/DAF SB200 AMBASSADOR'),('797MUM','Autobuz/DAF AMBASADOR SB200'),
 ('801MUM','Autobuz/DAF AMBASADOR SB200'),('805RNK','Autobuz/DAF AMBASSADOR SB 200'))
INSERT INTO piese_vehicles (plate, model, km_current, active)
SELECT n.plate, n.model, 0, true FROM nou n
 WHERE NOT EXISTS (SELECT 1 FROM piese_vehicles v WHERE v.plate = n.plate)
   AND NOT EXISTS (SELECT 1 FROM piese_vehicles v
     WHERE v.plate = regexp_replace(n.plate, '^([0-9]+)([A-Z]+)$', '\2\1'));
