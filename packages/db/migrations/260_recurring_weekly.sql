-- 260_recurring_weekly.sql
-- Ion (21.08.2026): doar sarcinile video sunt zilnice; restul șabloanelor sunt SĂPTĂMÂNALE.
-- period='weekly': o singură sarcină vie pe săptămână, termen duminică la deadline_time.
-- Generatorul re-spawnează în aceeași săptămână doar dacă ținta (target_per_week, implicit 1)
-- nu e atinsă — altfel închiderea automată de la 07:00 producea spam zilnic «expirate».

alter table public.recurring_task_templates
  drop constraint if exists recurring_task_templates_period_check;

alter table public.recurring_task_templates
  add constraint recurring_task_templates_period_check
  check (period in ('daily', 'mon_fri', 'custom', 'weekly'));

-- Cele 3 șabloane ne-video trec pe săptămânal (video «7 video/zi» rămâne daily).
update public.recurring_task_templates
   set period = 'weekly', week_days = null
 where id in (
   'b2682ec3-63ee-4517-8b6c-6e91b2801731',  -- Vinzare Mercedes s400
   'c34b1d78-9046-43c0-b1b9-f8297503a96f',  -- Spațiu chirie
   '21aa01f6-fd10-4309-be5b-a27cd0595adf'   -- Căutat șoferi angajare Chișinău/Ocnita/Briceni
 );

-- Fix unic de date: instanțele vii de azi ale celor 3 devin sarcina săptămânii curente —
-- termenul se mută pe duminică 23.08.2026 18:00 Chișinău (15:00Z), altfel curățenia de mâine
-- 07:00 le-ar închide «expirate» încă o dată.
update public.obligations
   set current_deadline = '2026-08-23T15:00:00Z'
 where recurring_template_id in (
   'b2682ec3-63ee-4517-8b6c-6e91b2801731',
   'c34b1d78-9046-43c0-b1b9-f8297503a96f',
   '21aa01f6-fd10-4309-be5b-a27cd0595adf'
 )
   and current_state in ('sent', 'delivered', 'accepted', 'in_progress', 'overdue')
   and current_deadline < '2026-08-23T15:00:00Z';

-- Comentariul din migr. 249 nu știa de 'weekly' — ținta implicită weekly e 1, nu «dedusă din program».
comment on column public.recurring_task_templates.target_per_week is
  'Țintă săptămânală de sarcini închise; null = implicit (daily→7, mon_fri→5, custom→nr. zile, weekly→1)';
