-- 283_voice_unknown_idx.sql
-- Провалы резолвера сёл из живых звонков: тул-роуты пишут kind='unknown_locality'
-- (lib/voice-unknown.ts) с дедупом по суткам через select по details->>'heard_key'.
-- Функциональный индекс по created_at::date невозможен (не IMMUTABLE) — btree по
-- heard_key + created_at покрывает и дедуп, и ночную выборку learner-а.
create index if not exists idx_vci_unknown_heard
  on voice_controller_incidents ((details->>'heard_key'), created_at desc)
  where kind = 'unknown_locality';
