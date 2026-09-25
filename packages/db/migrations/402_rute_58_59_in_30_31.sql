-- 402 (în Supabase aplicată sub numele 399_rute_58_59_in_30_31, înainte să apară 399_lde_floresti în repo): rutele interurbane 58 → 30 și 59 → 31 (Ion, 25.09.2026: «numerotarea trebuie să fie de la 1 la 31 în rute»;
-- confirmat: «da, schimbă id-urile 58 → 30 și 59 → 31»). Aplicată prin Supabase MCP pe 25.09.2026 (ION-55).
-- Id-ul e cheie în 25 de tabele cu FK NO ACTION, deci: rând nou copiat cu toate coloanele, mutarea fiecărei legături,
-- ștergerea rândului vechi, apoi verificare că n-a rămas nimic pe 58/59. Id 4 rămâne liber (nu există rută 4).
-- Inventar (25.09): analytics_baselines 1260/1152, analytics_driver_segment_scores 635/560, route_stop_passes 1106/351,
-- analytics_trip_scores 230/228, daily_assignments 118/118 (+1 retur), counting_sessions 116/116, lde_atribuiri_zilnice 78/78,
-- driver_cashin_receipts 51/51, crm_stop_fares 42/36, analytics_driver_route_scores 8/8, trips 2/2, route_cancellations 0/1,
-- analytics_route_groups.route_ids 1/1, interurban_v2_routes 1/1, route_shapes 1/1, tomberon_route_map 1/1. Fără triggere pe crm_routes.
begin;

insert into crm_routes select (jsonb_populate_record(null::crm_routes, to_jsonb(r) || '{"id": 30}'::jsonb)).* from crm_routes r where r.id = 58;
insert into crm_routes select (jsonb_populate_record(null::crm_routes, to_jsonb(r) || '{"id": 31}'::jsonb)).* from crm_routes r where r.id = 59;

update analytics_baselines set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update analytics_driver_route_scores set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update analytics_driver_segment_scores set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update analytics_route_groups set route_ids = array_replace(array_replace(route_ids, 58, 30), 59, 31) where 58 = any(route_ids) or 59 = any(route_ids);
update analytics_trip_scores set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update casier_manual_rows set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update counting_sessions set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update crm_daily_log set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update crm_route_links set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update crm_route_schedules set route_id = case route_id when 58 then 30 when 59 then 31 end where route_id in (58, 59);
update crm_routes set retur_uses_route_id = case retur_uses_route_id when 58 then 30 when 59 then 31 end where retur_uses_route_id in (58, 59);
update crm_stop_fares set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update crm_stop_prices set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update daily_assignments set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update daily_assignments set retur_route_id = case retur_route_id when 58 then 30 when 59 then 31 end where retur_route_id in (58, 59);
update driver_cashin_receipts set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update foaie_route_overrides set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update interurban_v2_routes set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update lde_atribuiri_zilnice set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_baselines set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_cancellations set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_check_submissions set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_check_submissions set proposed_retur_uses_route_id = case proposed_retur_uses_route_id when 58 then 30 when 59 then 31 end where proposed_retur_uses_route_id in (58, 59);
update route_retur_defaults set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_retur_defaults set retur_route_id = case retur_route_id when 58 then 30 when 59 then 31 end where retur_route_id in (58, 59);
update route_shapes set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update route_stop_passes set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update tomberon_route_map set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);
update trips set crm_route_id = case crm_route_id when 58 then 30 when 59 then 31 end where crm_route_id in (58, 59);

delete from crm_routes where id in (58, 59);

-- verificare: nicio coloană întreagă cu «route_id» în nume nu mai ține 58 sau 59
do $$
declare r record; n bigint; probleme text := '';
begin
  for r in select c.table_name, c.column_name from information_schema.columns c join information_schema.tables t
             on t.table_name = c.table_name and t.table_schema = c.table_schema
           where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type in ('integer', 'smallint')
             and (c.column_name ilike '%route_id%') loop
    execute format('select count(*) from %I where %I in (58, 59)', r.table_name, r.column_name) into n;
    if n > 0 then probleme := probleme || format(' %s.%s=%s', r.table_name, r.column_name, n); end if;
  end loop;
  select count(*) into n from analytics_route_groups where 58 = any(route_ids) or 59 = any(route_ids);
  if n > 0 then probleme := probleme || format(' analytics_route_groups.route_ids=%s', n); end if;
  if probleme <> '' then raise exception 'au rămas referințe la 58/59:%', probleme; end if;
  if (select count(*) from crm_routes where id in (30, 31)) <> 2 then raise exception 'rutele 30/31 nu sunt amândouă'; end if;
end $$;

commit;
