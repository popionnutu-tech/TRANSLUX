-- 044_suburban_route_lipcani_briceni.sql
-- Rută suburbană Lipcani → Briceni via Grimești/Corjeuți (52 km, 12 stații)
-- marți/joi/duminică: TUR 06:45 Grimești → Briceni 07:45, RETUR 11:30 Briceni → Lipcani 12:45
-- Aplicată în DB prin MCP 2026-04-22; acest fișier e pentru istoric.

BEGIN;

DO $$
DECLARE
  v_route_id INT;
  v_sched_id INT;
  v_lipcani INT; v_sirauti INT; v_slobotca INT; v_pererita INT;
  v_grimesti INT; v_bogdanesti INT; v_bezeda INT; v_tetcani INT;
  v_corjeuti INT; v_caracuseniivechi INT; v_tabani INT; v_briceni INT;
BEGIN

IF EXISTS (SELECT 1 FROM crm_routes WHERE dest_from_ro='Lipcani' AND dest_to_ro='Briceni' AND route_type='suburban') THEN
  RAISE NOTICE 'Route Lipcani → Briceni (suburban) already exists — skipping seed.';
  RETURN;
END IF;

INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru,
  sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Lipcani', 'Briceni', 'Липкань', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Lipcani', 'Липкань', 0, 0, 0, 0, true) RETURNING id INTO v_lipcani;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Sirauti', 'Сирауць', 6, 6, 10, 10, true) RETURNING id INTO v_sirauti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Slobotca Sirauti', 'Слободка Сирауць', 1, 1, 5, 5, true) RETURNING id INTO v_slobotca;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Pererîța', 'Перерыца', 6, 6, 10, 10, true) RETURNING id INTO v_pererita;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Grimești', 'Грымешть', 6, 6, 10, 10, true) RETURNING id INTO v_grimesti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Bogdănești', 'Богданешть', 0, 0, 2, 2, true) RETURNING id INTO v_bogdanesti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Bezeda', 'Безеда', 1, 1, 3, 3, true) RETURNING id INTO v_bezeda;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Tetcani', 'Теткань', 2, 2, 5, 5, true) RETURNING id INTO v_tetcani;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Corjeuți', 'Коржеуць', 8, 8, 12, 12, true) RETURNING id INTO v_corjeuti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Caracușenii Vechi', 'Каракушений Вечь', 9, 9, 15, 15, true) RETURNING id INTO v_caracuseniivechi;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Tabani', 'Табань', 6, 6, 10, 10, true) RETURNING id INTO v_tabani;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Briceni', 'Бричень', 7, 7, 10, 10, true) RETURNING id INTO v_briceni;

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week)
VALUES (v_route_id, 'tur', 1, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_lipcani, '06:05', 1),
  (v_sched_id, v_sirauti, '06:15', 2),
  (v_sched_id, v_slobotca, '06:18', 3),
  (v_sched_id, v_pererita, '06:28', 4),
  (v_sched_id, v_grimesti, '06:45', 5),
  (v_sched_id, v_bogdanesti, '06:47', 6),
  (v_sched_id, v_bezeda, '06:50', 7),
  (v_sched_id, v_tetcani, '06:55', 8),
  (v_sched_id, v_corjeuti, '07:00', 9),
  (v_sched_id, v_caracuseniivechi, '07:15', 10),
  (v_sched_id, v_tabani, '07:25', 11),
  (v_sched_id, v_briceni, '07:45', 12);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week)
VALUES (v_route_id, 'retur', 2, ARRAY[2,4,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_briceni, '11:30', 1),
  (v_sched_id, v_tabani, '11:40', 2),
  (v_sched_id, v_caracuseniivechi, '11:50', 3),
  (v_sched_id, v_corjeuti, '11:55', 4),
  (v_sched_id, v_tetcani, '12:05', 5),
  (v_sched_id, v_bezeda, '12:07', 6),
  (v_sched_id, v_bogdanesti, '12:09', 7),
  (v_sched_id, v_grimesti, '12:15', 8),
  (v_sched_id, v_pererita, '12:22', 9),
  (v_sched_id, v_slobotca, '12:30', 10),
  (v_sched_id, v_sirauti, '12:32', 11),
  (v_sched_id, v_lipcani, '12:45', 12);

END $$;

COMMIT;
