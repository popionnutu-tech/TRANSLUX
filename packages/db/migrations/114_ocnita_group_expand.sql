-- 114_ocnita_group_expand.sql
-- Бизнес-правка владельца (20.06.2026): рейсы #58 (Chișinău–Otaci, Barbacari) и #59 (Ocnița–Chișinău,
-- Sumschii) операционно относятся к РАЙОНУ ОКНИЦА — ночные рейсы (утром в Кишинёв, вечером на Север).
-- Раньше они были вне групп; включаем в группу «Raionul Ocnița» (была route_ids=[3,29,21], triplet 4+1).
--
-- Стало 5 рейсов. Размер команды — по той же overnight-модели, что у остальных групп
--   (total ≈ ceil(n_routes × 1.5), резерв = 1: singleton 1→2, pair 2→3, triplet 3→5):
--   5 рейсов → ceil(7.5)=8 → база 7 + резерв 1.
-- ПРИМЕЧАНИЯ:
--   • n_routes — генерируемая колонка (из route_ids), руками не ставится → станет 5 сама.
--   • group_type оставлен 'triplet' (CHECK-констрейнт допускает только day_group/pair/triplet/singleton,
--     а в расчётах вью group_type не участвует; в UI ярлык типа больше не показываем).
--   • Порядок route_ids — по времени отправления с Севера (читабельный список):
--     #59 05:30 → #3 08:00 → #29 09:50 → #21 12:35 → #58 16:25.
--   • analytics_route_groups — ручная seed-таблица; ночной moneyball_recompute её НЕ трогает.

update analytics_route_groups
set route_ids = array[59, 3, 29, 21, 58],
    required_base_drivers = 7,
    required_backup_drivers = 1
where quarter = '2026-Q2' and label = 'Raionul Ocnița';
