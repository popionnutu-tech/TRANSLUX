-- 110_moneyball_urgent_hybrid.sql
-- Follow-up по ревью 109: привязка «urgent_change» ТОЛЬКО к статзначимости дала 0 срочных —
-- честная усадка (k_driver=50) делает почти ничего не 95%-значимым. Но в данных есть реальные,
-- НЕ шумовые случаи, которые этот строгий порог прячет (напр. Goreaci, Chișinău–Otaci: 51 рейс,
-- стабильно −2.2%, есть водитель на +1.15%, ~3600 lei/мес упущенной выгоды) — base_is_significant=false.
--
-- ГИБРИД (решение владельца): «срочно» = на маршруте есть заметно лучший (разрыв >2 п.) И основной
-- водитель ОПЫТНЫЙ на маршруте (≥10 рейсов — не флук) И (статзначим CI<0 ИЛИ заметно ниже нормы <−1.5%).
-- Усаженный балл сам по себе уже sample-backed (мало рейсов → тянется к 0), поэтому <−1.5% на усаженном
-- = реальная просадка опытного водителя, а не одиночный неудачный рейс. Значимость остаётся доп-знаком честности.
-- Меняется ТОЛЬКО логика status в v_moneyball_recommendations (выходные колонки те же — CREATE OR REPLACE безопасен).

create or replace view v_moneyball_recommendations as
with route_drivers as (
  select drs.crm_route_id,
         (cr.dest_from_ro::text || ' - '::text) || cr.dest_to_ro::text as route_name,
         drs.driver_id, d.full_name as driver_name,
         drs.avg_deviation_pct, drs.n_trips, drs.total_lei_actual, drs.vorp_lei,
         case when drs.n_trips > 0 then round(drs.vorp_lei / drs.n_trips::numeric, 2) else null::numeric end as vorp_per_trip,
         drs.quarter,
         drs.is_significant, drs.ci_low, drs.ci_high
  from analytics_driver_route_scores drs
    join drivers d on d.id = drs.driver_id
    join crm_routes cr on cr.id = drs.crm_route_id
  where drs.n_trips >= 3
), ranked as (
  select route_drivers.crm_route_id, route_drivers.route_name, route_drivers.driver_id, route_drivers.driver_name,
         route_drivers.avg_deviation_pct, route_drivers.n_trips, route_drivers.total_lei_actual, route_drivers.vorp_lei,
         route_drivers.vorp_per_trip, route_drivers.quarter,
         route_drivers.is_significant, route_drivers.ci_low, route_drivers.ci_high,
         row_number() over (partition by route_drivers.crm_route_id, route_drivers.quarter order by route_drivers.n_trips desc, route_drivers.avg_deviation_pct desc) as current_rank,
         row_number() over (partition by route_drivers.crm_route_id, route_drivers.quarter order by route_drivers.avg_deviation_pct desc, route_drivers.n_trips desc) as best_rank,
         count(*) over (partition by route_drivers.crm_route_id, route_drivers.quarter) as n_drivers_on_route
  from route_drivers
), base_info as (
  select ranked.crm_route_id, ranked.quarter, ranked.driver_id as base_driver_id, ranked.driver_name as base_driver_name,
         ranked.avg_deviation_pct as base_score, ranked.n_trips as base_trips, ranked.vorp_per_trip as base_vorp_per_trip,
         ranked.is_significant as base_is_significant
  from ranked where ranked.current_rank = 1
), best_info as (
  select ranked.crm_route_id, ranked.quarter, ranked.driver_id as best_driver_id, ranked.driver_name as best_driver_name,
         ranked.avg_deviation_pct as best_score, ranked.n_trips as best_trips, ranked.vorp_per_trip as best_vorp_per_trip
  from ranked where ranked.best_rank = 1
), backup_info as (
  select r.crm_route_id, r.quarter, r.driver_id as backup_driver_id, r.driver_name as backup_driver_name,
         r.avg_deviation_pct as backup_score, r.n_trips as backup_trips
  from ranked r join best_info bi on bi.crm_route_id = r.crm_route_id and bi.quarter = r.quarter
  where r.driver_id <> bi.best_driver_id and r.best_rank = 2
), drivers_count as (
  select ranked.crm_route_id, ranked.quarter, max(ranked.n_drivers_on_route) as n_drivers_on_route
  from ranked group by ranked.crm_route_id, ranked.quarter
)
select base.crm_route_id,
  (select ranked.route_name from ranked where ranked.crm_route_id = base.crm_route_id and ranked.quarter = base.quarter limit 1) as route_name,
  base.quarter, base.base_driver_id, base.base_driver_name, base.base_score, base.base_trips, base.base_vorp_per_trip,
  best.best_driver_id, best.best_driver_name, best.best_score, best.best_trips, best.best_vorp_per_trip,
  backup.backup_driver_id, backup.backup_driver_name, backup.backup_score, backup.backup_trips,
  dc.n_drivers_on_route,
  base.base_driver_id = best.best_driver_id as base_is_best,
  case
    when base.base_driver_id = best.best_driver_id and base.base_score >= 0::numeric then 'optimal'::text
    -- срочно (гибрид): заметно лучший (>2п.) + основной опытный (≥10 рейсов) + (значим ИЛИ <−1.5%)
    when base.base_driver_id <> best.best_driver_id
         and (best.best_score - base.base_score) > 2::numeric
         and base.base_trips >= 10
         and (base.base_is_significant or base.base_score < (-1.5)::numeric) then 'urgent_change'::text
    -- попробовать: ниже нормы или заметный разрыв с лучшим (порог под усаженный масштаб)
    when base.base_score < 0::numeric then 'try_change'::text
    when base.base_driver_id <> best.best_driver_id and (best.best_score - base.base_score) > 1.5::numeric then 'try_change'::text
    else 'ok_but_watch'::text
  end as status,
  case when base.base_driver_id = best.best_driver_id then 0::numeric
       else round((best.best_vorp_per_trip - base.base_vorp_per_trip) * 20::numeric, 2) end as est_monthly_gain_lei,
  case when base.base_driver_id = best.best_driver_id then 0::numeric
       else round((best.best_vorp_per_trip - base.base_vorp_per_trip) * 20::numeric * 3::numeric, 2) end as est_quarterly_gain_lei
from base_info base
  join best_info best on best.crm_route_id = base.crm_route_id and best.quarter = base.quarter
  left join backup_info backup on backup.crm_route_id = base.crm_route_id and backup.quarter = base.quarter
  left join drivers_count dc on dc.crm_route_id = base.crm_route_id and dc.quarter = base.quarter;
