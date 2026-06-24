-- Повторяющиеся задачи: выбор конкретных дней недели (вариант 'custom').
-- week_days — массив дней по соглашению JS getDay(): 0=Вс,1=Пн,...,6=Сб (для period='custom').
alter table public.recurring_task_templates
  add column if not exists week_days int[];

alter table public.recurring_task_templates
  drop constraint if exists recurring_task_templates_period_check;

alter table public.recurring_task_templates
  add constraint recurring_task_templates_period_check
  check (period in ('daily', 'mon_fri', 'custom'));
