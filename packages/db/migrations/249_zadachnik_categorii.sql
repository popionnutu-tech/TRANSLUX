-- 249: категории задач + недельные цели шаблонов
-- (spec: docs/superpowers/specs/2026-08-07-zadachnik-categorii-design.md)

alter table obligations
  add column if not exists category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column if not exists recurring_template_id uuid references recurring_task_templates(id) on delete set null;

alter table recurring_task_templates
  add column if not exists category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column if not exists target_per_week integer check (target_per_week >= 1);

comment on column obligations.category is 'MARKETING_AUTO | VIDEO | DEZVOLTARE | ALTELE';
comment on column obligations.recurring_template_id is 'șablonul din care s-a generat (pt. progresul săptămânal al țintei)';
comment on column recurring_task_templates.target_per_week is 'ținta săptămânală; null = dedusă din program (daily→7, mon_fri→5, custom→nr. zile)';

-- Backfill: toată reclama → MARKETING_AUTO
update obligations set category = 'MARKETING_AUTO' where source = 'reclama';

-- Backfill: șabloanele existente (toate video la 07.08.2026) → VIDEO
update recurring_task_templates set category = 'VIDEO';

-- Backfill: sarcinile din șabloane → categoria șablonului + legătura (potrivire title/description,
-- același procedeu ca autoVerifyTiktokTasks)
update obligations o
set category = t.category, recurring_template_id = t.id
from recurring_task_templates t
where o.source = 'recurring'
  and coalesce(o.title, '') = coalesce(t.title, '')
  and o.description = t.description;

notify pgrst, 'reload schema';
