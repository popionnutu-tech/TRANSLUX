-- Множественные направления у водителей/машин: directions text[] (заменяет одиночный direction из 216).
-- Значения: 'interurban' | 'suburban' | <lde_uzine.id> (5 узин). Авто/водитель может стоять на 2+ направлениях.
-- is_lde (флаг владельца) НЕ трогаем — это отдельный coarse-флаг LDE/не-LDE для 16 потребителей.
-- Бот-выбор фильтрует directions @> {interurban}. Зависит от LDE-таблиц (203/204) → номер 217 > 204.
alter table public.drivers  add column if not exists directions text[] not null default '{}';
alter table public.vehicles add column if not exists directions text[] not null default '{}';

-- 1) не-LDE: из одиночного direction (interurban/suburban)
update public.drivers  set directions = array[direction] where direction is not null and array_length(directions,1) is null;
update public.vehicles set directions = array[direction] where direction is not null and array_length(directions,1) is null;

-- 2) LDE-водители: узина из lde_driver_extras
update public.drivers d set directions = array[e.uzina_id]
  from public.lde_driver_extras e
  where e.driver_id = d.id and e.uzina_id is not null and array_length(d.directions,1) is null;

-- 3) LDE-машины: узины из узинских маршрутов (мульти — distinct по машине)
update public.vehicles v set directions = sub.uzine
  from (
    select frv.vehicle_id, array_agg(distinct fr.uzina_id) as uzine
    from public.lde_factory_route_vehicles frv
    join public.lde_factory_route_shifts frs on frs.id = frv.route_shift_id
    join public.lde_factory_routes fr on fr.id = frs.route_id
    group by frv.vehicle_id
  ) sub
  where sub.vehicle_id = v.id and array_length(v.directions,1) is null;

-- одиночный direction больше не нужен — directions единый источник
alter table public.drivers  drop column if exists direction;
alter table public.vehicles drop column if exists direction;
