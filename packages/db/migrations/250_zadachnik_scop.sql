-- 250: scopul șablonului (obiectivul de business) separat de instrument (N video/săpt)
-- Ex.: scop = «găsim șofer Ocnița», instrument = 2 video/săptămână.

alter table recurring_task_templates
  add column if not exists goal text,
  add column if not exists goal_achieved_at timestamptz;

alter table obligations
  add column if not exists goal text;

comment on column recurring_task_templates.goal is 'obiectivul de business (🏁), ex. «găsim șofer Ocnița»; video-urile sunt doar instrumentul';
comment on column recurring_task_templates.goal_achieved_at is 'setat de «Obiectiv atins» — șablonul se oprește cu motiv, nu doar Stop';
comment on column obligations.goal is 'copiat din șablon la generare — executorul vede scopul pe sarcină';

notify pgrst, 'reload schema';
