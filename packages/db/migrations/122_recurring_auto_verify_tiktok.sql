-- 122: marcaj de auto-verificare TikTok pentru șabloane recurente.
-- Un șablon marcat cu auto_verify_tiktok=true se închide automat noaptea (după colectarea SMM la 23:00)
-- pe baza smm_daily_stats.posts_count (conturile TikTok TRANSLUX): ≥2 video → rezolvată, altfel notificare.
alter table public.recurring_task_templates
  add column if not exists auto_verify_tiktok boolean not null default false;
