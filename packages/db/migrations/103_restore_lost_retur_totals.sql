-- 103_restore_lost_retur_totals.sql
-- Восстановить суммы обратных рейсов, потерянные из-за бага в миграции 102
-- (проглоченная ошибка CHECK при status='retur_done'). Затронуто ровно 3
-- межгородские курсы: у каждой есть полные записи остановок retur, но
-- retur_total_lei = NULL при status='completed'.
--
-- Значения пересчитаны district-aware формулой приложения (calculation.ts):
-- rate_interurban_long = 1.04, rate_suburban = 1.14 на тронсонах внутри
-- start_district='briceni'; тариф периода 2026-06-05…09-30.
-- Валидация: 57/57 здоровых направлений 2026-06-11 (без «коротких») пересчитаны
-- бит-в-бит; retur маршрута 19 сошёлся в 5272 — ровно как показывала деталь курсы.
-- retur_single_lei = retur_total_lei (нет «коротких» → single == dual).
--
-- Guard `retur_total_lei is null` делает миграцию идемпотентной.
update counting_sessions set retur_total_lei = 5272, retur_single_lei = 5272
  where id = 'f1c2757d-60ea-4efe-be94-fec3e5bcc4e5' and retur_total_lei is null; -- 11.06 Chișinău–Lipcani (тур 4331 → итого 9603)
update counting_sessions set retur_total_lei = 4136, retur_single_lei = 4136
  where id = 'cc181b4e-2a57-4ae7-ad57-d3de39199e22' and retur_total_lei is null; -- 10.06 Chișinău–Criva  (тур 0 → итого 4136)
update counting_sessions set retur_total_lei = 1169, retur_single_lei = 1169
  where id = '0cde8a6c-f7d4-4841-b2d0-ae42bb264ea9' and retur_total_lei is null; -- 07.06 Chișinău–Corjeuți (тур 3031 → итого 4200)
