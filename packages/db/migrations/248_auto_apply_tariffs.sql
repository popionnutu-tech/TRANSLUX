-- 248_auto_apply_tariffs.sql
-- Tarifele ANTA se aplică AUTOMAT implicit (cerință owner 06.08.2026): propunerea
-- e confirmată de sistem imediat după creare (același applyProposal ca butonul
-- Confirmă), cu excepția salturilor >15% — acelea rămân pe confirmarea manuală.
-- Dezactivabil din panou → Tarife (app_config.auto_apply_tariffs = 'false').

-- 1. Fă starea implicită vizibilă în DB (motorul tratează lipsa cheii tot ca ACTIVAT).
insert into app_config (key, value)
values ('auto_apply_tariffs', 'true')
on conflict (key) do nothing;

-- 2. Audit: distinge confirmarea automată de cea făcută de om (decided_by e null în ambele).
alter table pending_price_updates
  add column if not exists auto_applied boolean not null default false;

-- 3. Plasă de siguranță contra aplicării concurente (cron × buton manual): două
--    rânduri cu același period_start ar fi alese nedeterminist de cititori.
--    Cu unique index, al doilea insert eșuează și claim-ul lui se rostogolește înapoi.
create unique index if not exists uq_tariff_periods_period_start
  on tariff_periods (period_start);
