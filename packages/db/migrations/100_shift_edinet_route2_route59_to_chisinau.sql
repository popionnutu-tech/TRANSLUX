-- 100_shift_edinet_route2_route59_to_chisinau.sql
-- Сдвиг утренних рейсов через Единец в сторону Кишинёва (hour_from_nord), ТОЛЬКО до Бэльц.
-- Бэльц и всё южнее, остановки до Единца и обратный рейс (hour_from_chisinau) — НЕ трогаем.
--   Route 2  (Chișinău–Briceni): Единец 06:15 → 06:23 (+8 мин), стопы ids 50..59.
--   Route 59 (Chișinău–Ocnița):  Единец 06:26 → 06:40 (+14 мин), стопы ids 1582..1591.

-- Route 2 (+8 мин)
update crm_stop_fares set hour_from_nord = '06:23' where id = 50;   -- Edineț
update crm_stop_fares set hour_from_nord = '06:33' where id = 51;   -- Cupcini
update crm_stop_fares set hour_from_nord = '06:38' where id = 52;   -- Brătușeni
update crm_stop_fares set hour_from_nord = '06:41' where id = 53;   -- Brătușenii Noi
update crm_stop_fares set hour_from_nord = '06:45' where id = 54;   -- Mihailenii Noi
update crm_stop_fares set hour_from_nord = '06:53' where id = 55;   -- Petrom Rîșcani
update crm_stop_fares set hour_from_nord = '06:53' where id = 56;   -- Intersecția Rîșcani
update crm_stop_fares set hour_from_nord = '07:00' where id = 57;   -- Recea
update crm_stop_fares set hour_from_nord = '07:13' where id = 58;   -- Intersecția Pelenia
update crm_stop_fares set hour_from_nord = '07:16' where id = 59;   -- Corlateni

-- Route 59 (+14 мин)
update crm_stop_fares set hour_from_nord = '06:40' where id = 1582; -- Edineț
update crm_stop_fares set hour_from_nord = '06:49' where id = 1583; -- Cupcini
update crm_stop_fares set hour_from_nord = '06:56' where id = 1584; -- Brătușeni
update crm_stop_fares set hour_from_nord = '07:10' where id = 1585; -- Brătușenii Noi
update crm_stop_fares set hour_from_nord = '07:17' where id = 1586; -- Mihailenii Noi
update crm_stop_fares set hour_from_nord = '07:30' where id = 1587; -- Petrom Rîșcani
update crm_stop_fares set hour_from_nord = '07:30' where id = 1588; -- Intersecția Rîșcani
update crm_stop_fares set hour_from_nord = '07:42' where id = 1589; -- Recea
update crm_stop_fares set hour_from_nord = '08:00' where id = 1590; -- Intersecția Pelenia
update crm_stop_fares set hour_from_nord = '08:07' where id = 1591; -- Corlateni
