-- Направление НЕ-LDE водителей/машин: 'interurban' | 'suburban' | NULL.
-- LDE/узинские (is_lde=true, миграция 214) — direction остаётся NULL: узина живёт в lde_driver_extras,
-- НЕ дублируем (единый источник истины = is_lde + LDE). Бот-выбор оператора фильтрует НЕ-LDE.
-- Зависит ТОЛЬКО от drivers/vehicles.is_lde — НЕ читает LDE-таблицы (replay-safe; номер 216 > 214).
alter table public.drivers  add column if not exists direction text;
alter table public.vehicles add column if not exists direction text;

-- не-LDE → interurban (по истории: отчёты / график / interurban-пересчёт)
update public.drivers d set direction = 'interurban'
  where d.is_lde = false and d.direction is null and (
    exists (select 1 from public.reports r where r.driver_id = d.id)
    or exists (select 1 from public.daily_assignments a where a.driver_id = d.id)
    or exists (select 1 from public.counting_sessions cs join public.crm_routes cr on cr.id = cs.crm_route_id
               where cs.driver_id = d.id and cr.route_type = 'interurban'));
update public.vehicles v set direction = 'interurban'
  where v.is_lde = false and v.direction is null and (
    exists (select 1 from public.reports r where r.vehicle_id = v.id)
    or exists (select 1 from public.counting_sessions cs join public.crm_routes cr on cr.id = cs.crm_route_id
               where cs.vehicle_id = v.id and cr.route_type = 'interurban'));

-- не-LDE → suburban (по пригородному пересчёту)
update public.drivers d set direction = 'suburban'
  where d.is_lde = false and d.direction is null and exists (
    select 1 from public.counting_sessions cs join public.crm_routes cr on cr.id = cs.crm_route_id
    where cs.driver_id = d.id and cr.route_type = 'suburban');
update public.vehicles v set direction = 'suburban'
  where v.is_lde = false and v.direction is null and exists (
    select 1 from public.counting_sessions cs join public.crm_routes cr on cr.id = cs.crm_route_id
    where cs.vehicle_id = v.id and cr.route_type = 'suburban');
