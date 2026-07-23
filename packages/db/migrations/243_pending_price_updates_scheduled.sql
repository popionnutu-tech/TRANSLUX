-- 243_pending_price_updates_scheduled.sql
-- Tarifele ANTA confirmate NU se mai aplică imediat: intră în vigoare de la data
-- de pe pagina ANTA („începând cu DD.MM.YYYY") sau, în lipsa ei, de VINEREA următoare
-- (cerință owner 23.07.2026: „modificările la tarif trebuie să apară de vineri chiar
-- dacă le-am acceptat azi"). Confirmarea scrie imediat doar tariff_periods (site-ul,
-- vocea și numărarea comută singure după dată); app_config + oferta Bălți + nomenclator
-- se scriu în ziua intrării în vigoare (status 'scheduled' → cron apply-scheduled-tariffs).

-- 1. Status nou 'scheduled' = confirmat de owner, așteaptă data intrării în vigoare.
alter table pending_price_updates
  drop constraint pending_price_updates_status_check;
alter table pending_price_updates
  add constraint pending_price_updates_status_check
  check (status in ('pending', 'approved', 'rejected', 'superseded', 'expired', 'scheduled'));

-- 2. apply_on = data rezolvată a intrării în vigoare (data ANTA sau vinerea următoare);
--    applied_at = momentul în care s-au scris efectiv app_config/offers/nomenclator.
alter table pending_price_updates
  add column if not exists apply_on date,
  add column if not exists applied_at timestamptz;

-- 3. Cronul zilnic caută propuneri programate scadente.
create index if not exists idx_pending_price_updates_scheduled
  on pending_price_updates (apply_on)
  where status = 'scheduled';
