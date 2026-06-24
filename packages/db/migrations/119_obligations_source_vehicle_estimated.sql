-- Этап D-1 задачника: авто-задачи из дефектов рекламы + дата-оценка при принятии.
--   source        — происхождение задачи: NULL/'manual' | 'reclama' | 'recurring'
--   vehicle_plate — номер машины (для source='reclama': дедуп + недельный отчёт)
--   estimated_date— ориентировочная дата готовности, которую исполнитель ставит при принятии
-- Все nullable, аддитивно, существующий поток задач не затрагивают.
alter table public.obligations
  add column if not exists source text,
  add column if not exists vehicle_plate text,
  add column if not exists estimated_date date;

-- Быстрый дедуп открытых reclama-задач по машине.
create index if not exists idx_obligations_reclama_open
  on public.obligations (vehicle_plate)
  where source = 'reclama';
