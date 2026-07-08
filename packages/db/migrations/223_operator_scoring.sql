-- 223_operator_scoring.sql
-- Scoring statistic operatori peron (CHIȘINĂU / BĂLȚI): «cine lucrează mai bine»,
-- corect pe zile comparabile: fereastră ±21 zile (aceeași epocă), factor zi-a-săptămânii,
-- factor meteo (ploaie/caniculă), cu EXCLUDEREA zilelor externe (sărbători MD, vârfuri/prăbușiri
-- anomale = trafic care nu ține de operator, zile cu date incomplete).
-- Model: E_zi = ppt_așteptat(fereastră, dow, meteo) × nr_curse_OK; ratio = real/E;
-- index operator = medie ratio cu shrinkage Empirical-Bayes spre 1.00 (Bühlmann K, ca moneyball_recompute).
-- Rulare: pg_cron 'operator-scoring-nightly' 02:30 UTC (după moneyball-nightly 02:00). Log: analytics_cron_runs.

-- ── 1) Sărbători oficiale MD (± o zi adiacentă se exclude în funcție) ──
create table if not exists holidays_md (
  holiday_date date primary key,
  name text not null
);
insert into holidays_md (holiday_date, name) values
  ('2026-01-01','Anul Nou'),
  ('2026-01-07','Crăciunul (stil vechi)'),
  ('2026-01-08','Crăciunul (stil vechi, a doua zi)'),
  ('2026-03-08','Ziua Internațională a Femeii'),
  ('2026-04-12','Paștele'),
  ('2026-04-13','Paștele (a doua zi)'),
  ('2026-04-20','Paștele Blajinilor'),
  ('2026-05-01','Ziua Muncii'),
  ('2026-05-09','Ziua Victoriei / Ziua Europei'),
  ('2026-06-01','Ziua Copilului'),
  ('2026-08-27','Ziua Independenței'),
  ('2026-08-31','Limba Noastră'),
  ('2026-10-14','Hramul Chișinăului'),
  ('2026-12-25','Crăciunul (stil nou)')
on conflict do nothing;

-- ── 2) Meteo per punct (daily_weather existent = un singur oraș, stale; NU se atinge — v_session_full îl folosește) ──
create table if not exists weather_daily_point (
  point text not null,
  date date not null,
  temp_max numeric(4,1),
  precip_mm numeric(6,1),
  fetched_at timestamptz not null default now(),
  primary key (point, date)
);

-- ── 3) Scorurile pe zile (o zi = un operator per punct; zilele excluse rămân vizibile cu motiv) ──
create table if not exists operator_day_scores (
  point text not null,
  score_date date not null,
  operator_id uuid references users(id),
  actual_pas numeric,
  expected_pas numeric,
  ratio numeric,
  trips_ok int,
  trips_reported int,
  excluded boolean not null default false,
  exclude_reason text,       -- holiday | holiday_adjacent | low_coverage | no_trips | short_window | spike
  wx text,                   -- normal | rain | heavy_rain | heat
  precip_mm numeric,
  temp_max numeric,
  computed_at timestamptz not null default now(),
  primary key (point, score_date)
);
create index if not exists idx_operator_day_scores_op on operator_day_scores(operator_id, score_date);

-- ── 4) Indexurile pe perioade ──
create table if not exists operator_period_scores (
  operator_id uuid not null references users(id),
  point text not null,
  period_key text not null,  -- '28d' | 'quarter' | 'all'
  index_100 numeric,         -- shrunk (principal)
  raw_index numeric,         -- fără shrinkage (transparență)
  n_days int,
  ci_low numeric,
  ci_high numeric,
  significant boolean,
  computed_at timestamptz not null default now(),
  primary key (operator_id, point, period_key)
);

-- RLS deny-all (postura standard: acces doar prin service-role)
alter table holidays_md enable row level security;
alter table weather_daily_point enable row level security;
alter table operator_day_scores enable row level security;
alter table operator_period_scores enable row level security;

-- ── 5) Recompute (idempotent: delete + insert; two-pass pt vârfuri) ──
create or replace function operator_scoring_recompute()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_run_id bigint;
  v_start timestamptz := clock_timestamp();
  v_k numeric;
begin
  insert into analytics_cron_runs (started_at, status) values (v_start, 'running') returning id into v_run_id;

  -- 0) mediană per cursă pt imputarea FULL (=-1, Bălți)
  drop table if exists _osc_trip_med;
  create temp table _osc_trip_med as
  select trip_id, percentile_cont(0.5) within group (order by passengers_count) as med_pas
  from reports
  where cancelled_at is null and status = 'OK' and passengers_count >= 0
  group by trip_id;

  -- 1) rollup pe zi + operatorul zilei (majoritatea rapoartelor)
  drop table if exists _osc_d;
  create temp table _osc_d as
  with rep as (
    select r.point::text as point, r.report_date, r.status,
           case when r.passengers_count = -1 then coalesce(tm.med_pas, 15)
                when r.passengers_count >= 0 then r.passengers_count::numeric
                else null end as pas
    from reports r
    left join _osc_trip_med tm on tm.trip_id = r.trip_id
    where r.cancelled_at is null and r.point::text in ('CHISINAU','BALTI')
  ),
  day_agg as (
    select point, report_date as score_date,
           count(*) filter (where status = 'OK') as trips_ok,
           count(*) as trips_reported,
           coalesce(sum(pas) filter (where status = 'OK'), 0) as actual_pas
    from rep group by point, report_date
  ),
  day_op as (
    select distinct on (point, report_date)
           point::text as point, report_date as score_date, created_by_user as operator_id
    from (select point, report_date, created_by_user, count(*) as n
          from reports
          where cancelled_at is null and point::text in ('CHISINAU','BALTI')
          group by 1,2,3) t
    order by point, report_date, n desc
  )
  select a.point, a.score_date, o.operator_id, a.trips_ok, a.trips_reported, a.actual_pas,
         w.precip_mm, w.temp_max,
         extract(isodow from a.score_date)::int as dow,
         case
           when coalesce(w.precip_mm, 0) >= 5 then 'heavy_rain'
           when coalesce(w.precip_mm, 0) >= 1 then 'rain'
           when coalesce(w.temp_max, -99) >= 33 then 'heat'
           else 'normal'
         end as wx,
         exists (select 1 from holidays_md h where h.holiday_date = a.score_date) as is_holiday,
         exists (select 1 from holidays_md h where h.holiday_date between a.score_date - 1 and a.score_date + 1) as near_holiday,
         (a.actual_pas / nullif(a.trips_ok, 0)) as ppt,
         null::numeric as ppt_adj,
         null::numeric as expected_pas,
         null::numeric as ratio,
         true as is_clean,
         null::text as exclude_reason
  from day_agg a
  join day_op o using (point, score_date)
  left join weather_daily_point w on w.point = a.point and w.date = a.score_date;

  -- 2) acoperire: față de mediana curselor raportate per punct
  drop table if exists _osc_cov;
  create temp table _osc_cov as
  select point, percentile_cont(0.5) within group (order by trips_reported) as med_rep
  from _osc_d group by point;

  update _osc_d d set is_clean = false, exclude_reason =
    case when d.is_holiday then 'holiday'
         when d.near_holiday then 'holiday_adjacent'
         when d.trips_ok = 0 or d.ppt is null then 'no_trips'
         else 'low_coverage' end
  from _osc_cov c
  where c.point = d.point
    and (d.near_holiday or d.trips_ok = 0 or d.ppt is null
         or d.trips_reported < 0.8 * c.med_rep);

  -- 3) factori dow globali per punct (din zilele curate)
  drop table if exists _osc_dowf;
  create temp table _osc_dowf as
  with base as (select point, avg(ppt) as mean_ppt from _osc_d where is_clean group by point)
  select d.point, d.dow, avg(d.ppt) / nullif(b.mean_ppt, 0) as dow_factor
  from _osc_d d join base b using (point)
  where d.is_clean
  group by d.point, d.dow, b.mean_ppt;

  update _osc_d d set ppt_adj = d.ppt / nullif(f.dow_factor, 0)
  from _osc_dowf f where f.point = d.point and f.dow = d.dow;

  -- 4) factori meteo per punct: q = ppt_adj / media normal-wx a ferestrei ±21
  drop table if exists _osc_wxf;
  create temp table _osc_wxf as
  select point, wx, avg(q) as f, count(*) as n
  from (
    select d.point, d.wx,
           d.ppt_adj / nullif((
             select avg(x.ppt_adj) from _osc_d x
             where x.point = d.point and x.is_clean and x.wx = 'normal'
               and x.score_date between d.score_date - 21 and d.score_date + 21
               and x.score_date <> d.score_date
           ), 0) as q
    from _osc_d d
    where d.is_clean and d.wx <> 'normal'
  ) t
  where q is not null
  group by point, wx;

  -- 5) PASS 1: așteptare + ratio (fereastra = zile curate ±21, dow-neutralizate; meteo per zi)
  update _osc_d d set
    expected_pas = sub.expected_pas,
    ratio = sub.ratio,
    exclude_reason = coalesce(d.exclude_reason, case when sub.win_n < 10 then 'short_window' end),
    is_clean = d.is_clean and sub.win_n >= 10
  from (
    select d2.point, d2.score_date,
           win.win_mean * f2.dow_factor * wxc.wf * d2.trips_ok as expected_pas,
           case when win.win_n >= 10 and win.win_mean > 0
                then d2.actual_pas / nullif(win.win_mean * f2.dow_factor * wxc.wf * d2.trips_ok, 0) end as ratio,
           win.win_n
    from _osc_d d2
    join _osc_dowf f2 on f2.point = d2.point and f2.dow = d2.dow
    cross join lateral (
      -- Norma = zilele ALTOR operatori (leave-one-out): «compari un operator cu altul»,
      -- altfel blocurile de lucru (Bălți) comprimă decalajul real. Fereastra ±28 compensează n-ul.
      select avg(x.ppt_adj) as win_mean, count(*) as win_n
      from _osc_d x
      where x.point = d2.point and x.is_clean
        and x.operator_id is distinct from d2.operator_id
        and x.score_date between d2.score_date - 28 and d2.score_date + 28
        and x.score_date <> d2.score_date
    ) win
    cross join lateral (
      select coalesce((select case when xf.n >= 5 then greatest(0.75, least(1.15, xf.f)) else 1 end
                       from _osc_wxf xf where xf.point = d2.point and xf.wx = d2.wx), 1) as wf
    ) wxc
  ) sub
  where sub.point = d.point and sub.score_date = d.score_date;

  -- 6) vârfuri externe (spike): |ratio - med| > 2.5 × 1.4826 × MAD → exclus
  drop table if exists _osc_med;
  create temp table _osc_med as
  select point, percentile_cont(0.5) within group (order by ratio) as med_r
  from _osc_d where is_clean and ratio is not null group by point;

  drop table if exists _osc_mad;
  create temp table _osc_mad as
  select d.point, percentile_cont(0.5) within group (order by abs(d.ratio - m.med_r)) as mad_r
  from _osc_d d join _osc_med m using (point)
  where d.is_clean and d.ratio is not null group by d.point;

  update _osc_d d set is_clean = false, exclude_reason = 'spike'
  from _osc_med m, _osc_mad a
  where m.point = d.point and a.point = d.point
    and d.is_clean and d.ratio is not null and a.mad_r > 0
    and abs(d.ratio - m.med_r) > 2.5 * 1.4826 * a.mad_r;

  -- 7) PASS 2: refacem așteptarea/ratio pe zilele rămase, cu fereastra FĂRĂ spike-uri
  update _osc_d d set
    expected_pas = sub.expected_pas,
    ratio = sub.ratio
  from (
    select d2.point, d2.score_date,
           win.win_mean * f2.dow_factor * wxc.wf * d2.trips_ok as expected_pas,
           case when win.win_n >= 10 and win.win_mean > 0
                then d2.actual_pas / nullif(win.win_mean * f2.dow_factor * wxc.wf * d2.trips_ok, 0) end as ratio
    from _osc_d d2
    join _osc_dowf f2 on f2.point = d2.point and f2.dow = d2.dow
    cross join lateral (
      -- Norma = zilele ALTOR operatori (leave-one-out): «compari un operator cu altul»,
      -- altfel blocurile de lucru (Bălți) comprimă decalajul real. Fereastra ±28 compensează n-ul.
      select avg(x.ppt_adj) as win_mean, count(*) as win_n
      from _osc_d x
      where x.point = d2.point and x.is_clean
        and x.operator_id is distinct from d2.operator_id
        and x.score_date between d2.score_date - 28 and d2.score_date + 28
        and x.score_date <> d2.score_date
    ) win
    cross join lateral (
      select coalesce((select case when xf.n >= 5 then greatest(0.75, least(1.15, xf.f)) else 1 end
                       from _osc_wxf xf where xf.point = d2.point and xf.wx = d2.wx), 1) as wf
    ) wxc
    where d2.is_clean
  ) sub
  where sub.point = d.point and sub.score_date = d.score_date;

  -- 8) scriem zilele
  delete from operator_day_scores;
  insert into operator_day_scores
    (point, score_date, operator_id, actual_pas, expected_pas, ratio, trips_ok, trips_reported,
     excluded, exclude_reason, wx, precip_mm, temp_max)
  select point, score_date, operator_id,
         round(actual_pas::numeric, 1), round(expected_pas::numeric, 1),
         case when is_clean then round(ratio::numeric, 4) end,
         trips_ok, trips_reported,
         not is_clean, exclude_reason, wx, precip_mm, temp_max
  from _osc_d;

  -- 9) indexuri pe perioade cu shrinkage Bühlmann spre 1.00 (pattern moneyball_recompute)
  drop table if exists _osc_grp;
  create temp table _osc_grp as
  select operator_id, point, period_key,
         count(*) as n, avg(ratio) as m, var_samp(ratio) as v, stddev_samp(ratio) as sd
  from (
    select operator_id, point, ratio, score_date from operator_day_scores where not excluded and ratio is not null
  ) s
  cross join lateral (values
    ('28d'::text), ('quarter'::text), ('all'::text)
  ) p(period_key)
  where (p.period_key = 'all')
     or (p.period_key = '28d' and s.score_date >= current_date - 28)
     or (p.period_key = 'quarter' and s.score_date >= date_trunc('quarter', current_date)::date)
  group by operator_id, point, period_key
  having count(*) >= 3;

  -- K FIX (nu derivat): cu doar ~5-6 grupe operator×punct, estimarea Bühlmann EPV/VHM e instabilă
  -- (a oscilat 2↔9 între rulări → indexuri nereproducibile). K=8 = temperare moderată:
  -- un operator nou e tras spre 100 până adună ~2 săptămâni de zile; la n≥40 efectul e minor.
  v_k := 8;

  delete from operator_period_scores;
  insert into operator_period_scores
    (operator_id, point, period_key, index_100, raw_index, n_days, ci_low, ci_high, significant)
  select operator_id, point, period_key,
         round((((n * m + v_k * 1.0) / (n + v_k)) * 100)::numeric, 1) as index_100,
         round((m * 100)::numeric, 1) as raw_index,
         n,
         case when sd is not null and n > 1 then round(((((n * m + v_k * 1.0) / (n + v_k)) - 1.96 * sd / sqrt(n)) * 100)::numeric, 1) end,
         case when sd is not null and n > 1 then round(((((n * m + v_k * 1.0) / (n + v_k)) + 1.96 * sd / sqrt(n)) * 100)::numeric, 1) end,
         case when sd is not null and n >= 10
              then ((((n * m + v_k * 1.0) / (n + v_k)) - 1.96 * sd / sqrt(n)) > 1.0
                 or (((n * m + v_k * 1.0) / (n + v_k)) + 1.96 * sd / sqrt(n)) < 1.0)
              else false end
  from _osc_grp;

  update analytics_cron_runs set
    finished_at = clock_timestamp(), status = 'success',
    duration_seconds = extract(epoch from clock_timestamp() - v_start),
    k_baseline = v_k
  where id = v_run_id;

exception when others then
  update analytics_cron_runs set finished_at = clock_timestamp(), status = 'error', error_message = sqlerrm
  where id = v_run_id;
  raise;
end;
$fn$;

-- ── 6) cron nightly 02:30 UTC (după moneyball-nightly 02:00) ──
do $$
begin
  perform cron.unschedule('operator-scoring-nightly');
exception when others then null;
end $$;
select cron.schedule('operator-scoring-nightly', '30 2 * * *', 'select operator_scoring_recompute()');
