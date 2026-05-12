-- 076: Расширение RLS политик и публичных VIEW для безопасного доступа
-- с anon-ключа Supabase.
--
-- Цель: чтобы публичный сайт (apps/web) мог переключиться с service_role на
-- anon-ключ и иметь доступ ТОЛЬКО к данным нужным клиентам для покупки билета.
-- Никаких личных данных сотрудников, зарплат, отчётов и т.д.
--
-- ДОПОЛНЯЕТ миграцию 015_enable_rls.sql (там уже включён RLS и anon-политики
-- для crm_routes, crm_stop_fares, localities, offers, route_km_pairs).
--
-- ПРИМЕНЯТЬ ВРУЧНУЮ через Supabase MCP apply_migration или через Supabase Studio
-- (только с подтверждения владельца — это продакшн-база).

-- =============================================================================
-- 1. Дополнительные anon SELECT политики на публичные таблицы
-- =============================================================================

-- Тарифы (нужны для расчёта цены билета по km × тариф)
DROP POLICY IF EXISTS anon_read_tariff_periods ON tariff_periods;
CREATE POLICY anon_read_tariff_periods ON tariff_periods
  FOR SELECT TO anon USING (true);

-- Дневные назначения водителей на маршруты (нужно для показа кто едет)
-- Содержит только id водителя/машины — личных данных нет, безопасно
DROP POLICY IF EXISTS anon_read_daily_assignments ON daily_assignments;
CREATE POLICY anon_read_daily_assignments ON daily_assignments
  FOR SELECT TO anon USING (true);

-- =============================================================================
-- 2. Публичные VIEW для водителей и машин — только нужные клиенту поля
-- =============================================================================
-- Прямой доступ anon к таблицам drivers/vehicles запрещён (нет политики на anon).
-- Вместо этого создаём узкие VIEW которые открывают только те поля что клиент
-- и так видит на сайте: имя водителя, телефон, номер машины. Никаких зарплат,
-- паспортов и т.д.
--
-- VIEW по умолчанию создаются с правами owner (postgres) — RLS базовых таблиц
-- обходится для запросов через view. Это и нужно: контролируемое раскрытие
-- только перечисленных колонок.

DROP VIEW IF EXISTS public_drivers_view;
CREATE VIEW public_drivers_view AS
SELECT id, full_name, phone FROM drivers;

DROP VIEW IF EXISTS public_vehicles_view;
CREATE VIEW public_vehicles_view AS
SELECT id, plate_number FROM vehicles;

-- Дать anon доступ к view
GRANT SELECT ON public_drivers_view TO anon;
GRANT SELECT ON public_vehicles_view TO anon;

-- На всякий случай: убедиться что прямой доступ anon к таблицам нет
REVOKE ALL ON drivers FROM anon;
REVOKE ALL ON vehicles FROM anon;

-- =============================================================================
-- 3. anon INSERT политики для аналитики (анонимная телеметрия)
-- =============================================================================
-- Эти таблицы только пишут — клиент НЕ может прочитать чужие записи.
-- INSERT-only, без SELECT для anon.

DROP POLICY IF EXISTS anon_insert_search_log ON search_log;
CREATE POLICY anon_insert_search_log ON search_log
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_insert_page_views ON page_views;
CREATE POLICY anon_insert_page_views ON page_views
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_insert_call_clicks ON call_clicks;
CREATE POLICY anon_insert_call_clicks ON call_clicks
  FOR INSERT TO anon WITH CHECK (true);

-- =============================================================================
-- ИТОГ: что доступно anon после применения миграций 015 + 076
-- =============================================================================
-- SELECT:
--   crm_routes, crm_stop_fares, localities, offers, route_km_pairs,
--   tariff_periods, daily_assignments,
--   public_drivers_view, public_vehicles_view
-- INSERT:
--   search_log, page_views, call_clicks
--
-- Всё остальное (admin_accounts, salary, reports, аналитика, counting, smm,
-- drivers/vehicles напрямую, и т.д.) — anon не видит вообще.
-- service_role продолжает обходить все RLS — админка работает как обычно.
