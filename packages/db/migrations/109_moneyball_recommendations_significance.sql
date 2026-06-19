-- 109_moneyball_recommendations_significance.sql
-- Follow-up по ревью 108: после унификации на УСАЖЕННЫЙ балл порог «urgent_change» в рекомендациях
-- (был зашит под СЫРОЙ масштаб: base<-3 И разрыв>5) стал недостижим — усаженные числа маленькие (макс ±5.5%).
-- ФИКС: «срочно» завязываем на СТАТЗНАЧИМОСТЬ (которую уже считаем в 108): водитель «срочно под замену»,
--   если его доверительный интервал целиком ниже 0 (is_significant И базовый балл<0, т.е. ≥5 рейсов + CI не включает 0)
--   И на маршруте есть заметно лучший. Пороги «попробовать» тоже приведены к усаженному масштабу (3 → 1.5).
-- Заодно три вью Moneyball (recommendations / group_recommendations / segments) заносятся в репозиторий —
--   раньше они жили ТОЛЬКО в живой БД (тех-долг: при пересоздании БД с нуля их бы не было).
-- Выходные колонки v_moneyball_recommendations НЕ меняются (CREATE OR REPLACE безопасен) — меняется только логика status.

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
    -- срочно: база статистически ниже среднего (≥5 рейсов, CI целиком <0) и есть заметно лучший
    when base.base_is_significant and base.base_score < 0::numeric
         and base.base_driver_id <> best.best_driver_id
         and (best.best_score - base.base_score) > 1.5 then 'urgent_change'::text
    -- попробовать: база ниже нормы, либо заметный разрыв с лучшим (порог под усаженный масштаб)
    when base.base_score < 0::numeric then 'try_change'::text
    when base.base_driver_id <> best.best_driver_id and (best.best_score - base.base_score) > 1.5 then 'try_change'::text
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

-- Ниже — занос в репозиторий БЕЗ изменений (точные текущие определения из живой БД), для версионирования.
create or replace view v_moneyball_group_recommendations as
 WITH group_driver_scores AS (
         SELECT g_1.id AS group_id, g_1.quarter, g_1.group_type, g_1.label, g_1.shift, g_1.route_ids,
            g_1.n_routes, g_1.required_base_drivers, g_1.required_backup_drivers, g_1.display_order,
            drs.driver_id, d.full_name AS driver_name,
            sum(drs.n_trips) AS total_trips,
            round(sum(drs.avg_deviation_pct * drs.n_trips::numeric) / NULLIF(sum(drs.n_trips), 0)::numeric, 2) AS combined_score,
            round(sum(drs.vorp_lei), 2) AS combined_vorp,
            count(DISTINCT drs.crm_route_id) AS routes_covered
           FROM analytics_route_groups g_1
             JOIN analytics_driver_route_scores drs ON drs.quarter = g_1.quarter AND (drs.crm_route_id = ANY (g_1.route_ids))
             JOIN drivers d ON d.id = drs.driver_id
          WHERE drs.n_trips >= 2
          GROUP BY g_1.id, g_1.quarter, g_1.group_type, g_1.label, g_1.shift, g_1.route_ids, g_1.n_routes, g_1.required_base_drivers, g_1.required_backup_drivers, g_1.display_order, drs.driver_id, d.full_name
        ), ranked AS (
         SELECT group_driver_scores.group_id, group_driver_scores.quarter, group_driver_scores.group_type,
            group_driver_scores.label, group_driver_scores.shift, group_driver_scores.route_ids, group_driver_scores.n_routes,
            group_driver_scores.required_base_drivers, group_driver_scores.required_backup_drivers, group_driver_scores.display_order,
            group_driver_scores.driver_id, group_driver_scores.driver_name, group_driver_scores.total_trips,
            group_driver_scores.combined_score, group_driver_scores.combined_vorp, group_driver_scores.routes_covered,
            row_number() OVER (PARTITION BY group_driver_scores.group_id ORDER BY group_driver_scores.total_trips DESC, group_driver_scores.combined_score DESC) AS rn_current,
            row_number() OVER (PARTITION BY group_driver_scores.group_id ORDER BY group_driver_scores.combined_score DESC, group_driver_scores.total_trips DESC) AS rn_best
           FROM group_driver_scores
        ), current_team AS (
         SELECT r.group_id,
            jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', r.driver_name, 'score', r.combined_score, 'trips', r.total_trips, 'routes_covered', r.routes_covered) ORDER BY r.rn_current) AS drivers,
            avg(r.combined_score) AS avg_score
           FROM ranked r
          WHERE r.rn_current <= (r.required_base_drivers + r.required_backup_drivers)
          GROUP BY r.group_id
        ), best_team AS (
         SELECT r.group_id,
            jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', r.driver_name, 'score', r.combined_score, 'trips', r.total_trips, 'routes_covered', r.routes_covered) ORDER BY r.rn_best) AS drivers,
            avg(r.combined_score) AS avg_score
           FROM ranked r
          WHERE r.rn_best <= (r.required_base_drivers + r.required_backup_drivers) AND r.total_trips >= 3
          GROUP BY r.group_id
        ), overlap AS (
         SELECT c_1.group_id, count(DISTINCT c_1.driver_id) AS n_overlap
           FROM ranked c_1
             JOIN ranked b_1 ON c_1.driver_id = b_1.driver_id AND c_1.group_id = b_1.group_id
          WHERE c_1.rn_current <= (c_1.required_base_drivers + c_1.required_backup_drivers) AND b_1.rn_best <= (b_1.required_base_drivers + b_1.required_backup_drivers)
          GROUP BY c_1.group_id
        )
 SELECT g.id AS group_id, g.quarter, g.group_type, g.label, g.shift, g.route_ids, g.n_routes,
    g.required_base_drivers, g.required_backup_drivers,
    g.required_base_drivers + g.required_backup_drivers AS required_total_drivers, g.display_order,
    ( SELECT jsonb_agg(jsonb_build_object('id', cr.id, 'name', (cr.dest_from_ro::text || ' → '::text) || cr.dest_to_ro::text, 'time_chis', cr.time_chisinau, 'time_nord', cr.time_nord) ORDER BY pos.ord) AS jsonb_agg
           FROM unnest(g.route_ids) WITH ORDINALITY pos(route_id, ord)
             JOIN crm_routes cr ON cr.id = pos.route_id) AS routes,
    c.drivers AS current_drivers, b.drivers AS recommended_drivers,
    COALESCE(o.n_overlap, 0::bigint) AS n_overlap,
        CASE
            WHEN b.drivers IS NULL THEN 'insufficient_data'::text
            WHEN COALESCE(o.n_overlap, 0::bigint) >= (g.required_base_drivers + g.required_backup_drivers) THEN 'optimal'::text
            WHEN COALESCE(o.n_overlap, 0::bigint) >= g.required_base_drivers THEN 'minor_rotation'::text
            ELSE 'major_rotation'::text
        END AS status,
    round(GREATEST((COALESCE(b.avg_score, 0::numeric) - COALESCE(c.avg_score, 0::numeric)) / 100.0 * (g.n_routes * 30)::numeric * 12::numeric * 100::numeric, 0::numeric), 2) AS est_monthly_gain_lei
   FROM analytics_route_groups g
     LEFT JOIN current_team c ON c.group_id = g.id
     LEFT JOIN best_team b ON b.group_id = g.id
     LEFT JOIN overlap o ON o.group_id = g.id;

create or replace view v_moneyball_segments as
 SELECT dss.driver_id, d.full_name AS driver_name, dss.crm_route_id, dss.direction, dss.stop_from_order,
    ( SELECT ce.stop_name_ro
           FROM counting_entries ce
             JOIN counting_sessions cs ON cs.id = ce.session_id
          WHERE cs.crm_route_id = dss.crm_route_id AND ce.direction::text = dss.direction AND ce.stop_order = dss.stop_from_order
         LIMIT 1) AS stop_name,
    dss.quarter, dss.avg_deviation_pct, dss.n_trips, dss.total_actual_pax, dss.total_baseline_pax
   FROM analytics_driver_segment_scores dss
     LEFT JOIN drivers d ON d.id = dss.driver_id;
