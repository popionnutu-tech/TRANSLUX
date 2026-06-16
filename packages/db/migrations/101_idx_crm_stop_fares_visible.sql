-- 101_idx_crm_stop_fares_visible.sql
-- Частичный индекс под горячий фильтр `is_visible = true` в grafic/actions.ts
-- (.eq('is_visible', true).order('id')). Только индекс — результаты запросов
-- идентичны, код приложения не меняется.
-- (Поиск рейсов trips-search фильтрует по name_ro ILIKE — его этот индекс не покрывает.)
create index if not exists idx_crm_stop_fares_visible
  on crm_stop_fares (crm_route_id, id)
  where is_visible = true;
