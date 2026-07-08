-- Punct nou operator Chișinău (decizie owner 08.07.2026):
-- «Șoferul ajută la încărcat alți șoferi?» — întrebat la fiecare cursă OK
-- (point CHISINAU), înaintea întrebării de uniformă.
-- null = neîntrebat (Bălți / ABSENT / rapoarte vechi), true = ajută, false = nu ajută.
alter table reports add column if not exists loading_help_ok boolean;

comment on column reports.loading_help_ok is
  'Șoferul ajută la încărcat alți șoferi (punct Chișinău, înainte de uniformă); null = neîntrebat';
