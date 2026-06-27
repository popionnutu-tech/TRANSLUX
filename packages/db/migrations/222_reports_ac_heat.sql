-- Шаг 12 (климат, сезонный): состояние кондиционера или отопления салона per машина.
--   A/C спрашивается 15.05–31.07, отопление салона — 01.11–15.02; раз в месяц на машину.
-- 3 состояния: 'works' (lucrează), 'broken' (stricat → авто-задача Владу), 'none' (nu are — без A/C/печки).
-- Обе колонки nullable и дополняют существующие поля reports (не заменяют).
-- Месячный лукап идёт по vehicle_id (есть idx_reports_vehicle) — отдельный индекс не нужен.
alter table public.reports
  add column if not exists ac_status text
    check (ac_status in ('works', 'broken', 'none')),
  add column if not exists heat_status text
    check (heat_status in ('works', 'broken', 'none'));
