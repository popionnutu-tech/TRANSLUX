-- 111_merge_duplicate_drivers.sql
-- Дедуп водителей (подтверждено владельцем 19.06.2026): 14 ФИО были заведены повторно (перерегистрация
-- в середине мая) → один человек жил под 2–3 driver_id, что путало Moneyball (напр. Crestianov на
-- Fetești–Briceni раздваивался на base+best → «заменить X на X»; полировало ranking/VORP везде).
--
-- Канонический id = АКТИВНАЯ запись (у каждого дубль-имени ровно одна active=true, проверено).
-- Все НЕ-канонические (active=false) дубли: их FK-ссылки перепривязываются на канонический, затем дубли удаляются.
-- Затрагиваемые FK (проверено information_schema): counting_sessions(65), reports(20), daily_assignments(78),
-- driver_cashin_receipts(56) — остальные 5 FK 0 строк. Коллизий уник-ключей нет: daily_assignments uniq=(route,date)
-- не зависит от driver_id; driver_cashin_receipts uniq=(driver_id,ziua) — 0 пересечений дубль↔канон по дням (проверено).
-- Транзакционно: при любой нарушенной ссылке/констрейнте всё откатывается.

create temp table _drv_merge on commit drop as
with canon as (
  select full_name, id as canonical_id
  from drivers
  where active = true
    and full_name in (select full_name from drivers group by full_name having count(*) > 1)
)
select d.id as dupe_id, c.canonical_id
from drivers d
join canon c on c.full_name = d.full_name
where d.active = false;

-- перепривязка всех 9 FK-ссылок (нулевые — безвредны, для полноты/устойчивости)
update reports                    x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update daily_assignments          x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update counting_sessions          x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update ct_chestionare             x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update ct_operator_log            x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update counting_entries           x set alt_driver_id = m.canonical_id from _drv_merge m where x.alt_driver_id = m.dupe_id;
update counting_audit_entries     x set alt_driver_id = m.canonical_id from _drv_merge m where x.alt_driver_id = m.dupe_id;
update driver_cashin_receipts     x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;
update tomberon_payment_overrides x set driver_id     = m.canonical_id from _drv_merge m where x.driver_id     = m.dupe_id;

-- удалить осиротевшие дубли (17 строк)
delete from drivers d using _drv_merge m where d.id = m.dupe_id;
