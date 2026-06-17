-- 102_allow_retur_done_status.sql
-- Разрешить статус 'retur_done' (оператор/админ сохраняет ОБРАТНЫЙ рейс раньше прямого).
--
-- Баг: saveDirection / saveAuditDirection пишут status='retur_done', когда retur
-- сохранён первым, но CHECK-ограничения допускали только new/tur_done/completed —
-- UPDATE падал. В saveDirection ошибка проглатывалась → retur_total_lei молча
-- терялась (курса выглядела 'completed' только с суммой тура; деталь же
-- пересчитывала retur заново и показывала полную сумму — отсюда расхождение).
--
-- Это выравнивает БД с уже существующей машиной состояний приложения
-- (NumarareClient рендерит бейдж 'retur_done'). Существующие данные содержат
-- только new/tur_done/completed, поэтому добавление значения безопасно.
alter table counting_sessions drop constraint if exists counting_sessions_status_check;
alter table counting_sessions add constraint counting_sessions_status_check
  check (status in ('new', 'tur_done', 'retur_done', 'completed'));

alter table counting_sessions drop constraint if exists counting_sessions_audit_status_check;
alter table counting_sessions add constraint counting_sessions_audit_status_check
  check (audit_status in ('new', 'tur_done', 'retur_done', 'completed'));
