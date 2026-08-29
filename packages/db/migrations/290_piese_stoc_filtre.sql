-- 290: Suport pentru filtrele noi din ecranul „Stoc" (producător / model / locație).
--
-- 1. RPC pentru valorile distincte din dropdown-uri.
--    Varianta naivă (SELECT manufacturer, model ... LIMIT 5000, deduplicat în JS) citea mii de rânduri din
--    `piese_stock_rows` la FIECARE încărcare a paginii, ca să scoată câteva zeci de valori — iar `LIMIT` fără
--    `ORDER BY` tăia arbitrar, deci un producător real putea LIPSI tăcut din listă. DISTINCT în bază
--    întoarce zeci de rânduri și nu poate fi trunchiat.
--    `piese_stock_rows` e un view scump (subinterogări corelate peste jurnalul de mișcări), de aceea
--    filtrăm pe depozit înăuntru, nu după.
create or replace function piese_stock_facets(p_wh bigint default null)
returns table (manufacturer text, model text)
language sql stable
as $$
  select distinct s.manufacturer, s.model
  from piese_stock_rows s
  where s.qty > 0
    and (p_wh is null or s.warehouse_id = p_wh)
    and (s.manufacturer is not null or s.model is not null)
$$;

-- Apărare în adâncime, ca la restul RPC-urilor modulului (vezi migr. 289).
revoke all on function piese_stock_facets(bigint) from public, anon, authenticated;
grant execute on function piese_stock_facets(bigint) to service_role;

-- 2. Index pentru filtrul pe locație („arată-mi ce am pe rândul A-12").
--    Filtrul e un prefix (`location_label LIKE 'A-12%'`), iar într-o colație non-C un index B-tree obișnuit
--    NU poate fi folosit pentru LIKE — de aceea `text_pattern_ops`. Fără el, prefixul forța evaluarea
--    întregului view; cu el, planificatorul poate porni din `piese_part_locations` și reduce setul candidat
--    de la mii de piese la câteva zeci, evitând tocmai subinterogările corelate care domină costul.
create index if not exists idx_ploc_wh_label
  on piese_part_locations (warehouse_id, location_label text_pattern_ops);
