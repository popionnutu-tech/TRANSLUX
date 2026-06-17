-- 104_trips_nord_origin_balti.sql
-- Северное происхождение для рейсов Bălți→Chișinău (доска загрузки Бэлць).
--
-- Операторы Бэлць грузят автобусы, идущие с севера; в доске по каждому рейсу
-- показываем: время отправления из Бэлць + северный город + время выезда с севера.
-- Расписание crm_routes расходится с расписанием бота `trips` на ~5–15 мин и неполное
-- (например, у вечернего Briceni 15:55 нет чистой строки в crm), поэтому выверенную
-- владельцем привязку храним ПРЯМО на рейсе, а не через хрупкий crm_route_id-join.
alter table trips add column if not exists nord_town text;
alter table trips add column if not exists nord_departure text;

update trips set nord_town='Grimăncăuți',        nord_departure='03:00' where direction='BALTI_CHISINAU' and departure_time='05:20';
update trips set nord_town='Lipcani',            nord_departure='02:35' where direction='BALTI_CHISINAU' and departure_time='05:30';
update trips set nord_town='Criva (Tețcani)',    nord_departure='02:40' where direction='BALTI_CHISINAU' and departure_time='06:30';
update trips set nord_town='Lipcani (Viișoara)', nord_departure='04:05' where direction='BALTI_CHISINAU' and departure_time='06:55';
update trips set nord_town='Briceni',            nord_departure='05:45' where direction='BALTI_CHISINAU' and departure_time='07:35';
update trips set nord_town='Ocnița',             nord_departure='05:30' where direction='BALTI_CHISINAU' and departure_time='08:15';
update trips set nord_town='Corjeuți',           nord_departure='06:17' where direction='BALTI_CHISINAU' and departure_time='08:35';
update trips set nord_town='Criva (Larga)',      nord_departure='06:00' where direction='BALTI_CHISINAU' and departure_time='09:00';
update trips set nord_town='Lipcani',            nord_departure='06:35' where direction='BALTI_CHISINAU' and departure_time='09:20';
update trips set nord_town='Caracusenii Vechi',  nord_departure='07:00' where direction='BALTI_CHISINAU' and departure_time='09:30';
update trips set nord_town='Lipcani',            nord_departure='06:10' where direction='BALTI_CHISINAU' and departure_time='10:05';
update trips set nord_town='Ocnița',             nord_departure='08:00' where direction='BALTI_CHISINAU' and departure_time='10:25';
update trips set nord_town='Criva',              nord_departure='07:05' where direction='BALTI_CHISINAU' and departure_time='10:50';
update trips set nord_town='Criva (Larga)',      nord_departure='07:25' where direction='BALTI_CHISINAU' and departure_time='11:10';
update trips set nord_town='Corjeuți (Briceni)', nord_departure='08:00' where direction='BALTI_CHISINAU' and departure_time='11:45';
update trips set nord_town='Lipcani',            nord_departure='09:15' where direction='BALTI_CHISINAU' and departure_time='12:10';
update trips set nord_town='Ocnița',             nord_departure='09:50' where direction='BALTI_CHISINAU' and departure_time='12:45';
update trips set nord_town='Criva',              nord_departure='09:35' where direction='BALTI_CHISINAU' and departure_time='13:10';
update trips set nord_town='Șirăuți',            nord_departure='10:10' where direction='BALTI_CHISINAU' and departure_time='13:55';
update trips set nord_town='Criva',              nord_departure='11:00' where direction='BALTI_CHISINAU' and departure_time='14:20';
update trips set nord_town='Criva',              nord_departure='12:00' where direction='BALTI_CHISINAU' and departure_time='15:20';
update trips set nord_town='Criva',              nord_departure='12:30' where direction='BALTI_CHISINAU' and departure_time='15:45';
update trips set nord_town='Otaci',              nord_departure='12:35' where direction='BALTI_CHISINAU' and departure_time='16:00';
update trips set nord_town='Criva',              nord_departure='13:20' where direction='BALTI_CHISINAU' and departure_time='16:20';
update trips set nord_town='Lipcani',            nord_departure='14:10' where direction='BALTI_CHISINAU' and departure_time='17:00';
update trips set nord_town='Briceni',            nord_departure='15:55' where direction='BALTI_CHISINAU' and departure_time='18:25';
update trips set nord_town='Criva',              nord_departure='15:30' where direction='BALTI_CHISINAU' and departure_time='18:40';
update trips set nord_town='Otaci',              nord_departure='16:25' where direction='BALTI_CHISINAU' and departure_time='19:30';
update trips set nord_town='Criva',              nord_departure='17:30' where direction='BALTI_CHISINAU' and departure_time='20:20';
