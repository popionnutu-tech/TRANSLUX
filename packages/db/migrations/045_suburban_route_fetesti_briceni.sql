-- 045_suburban_route_fetesti_briceni.sql
-- Rută suburbană Fetești → Briceni via Tetcani/Beleavinți (61 km, 13 stații)
-- Zilnic cu excepția sâmbetei: TUR 07:20 Fetești → Briceni 08:45, RETUR 10:00 Briceni → Fetești 11:00
-- Aplicată în DB prin MCP 2026-04-22; acest fișier e pentru istoric.

BEGIN;

DO $$
DECLARE
  v_route_id INT;
  v_sched_id INT;
  v_fetesti INT; v_bogdanesti INT; v_bezeda INT; v_tetcani INT;
  v_pererita INT; v_slobotca INT; v_sirauti INT; v_lipcani INT;
  v_hlina INT; v_beleavinti INT; v_berlinet INT; v_caracuseniinoi INT; v_briceni INT;
BEGIN

IF EXISTS (SELECT 1 FROM crm_routes WHERE dest_from_ro='Fetești' AND dest_to_ro='Briceni' AND route_type='suburban') THEN
  RAISE NOTICE 'Route Fetești → Briceni (suburban) already exists — skipping seed.';
  RETURN;
END IF;

INSERT INTO crm_routes (dest_from_ro, dest_to_ro, dest_from_ru, dest_to_ru,
  sunday_nord, sunday_chisinau, active, route_type)
VALUES ('Fetești', 'Briceni', 'Фетешть', 'Бричень', true, true, true, 'suburban')
RETURNING id INTO v_route_id;

INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Fetești', 'Фетешть', 0, 0, 0, 0, true) RETURNING id INTO v_fetesti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Bogdănești', 'Богданешть', 5.2, 5.2, 3, 3, true) RETURNING id INTO v_bogdanesti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Bezeda', 'Безеда', 2.1, 2.1, 2, 2, true) RETURNING id INTO v_bezeda;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Tetcani', 'Теткань', 4.3, 4.3, 3, 3, true) RETURNING id INTO v_tetcani;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Pererîța', 'Перерыца', 6.2, 6.2, 2, 2, true) RETURNING id INTO v_pererita;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Slobotca Sirauti', 'Слободка Сирауць', 6.5, 6.5, 12, 12, true) RETURNING id INTO v_slobotca;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Sirauti', 'Сирауць', 4.6, 4.6, 6, 6, true) RETURNING id INTO v_sirauti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Lipcani', 'Липкань', 5.9, 5.9, 12, 12, true) RETURNING id INTO v_lipcani;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Hlina', 'Хлина', 5.4, 5.4, 10, 10, true) RETURNING id INTO v_hlina;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Beleavinți', 'Бельевинцы', 5.6, 5.6, 10, 10, true) RETURNING id INTO v_beleavinti;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Berlinet', 'Берлинец', 1.2, 1.2, 2, 2, true) RETURNING id INTO v_berlinet;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Caracușenii Noi', 'Каракушений Ной', 6.6, 6.6, 13, 13, true) RETURNING id INTO v_caracuseniinoi;
INSERT INTO crm_stop_prices (crm_route_id, name_ro, name_ru, km_from_nord, km_from_chisinau, time_from_nord, time_from_chisinau, is_visible)
VALUES (v_route_id, 'Briceni', 'Бричень', 7.4, 7.4, 10, 10, true) RETURNING id INTO v_briceni;

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week)
VALUES (v_route_id, 'tur', 1, ARRAY[1,2,3,4,5,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_fetesti, '07:20', 1),
  (v_sched_id, v_bogdanesti, '07:23', 2),
  (v_sched_id, v_bezeda, '07:25', 3),
  (v_sched_id, v_tetcani, '07:28', 4),
  (v_sched_id, v_pererita, '07:30', 5),
  (v_sched_id, v_slobotca, '07:42', 6),
  (v_sched_id, v_sirauti, '07:48', 7),
  (v_sched_id, v_lipcani, '08:00', 8),
  (v_sched_id, v_hlina, '08:10', 9),
  (v_sched_id, v_beleavinti, '08:20', 10),
  (v_sched_id, v_berlinet, '08:22', 11),
  (v_sched_id, v_caracuseniinoi, '08:35', 12),
  (v_sched_id, v_briceni, '08:45', 13);

INSERT INTO crm_route_schedules (route_id, direction, sequence_no, days_of_week)
VALUES (v_route_id, 'retur', 2, ARRAY[1,2,3,4,5,7]::SMALLINT[]) RETURNING id INTO v_sched_id;
INSERT INTO crm_route_schedule_stops (schedule_id, stop_id, stop_time, stop_order) VALUES
  (v_sched_id, v_briceni, '10:00', 1),
  (v_sched_id, v_caracuseniinoi, '10:10', 2),
  (v_sched_id, v_berlinet, '10:18', 3),
  (v_sched_id, v_beleavinti, '10:20', 4),
  (v_sched_id, v_hlina, '10:25', 5),
  (v_sched_id, v_lipcani, '10:30', 6),
  (v_sched_id, v_sirauti, '10:35', 7),
  (v_sched_id, v_slobotca, '10:40', 8),
  (v_sched_id, v_pererita, '10:45', 9),
  (v_sched_id, v_tetcani, '10:50', 10),
  (v_sched_id, v_bezeda, '10:52', 11),
  (v_sched_id, v_bogdanesti, '10:55', 12),
  (v_sched_id, v_fetesti, '11:00', 13);

END $$;

COMMIT;
