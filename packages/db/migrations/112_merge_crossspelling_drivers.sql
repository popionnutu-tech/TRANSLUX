-- 112_merge_crossspelling_drivers.sql
-- Второй проход дедупа (подтверждено владельцем): дубли с РАЗНЫМ написанием, которые точный merge (111) не поймал.
--   Lavric Valerii (рус) → Lavric Valeriu (молд, активный)
--   Goncear R I + Goncear Roma Ivan → Goncear Roman (активный)
-- (Goncear Vladimir и Podlesnii Victor/Vladimir — РАЗНЫЕ люди, не трогаем.)
-- Маппинг задан явными парами имён (написание разное, поэтому не по равенству full_name).
--
-- Особый случай (решение владельца «сохранить все чеки»): у Goncear в 4 дня по 2 кассовых чека (под обеими
-- учётками, разные receipt_nr) — это 2 реальные кассы/день. Уник driver_cashin_receipts(driver_id, ziua) не
-- даёт уместить 2/день под одним id, поэтому 4 конфликтных чека ОСТАЮТСЯ на «Goncear R I» (запись не удаляется
-- ради них; в аналитике она не видна — 0 рейсов). Остальные ссылки перепривязываются, пустые дубли удаляются.

create temp table _xmerge on commit drop as
select dupe.id as dupe_id, canon.id as canonical_id
from drivers dupe
join drivers canon on canon.active = true and canon.full_name = (case
    when dupe.full_name = 'Lavric Valerii' then 'Lavric Valeriu'
    when dupe.full_name in ('Goncear R I','Goncear Roma Ivan') then 'Goncear Roman' end)
where dupe.full_name in ('Lavric Valerii','Goncear R I','Goncear Roma Ivan');

-- перепривязка всех FK, КРОМЕ кассы (у этих уник-конфликтов нет: daily_assignments uniq=(route,date) от driver не зависит)
update reports                    x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;
update daily_assignments          x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;
update counting_sessions          x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;
update ct_chestionare             x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;
update ct_operator_log            x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;
update counting_entries           x set alt_driver_id = m.canonical_id from _xmerge m where x.alt_driver_id = m.dupe_id;
update counting_audit_entries     x set alt_driver_id = m.canonical_id from _xmerge m where x.alt_driver_id = m.dupe_id;
update tomberon_payment_overrides x set driver_id     = m.canonical_id from _xmerge m where x.driver_id     = m.dupe_id;

-- касса: перепривязать ТОЛЬКО не-конфликтные (у канона нет чека на этот день); 4 конфликтных остаются на дубле
update driver_cashin_receipts dr set driver_id = m.canonical_id
from _xmerge m
where dr.driver_id = m.dupe_id
  and not exists (select 1 from driver_cashin_receipts c where c.driver_id = m.canonical_id and c.ziua = dr.ziua);

-- удалить только полностью осиротевшие дубли (без оставшихся чеков): Lavric Valerii + Goncear Roma Ivan.
-- Goncear R I сохраняет 4 чека → НЕ удаляется.
delete from drivers d using _xmerge m
where d.id = m.dupe_id
  and not exists (select 1 from driver_cashin_receipts c where c.driver_id = d.id);
