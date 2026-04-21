-- 041_suburban_routes_seed.sql
-- Seed date: 14 rute suburbane din raionul Briceni cu stații, km și orare.
-- Rutele pornesc TUR din sat spre Briceni (village → hub).
-- km_from_nord = segment distance în direcția TUR
-- km_from_chisinau = segment distance în direcția RETUR (simetric)

BEGIN;

DO $$
DECLARE
  v_route_id INT;
  v_sched_id INT;
  v_stop_ids INT[];
  -- Stop name arrays for each route (in TUR order: village → Briceni)
BEGIN

-- ============================================================
-- R1: Briceni ↔ Beleavinți (cod 4559)
-- Stops TUR: Beleavinți(0) → Berlinet(0) → Caracușenii Noi(9) → Briceni(7)
-- km cumulate: 16, 16, 7, 0 (de la Beleavinți)
-- km cumulate retur: 0, 0, 9, 16 (de la Briceni)
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru,
  sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Beleavinți', 'Briceni', 'Бельевинцы', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

-- Stops in TUR order (village → Briceni)
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Beleavinți', 'Бельевинцы', 0, 0, 0, 0, true),
  (v_route_id, 'Berlinet', 'Берлинец', 0, 0, 0, 0, true),
  (v_route_id, 'Caracușenii Noi', 'Каракушений Ной', 9, 9, 15, 15, true),
  (v_route_id, 'Briceni', 'Бричень', 7, 7, 15, 15, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;
-- v_stop_ids[1]=Beleavinți, [2]=Berlinet, [3]=CS Noi, [4]=Briceni

-- R1 Schedules: TUR MJD, 7 curse
-- Cursele 2,5,6,7 sar peste Beleavinți (încep de la Berlinet)
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '07:05', 1),
  (v_sched_id, v_stop_ids[2], '07:10', 2),
  (v_sched_id, v_stop_ids[3], '07:15', 3),
  (v_sched_id, v_stop_ids[4], '07:25', 4);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[2], '07:45', 1),
  (v_sched_id, v_stop_ids[3], '07:50', 2),
  (v_sched_id, v_stop_ids[4], '08:00', 3);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '08:15', 1),
  (v_sched_id, v_stop_ids[2], '08:20', 2),
  (v_sched_id, v_stop_ids[3], '08:25', 3),
  (v_sched_id, v_stop_ids[4], '08:35', 4);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '08:55', 1),
  (v_sched_id, v_stop_ids[2], '09:00', 2),
  (v_sched_id, v_stop_ids[3], '09:30', 3),
  (v_sched_id, v_stop_ids[4], '09:40', 4);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 5, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[2], '10:00', 1),
  (v_sched_id, v_stop_ids[3], '10:30', 2),
  (v_sched_id, v_stop_ids[4], '10:40', 3);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 6, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[2], '11:00', 1),
  (v_sched_id, v_stop_ids[3], '11:30', 2),
  (v_sched_id, v_stop_ids[4], '11:40', 3);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 7, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[2], '12:00', 1),
  (v_sched_id, v_stop_ids[3], '12:30', 2),
  (v_sched_id, v_stop_ids[4], '12:40', 3);

-- ============================================================
-- R2: Briceni ↔ Balasinesti
-- Stops TUR: Balasinesti(0) → Beleavinți(6) → Berlinet(0) → Caracușenii Noi(9) → Briceni(7)
-- km cumulate tur: 22, 16, 16, 7, 0
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Balasinesti', 'Briceni', 'Балашинести', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Balasinesti', 'Балашинести', 0, 0, 0, 0, true),
  (v_route_id, 'Beleavinți', 'Бельевинцы', 6, 6, 10, 10, true),
  (v_route_id, 'Berlinet', 'Берлинец', 0, 0, 0, 0, true),
  (v_route_id, 'Caracușenii Noi', 'Каракушений Ной', 9, 9, 15, 15, true),
  (v_route_id, 'Briceni', 'Бричень', 7, 7, 15, 15, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- 3 curse TUR pe MJD
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '07:30', 1),
  (v_sched_id, v_stop_ids[2], '07:40', 2),
  (v_sched_id, v_stop_ids[3], '07:45', 3),
  (v_sched_id, v_stop_ids[4], '08:00', 4),
  (v_sched_id, v_stop_ids[5], '08:15', 5);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '08:45', 1),
  (v_sched_id, v_stop_ids[2], '08:55', 2),
  (v_sched_id, v_stop_ids[3], '09:00', 3),
  (v_sched_id, v_stop_ids[4], '09:15', 4),
  (v_sched_id, v_stop_ids[5], '09:30', 5);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '10:00', 1),
  (v_sched_id, v_stop_ids[2], '10:30', 2),
  (v_sched_id, v_stop_ids[3], '10:45', 3),
  (v_sched_id, v_stop_ids[4], '11:15', 4),
  (v_sched_id, v_stop_ids[5], '11:30', 5);

-- ============================================================
-- R3: Briceni ↔ Colicăuți (5 km)
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Colicăuți', 'Briceni', 'Коликэуць', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Colicăuți', 'Коликэуць', 0, 0, 0, 0, true),
  (v_route_id, 'Briceni', 'Бричень', 5, 5, 20, 20, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- 9 curse TUR MJD + 1 LMV
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:50', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '08:07', 1), (v_sched_id, v_stop_ids[2], '08:22', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '08:40', 1), (v_sched_id, v_stop_ids[2], '09:00', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '09:17', 1), (v_sched_id, v_stop_ids[2], '09:35', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 5, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '09:55', 1), (v_sched_id, v_stop_ids[2], '10:15', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 6, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '10:35', 1), (v_sched_id, v_stop_ids[2], '10:55', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 7, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '11:15', 1), (v_sched_id, v_stop_ids[2], '11:35', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 8, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '11:55', 1), (v_sched_id, v_stop_ids[2], '12:15', 2);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 9, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '12:35', 1), (v_sched_id, v_stop_ids[2], '13:00', 2);

-- Colicăuți LMV
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 10, ARRAY[1,3,5]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:50', 2);

-- ============================================================
-- R4: Briceni ↔ Grimăncăuți (5 km)
-- Direcția datelor: Briceni→Grimăncăuți (tratăm ca RETUR conform convenției)
-- TUR = Grimăncăuți→Briceni (dir care aduce pasageri la hub)
-- Foto arată 15 curse Briceni→Grimăncăuți pe MJD, 1 pe LMV, 1 pe sâmbătă
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Grimăncăuți', 'Briceni', 'Гриманкауць', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Grimăncăuți', 'Гриманкауць', 0, 0, 0, 0, true),
  (v_route_id, 'Briceni', 'Бричень', 5, 5, 15, 15, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- MJD: 15 curse RETUR (Briceni → Grimăncăuți) la 30 min
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '06:45', 1), (v_sched_id, v_stop_ids[1], '07:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '07:15', 1), (v_sched_id, v_stop_ids[1], '07:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '07:45', 1), (v_sched_id, v_stop_ids[1], '08:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '08:15', 1), (v_sched_id, v_stop_ids[1], '08:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 5, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '08:45', 1), (v_sched_id, v_stop_ids[1], '09:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 6, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '09:15', 1), (v_sched_id, v_stop_ids[1], '09:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 7, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '09:45', 1), (v_sched_id, v_stop_ids[1], '10:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 8, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '10:15', 1), (v_sched_id, v_stop_ids[1], '10:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 9, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '10:45', 1), (v_sched_id, v_stop_ids[1], '11:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 10, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '11:15', 1), (v_sched_id, v_stop_ids[1], '11:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 11, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '11:45', 1), (v_sched_id, v_stop_ids[1], '12:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 12, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '12:15', 1), (v_sched_id, v_stop_ids[1], '12:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 13, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '12:45', 1), (v_sched_id, v_stop_ids[1], '13:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'retur', 14, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[2], '13:15', 1), (v_sched_id, v_stop_ids[1], '13:30', 2);

-- LMV + Sâmbătă: 1 cursă TUR 7:30
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES
  (v_route_id, 'tur', 15, ARRAY[1,3,5,6]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES
  (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:45', 2);

-- ============================================================
-- R5: Briceni ↔ Tabani (6 km)
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Tabani', 'Briceni', 'Табань', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Tabani', 'Табань', 0, 0, 0, 0, true),
  (v_route_id, 'Briceni', 'Бричень', 6, 6, 15, 15, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- MJD: 8 curse TUR
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:45', 1), (v_sched_id, v_stop_ids[2], '08:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '08:15', 1), (v_sched_id, v_stop_ids[2], '08:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '08:45', 1), (v_sched_id, v_stop_ids[2], '09:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '09:15', 1), (v_sched_id, v_stop_ids[2], '09:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 5, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '09:45', 1), (v_sched_id, v_stop_ids[2], '10:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 6, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '10:15', 1), (v_sched_id, v_stop_ids[2], '10:30', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 7, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '10:45', 1), (v_sched_id, v_stop_ids[2], '11:00', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 8, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '11:15', 1), (v_sched_id, v_stop_ids[2], '11:30', 2);

-- ============================================================
-- R6: Briceni ↔ Corjeuți (cod 4023) — Tabani(6), Caracușenii Vechi(12), Corjeuți(20)
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Corjeuți', 'Briceni', 'Коржеуць', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Corjeuți', 'Коржеуць', 0, 0, 0, 0, true),
  (v_route_id, 'Caracușenii Vechi', 'Каракушений Вечь', 8, 8, 15, 15, true),
  (v_route_id, 'Tabani', 'Табань', 6, 6, 15, 15, true),
  (v_route_id, 'Briceni', 'Бричень', 6, 6, 10, 10, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- MJD: 4 curse TUR
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:45', 2), (v_sched_id, v_stop_ids[3], '08:05', 3), (v_sched_id, v_stop_ids[4], '08:15', 4);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '09:00', 1), (v_sched_id, v_stop_ids[2], '09:15', 2), (v_sched_id, v_stop_ids[3], '09:35', 3), (v_sched_id, v_stop_ids[4], '09:45', 4);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '10:30', 1), (v_sched_id, v_stop_ids[2], '10:45', 2), (v_sched_id, v_stop_ids[3], '11:00', 3), (v_sched_id, v_stop_ids[4], '11:10', 4);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '12:00', 1), (v_sched_id, v_stop_ids[2], '12:15', 2), (v_sched_id, v_stop_ids[3], '12:35', 3), (v_sched_id, v_stop_ids[4], '12:45', 4);

-- LMV: 1 cursă TUR 7:30
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 5, ARRAY[1,3,5]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:45', 2), (v_sched_id, v_stop_ids[3], '08:05', 3), (v_sched_id, v_stop_ids[4], '08:15', 4);

-- ============================================================
-- R7: Briceni ↔ Trebisauti (14 km)
-- ============================================================
INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru, sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Trebisăuți', 'Briceni', 'Требисауць', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible) VALUES
  (v_route_id, 'Trebisăuți', 'Требисауць', 0, 0, 0, 0, true),
  (v_route_id, 'Briceni', 'Бричень', 14, 14, 15, 15, true);

SELECT array_agg(id ORDER BY id) INTO v_stop_ids FROM crm_stop_prices WHERE crm_route_id = v_route_id;

-- MJD: 14 curse TUR
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:00', 1), (v_sched_id, v_stop_ids[2], '07:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '07:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 3, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '08:00', 1), (v_sched_id, v_stop_ids[2], '08:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 4, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '08:30', 1), (v_sched_id, v_stop_ids[2], '08:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 5, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '09:00', 1), (v_sched_id, v_stop_ids[2], '09:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 6, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '09:30', 1), (v_sched_id, v_stop_ids[2], '09:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 7, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '10:00', 1), (v_sched_id, v_stop_ids[2], '10:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 8, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '10:30', 1), (v_sched_id, v_stop_ids[2], '10:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 9, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '11:00', 1), (v_sched_id, v_stop_ids[2], '11:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 10, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '11:30', 1), (v_sched_id, v_stop_ids[2], '11:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 11, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '12:00', 1), (v_sched_id, v_stop_ids[2], '12:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 12, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '12:30', 1), (v_sched_id, v_stop_ids[2], '12:45', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 13, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '13:00', 1), (v_sched_id, v_stop_ids[2], '13:15', 2);
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 14, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '13:30', 1), (v_sched_id, v_stop_ids[2], '13:45', 2);

-- LMV + Sâmbătă: 1 cursă TUR
INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week) VALUES (v_route_id, 'tur', 15, ARRAY[1,3,5,6]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops VALUES (v_sched_id, v_stop_ids[1], '07:30', 1), (v_sched_id, v_stop_ids[2], '08:40', 2);

END $$;

COMMIT;
