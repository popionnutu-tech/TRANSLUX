-- 107_moneyball_credibility_redesign.sql
-- Moneyball Tier-1 редизайн (deep-research: actuar credibility = empirical-Bayes shrinkage):
--  • Фикс бага: ночной пересчёт падал на рейсе без водителя (driver_id NULL → NOT NULL) → данные заморожены.
--  • Гигиена: исключаем рейсы без водителя и «пустышки» (0 пасс. И 0 лей).
--  • Иерархическая усадка НОРМ: ячейка(6D) → родитель(маршрут,напр,остановка,квартал) → grand, вес n/(n+K_b).
--  • Усадка БАЛЛА водителя к 0 (как ожидалось), вес n/(n+K_d); + доверит. интервал и флаг значимости.
--  • VORP по усаженному баллу, база = средний водитель.
-- K_b, K_d оценены глобально по Bühlmann (within/between, с предохранителями). Точные Poisson/NB и bootstrap-CI — Tier-2.

alter table analytics_driver_route_scores
  add column if not exists shrunk_deviation_pct numeric,
  add column if not exists credibility_z numeric,
  add column if not exists ci_low numeric,
  add column if not exists ci_high numeric,
  add column if not exists is_significant boolean;

alter table analytics_cron_runs
  add column if not exists k_baseline numeric,
  add column if not exists k_driver numeric;

create or replace function public.moneyball_recompute()
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_run_id bigint;
  v_start timestamptz := clock_timestamp();
  v_baselines int; v_trip_scores int; v_segment_scores int; v_route_scores int;
  v_kb numeric; v_kd numeric;
  v_epv numeric; v_vhm numeric; v_gm numeric; v_ntot numeric; v_sumn2 numeric; v_r numeric;
begin
  insert into analytics_cron_runs (started_at, status) values (v_start, 'running') returning id into v_run_id;

  truncate analytics_baselines restart identity;
  truncate analytics_trip_scores restart identity cascade;
  truncate analytics_driver_segment_scores restart identity;
  truncate analytics_driver_route_scores restart identity;

  -- 0) Чистые наблюдения: завершённые, capacity<>1, без «пустышек» (0 лей И 0 пасс.) ──
  create temp table _obs on commit drop as
  select cs.session_id, cs.crm_route_id, cs.driver_id, cs.quarter, cs.day_type, cs.capacity,
         ce.direction, ce.stop_order, ce.total_passengers::numeric as pax
  from (
    select ctx.*, coalesce(ctx.tur_total_lei,0)+coalesce(ctx.retur_total_lei,0) as total_lei
    from v_session_context ctx
    where ctx.status='completed' and ctx.capacity is distinct from 1
  ) cs
  join counting_entries ce on ce.session_id = cs.session_id
  where not (
    cs.total_lei = 0
    and not exists (select 1 from counting_entries x where x.session_id=cs.session_id and x.total_passengers > 0)
  );

  -- 1) НОРМЫ с иерархической усадкой ──
  -- 1a) статистика по ячейке (6D)
  create temp table _cell on commit drop as
  select crm_route_id, direction, stop_order, quarter, day_type, capacity,
         count(distinct session_id) as n, avg(pax) as m, coalesce(var_samp(pax),0) as v
  from _obs group by 1,2,3,4,5,6;

  -- 1b) глобальный Bühlmann K_b (within / between), с предохранителями
  select sum(n*m)/nullif(sum(n),0), sum((n-1)*v)/nullif(sum(n-1),0), sum(n), sum(n*n), count(*)
    into v_gm, v_epv, v_ntot, v_sumn2, v_r from _cell;
  select sum(n*(m - v_gm)^2) into v_vhm from _cell;
  v_vhm := (coalesce(v_vhm,0) - (v_r-1)*coalesce(v_epv,0)) / nullif(v_ntot - v_sumn2/nullif(v_ntot,0), 0);
  v_kb := case when v_vhm is not null and v_vhm > 0 then v_epv/v_vhm else 8 end;
  v_kb := greatest(2, least(50, coalesce(v_kb, 8)));

  -- 1c) родитель (маршрут,напр,остановка,квартал) и grand (маршрут,напр,остановка), усаженные
  create temp table _parent on commit drop as
  select crm_route_id, direction, stop_order, quarter,
         count(distinct session_id) as n, avg(pax) as m
  from _obs group by 1,2,3,4;
  create temp table _grand on commit drop as
  select crm_route_id, direction, stop_order, avg(pax) as m
  from _obs group by 1,2,3;

  insert into analytics_baselines
    (crm_route_id, direction, stop_from_order, quarter, day_type, capacity,
     avg_passengers, stddev_passengers, n_trips)
  select c.crm_route_id, c.direction, c.stop_order, c.quarter, c.day_type, c.capacity,
         round((
           (c.n * c.m
            + v_kb * ((p.n * p.m + v_kb * g.m) / (p.n + v_kb))   -- parent усажен к grand
           ) / (c.n + v_kb)
         )::numeric, 2),
         round(sqrt(c.v)::numeric, 2),
         c.n
  from _cell c
  join _parent p on p.crm_route_id=c.crm_route_id and p.direction=c.direction
                and p.stop_order=c.stop_order and p.quarter=c.quarter
  join _grand g  on g.crm_route_id=c.crm_route_id and g.direction=c.direction and g.stop_order=c.stop_order;
  get diagnostics v_baselines = row_count;

  -- 2) TRIP SCORES — только рейсы с водителем (фикс бага) ──
  insert into analytics_trip_scores
    (session_id, direction, driver_id, crm_route_id, quarter, day_type, capacity,
     overall_deviation_pct, total_actual_pax, total_baseline_pax, segment_details)
  with seg as (
    select o.session_id, o.direction, o.driver_id, o.crm_route_id, o.quarter, o.day_type, o.capacity,
           o.stop_order, o.pax as actual_pax, b.avg_passengers as baseline_pax,
           case when b.avg_passengers > 0 then (o.pax - b.avg_passengers)/b.avg_passengers*100 end as deviation_pct
    from _obs o
    join analytics_baselines b
      on b.crm_route_id=o.crm_route_id and b.direction=o.direction and b.stop_from_order=o.stop_order
     and b.quarter=o.quarter and b.day_type=o.day_type and b.capacity is not distinct from o.capacity
    where o.driver_id is not null
  )
  select session_id, direction, driver_id, crm_route_id, quarter, day_type, capacity,
         round((sum(deviation_pct*baseline_pax)/nullif(sum(baseline_pax),0))::numeric,2),
         sum(actual_pax)::int,
         round(sum(baseline_pax)::numeric,2),
         jsonb_agg(jsonb_build_object('stop',stop_order,'actual',actual_pax,'baseline',baseline_pax,
                   'deviation_pct',round(deviation_pct::numeric,2)) order by stop_order)
  from seg where deviation_pct is not null
  group by session_id, direction, driver_id, crm_route_id, quarter, day_type, capacity;
  get diagnostics v_trip_scores = row_count;

  -- 3) DRIVER × SEGMENT (как было, по segment_details) ──
  insert into analytics_driver_segment_scores
    (driver_id, crm_route_id, direction, stop_from_order, quarter,
     avg_deviation_pct, n_trips, total_actual_pax, total_baseline_pax)
  with ex as (
    select ts.driver_id, ts.crm_route_id, ts.direction, ts.quarter,
           (seg->>'stop')::int as stop_from_order, (seg->>'actual')::int as actual_pax,
           (seg->>'baseline')::numeric as baseline_pax, (seg->>'deviation_pct')::numeric as deviation_pct,
           ts.session_id
    from analytics_trip_scores ts cross join lateral jsonb_array_elements(ts.segment_details) seg
  )
  select driver_id, crm_route_id, direction, stop_from_order, quarter,
         round(avg(deviation_pct)::numeric,2), count(distinct session_id),
         sum(actual_pax)::int, round(sum(baseline_pax)::numeric,2)
  from ex where deviation_pct is not null
  group by driver_id, crm_route_id, direction, stop_from_order, quarter;
  get diagnostics v_segment_scores = row_count;

  -- 4) DRIVER × ROUTE: усадка балла к 0 + CI/значимость + VORP по усаженному ──
  -- 4a) глобальный Bühlmann K_d по отклонениям рейсов, сгруппированным по водителю
  create temp table _drv on commit drop as
  select driver_id, count(*) as n, avg(overall_deviation_pct) as m, coalesce(var_samp(overall_deviation_pct),0) as v
  from analytics_trip_scores group by driver_id;
  select sum(n*m)/nullif(sum(n),0), sum((n-1)*v)/nullif(sum(n-1),0), sum(n), sum(n*n), count(*)
    into v_gm, v_epv, v_ntot, v_sumn2, v_r from _drv;
  select sum(n*(m - v_gm)^2) into v_vhm from _drv;
  v_vhm := (coalesce(v_vhm,0) - (v_r-1)*coalesce(v_epv,0)) / nullif(v_ntot - v_sumn2/nullif(v_ntot,0), 0);
  v_kd := case when v_vhm is not null and v_vhm > 0 then v_epv/v_vhm else 6 end;
  v_kd := greatest(2, least(50, coalesce(v_kd, 6)));

  insert into analytics_driver_route_scores
    (driver_id, crm_route_id, quarter, avg_deviation_pct, n_trips, total_lei_actual, vorp_lei,
     shrunk_deviation_pct, credibility_z, ci_low, ci_high, is_significant)
  with agg as (
    select ts.driver_id, ts.crm_route_id, ts.quarter,
           avg(ts.overall_deviation_pct) as d_raw,
           count(distinct ts.session_id) as n,
           stddev_samp(ts.overall_deviation_pct) as sd,
           avg(ts.total_baseline_pax) as base_pax,
           coalesce(sum(cs.tur_total_lei + coalesce(cs.retur_total_lei,0))::int,0) as lei,
           coalesce(max(rp.avg_lei_per_pax),100) as lei_pax
    from analytics_trip_scores ts
    left join counting_sessions cs on cs.id = ts.session_id
    left join v_route_avg_price rp on rp.crm_route_id = ts.crm_route_id
    group by ts.driver_id, ts.crm_route_id, ts.quarter
  ),
  scored as (
    select *, (n::numeric/(n+v_kd)) as z,
           (n::numeric/(n+v_kd))*d_raw as shrunk,
           case when n>=2 and sd is not null then (n::numeric/(n+v_kd))*sd/sqrt(n) else null end as se
    from agg
  )
  select driver_id, crm_route_id, quarter,
         round(d_raw::numeric,2), n, lei,
         round((shrunk/100.0*base_pax*n*lei_pax)::numeric,2),
         round(shrunk::numeric,2), round(z::numeric,3),
         case when se is not null then round((shrunk-1.96*se)::numeric,2) end,
         case when se is not null then round((shrunk+1.96*se)::numeric,2) end,
         case when se is not null then ((shrunk-1.96*se) > 0 or (shrunk+1.96*se) < 0) else false end
  from scored;
  get diagnostics v_route_scores = row_count;

  update analytics_cron_runs set
    finished_at=clock_timestamp(), status='success',
    n_baselines=v_baselines, n_trip_scores=v_trip_scores,
    n_driver_segment_scores=v_segment_scores, n_driver_route_scores=v_route_scores,
    k_baseline=v_kb, k_driver=v_kd,
    duration_seconds=extract(epoch from (clock_timestamp()-v_start))
  where id=v_run_id;

exception when others then
  update analytics_cron_runs set finished_at=clock_timestamp(), status='error',
    error_message=sqlerrm, duration_seconds=extract(epoch from (clock_timestamp()-v_start))
  where id=v_run_id;
  raise;
end;
$function$;

-- Вью отдают на дашборд УСАЖЕННЫЙ балл (как avg_deviation_pct) + значимость; raw сохранён отдельно.
-- CREATE OR REPLACE requires the original columns to keep their name/type/order;
-- so cast avg_deviation_pct back to numeric(6,2) and append the new columns at the END.
create or replace view v_moneyball_ranking as
select drs.driver_id, d.full_name as driver_name, drs.crm_route_id,
       cr.dest_from_ro, cr.dest_to_ro,
       (cr.dest_from_ro::text || ' - '::text) || cr.dest_to_ro::text as route_name,
       drs.quarter,
       coalesce(drs.shrunk_deviation_pct, drs.avg_deviation_pct)::numeric(6,2) as avg_deviation_pct,
       drs.n_trips, drs.total_lei_actual, drs.vorp_lei, drs.computed_at,
       drs.avg_deviation_pct as raw_deviation_pct,
       drs.is_significant, drs.ci_low, drs.ci_high, drs.credibility_z
from analytics_driver_route_scores drs
left join drivers d on d.id=drs.driver_id
left join crm_routes cr on cr.id=drs.crm_route_id;

create or replace view v_moneyball_driver_totals as
select drs.driver_id, d.full_name as driver_name, drs.quarter,
       sum(drs.n_trips)::integer as total_trips,
       sum(drs.total_lei_actual)::integer as total_lei,
       round(sum(drs.vorp_lei),2) as vorp_total,
       round(sum(coalesce(drs.shrunk_deviation_pct,drs.avg_deviation_pct)*drs.n_trips::numeric)
             / nullif(sum(drs.n_trips),0)::numeric, 2) as weighted_avg_deviation_pct,
       count(distinct drs.crm_route_id)::integer as n_routes
from analytics_driver_route_scores drs
left join drivers d on d.id=drs.driver_id
group by drs.driver_id, d.full_name, drs.quarter;
