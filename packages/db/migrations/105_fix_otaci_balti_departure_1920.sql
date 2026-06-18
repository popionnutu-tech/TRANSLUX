-- 105_fix_otaci_balti_departure_1920.sql
-- Вечерний Otaci (Bălți→Chișinău) реально выезжает из Бэлць в 19:20, а не 19:30
-- (по владельцу). Поправка времени существующего рейса; северный выезд (Otaci 16:25)
-- и привязка nord_town не меняются. Только отображение/сортировка на доске Бэлць.
-- Идемпотентно: после применения строки 19:30 уже нет.
update trips set departure_time='19:20'
where direction='BALTI_CHISINAU' and departure_time='19:30' and nord_town='Otaci';
