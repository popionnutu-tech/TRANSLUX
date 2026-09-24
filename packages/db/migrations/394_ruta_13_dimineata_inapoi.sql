-- 394: ruta 13 revine — doar plecarea de 08:00 din Chișinău prin Rîșcani (ION-49)
--
-- Ion, 24.09: «facem cum înainte a fost, Boaghie să apară la ora 8:40 din
-- Chișinău, și Alexandru Strasnii la orele 8:00 dimineața Lipcani–Rîșcani».
-- Migr. 333 (09.09) scosese ruta întreagă; de atunci autobuzul rutei 16 (784MJW)
-- se întorcea din Chișinău pe ruta 10, la 08:40, odată cu 827WJQ. Ruta redevine
-- activă; plecarea de 15:00 din Lipcani rămâne ascunsă (tur_ascuns din migr. 332).

update crm_routes set active = true where id = 13 and tur_ascuns = true;
