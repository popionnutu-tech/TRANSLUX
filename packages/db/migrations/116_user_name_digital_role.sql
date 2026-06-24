-- 116_user_name_digital_role.sql
-- Имена членов команды + роль DIGITAL (исполнитель задач, без доступа к рейсам/админке).
-- name — отображаемое имя оператора (в выборе исполнителя задач и в экране «Echipa»).
-- DIGITAL — роль для людей, которые ТОЛЬКО получают/выполняют задачи в задачнике (как Vlad),
--   не контролёры рейсов (бот-фичи рейсов гейтятся на CONTROLLER, поэтому DIGITAL их не получает).

alter type user_role add value if not exists 'DIGITAL';
alter table public.users add column if not exists name text;
