-- 277: ultimele două nume care stricau ROSTIREA, nu sensul
--
-- Nu vin din registru (nu sunt sate: o benzinărie și un sat-anexă), dar ambele
-- erau defecte tehnice, nu chestiune de gust:
--   «Petrom Рышканы» — litere latine în mijlocul unei fraze rusești: exact motivul
--   pentru care TTS-ul citea «Vladimir» pe englezește.
--   «Окница (село)» — parantezele ajung în vorbire, iar agentului îi este interzis
--   prin prompt să rostească explicații în paranteze.
--
-- Sesiunea vecină le-a pus deja în tabelul din promptul agentului; aici aliniem
-- baza, ca promptul și baza să nu spună lucruri diferite.
--
-- Rămân la decizia lui Ion, fiindcă țin de uz, nu de tehnică: Otaci («Отачь» sau
-- «Атаки») și Bănești («Бэнешть» sau «Банешты»).

update localities set name_ru = 'Петром Рышканы' where name_ro = 'Petrom Rîșcani' and name_ru = 'Petrom Рышканы';
update localities set name_ru = 'Окница-Сат'     where name_ro = 'Ocnița-Sat'     and name_ru = 'Окница (село)';
