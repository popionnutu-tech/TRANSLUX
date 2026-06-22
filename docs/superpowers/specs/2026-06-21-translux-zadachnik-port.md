# TRANSLUX — порт задачника (zadachnik) из TLX 1:1

Дата: 2026-06-21. Статус: одобрено владельцем («confirm, fa tot automat, fa in botul translux»).

## Цель
Перенести систему задач (zadachnik / obligations) из TLX (АЗС) в TRANSLUX (автобусы) **1:1** —
как Telegram Mini App в боте TRANSLUX. Владелец ставит задачи контролёрам, они принимают/делают/
отчитываются, владелец одобряет/отклоняет/возвращает; авто-напоминания, просрочки, скоринг, повторяющиеся.

## Объём
**Входит (1:1):** поток задачи (машина состояний), Mini App экраны (МОСТИК/деталь/Sarcinile mele/
скоринг/повторяющиеся), уведомления бота, крон-воркер (авто-принятие, напоминания, sweep просрочек,
авто-одобрение, повторяющиеся), Telegram initData auth, терминальный вид (Fallout), скоринг,
повторяющиеся задачи.

**НЕ входит** (TLX-специфика АЗС, владелец сказал «только задачи»): `station_telegram_groups`,
`station_group_messages`, `station_signals` (AI-кормилец задач из групп станций), `operator_scoring`
(эконометрический скоринг операторов АЗС), `chef_stations`.

## Точки адаптации (только стыковка, логика 1:1)
1. **Роли:** TLX admin(creator)+chef/accountant(assignee) → TRANSLUX **ADMIN**(постановщик) +
   **CONTROLLER**(исполнитель). FK `creator_id/assignee_id → users(id)`. Рабочие часы/праздники —
   Молдова (как в TLX, без изменений: 09:00–18:00 пн-пт − праздники).
2. **Бот:** TLX webhook bot-server → TRANSLUX **grammY (polling, Railway)**. Порт: menu button →
   Mini App URL; уведомления (notify) через grammY Api.
3. **Крон:** TLX Vercel cron `/api/cron/zadachnik-runner` (15 мин) → воркер на **Railway-боте**
   (setInterval, бот всегда онлайн), дёргает HTTP-роут раннера или вызывает логику напрямую.
4. **Хостинг Mini App:** новый раздел `/mini-app` в **apps/admin** (central-hub, Vercel, public HTTPS).
   Авторизация — Telegram initData (НЕ cookie-логин админки).
5. **Имена таблиц/enum — сохраняем 1:1** (`obligations`, `obligation_*`, `recurring_*`) — чтобы lib/API
   переносились почти дословно.

## Модель данных (1:1 из TLX live)
- `obligations`(id, organization_id, creator_id→users, assignee_id→users, title, description, points,
  original_deadline, current_deadline, current_state, rework_used, retry_number, root_task_id,
  year/month generated, attachments jsonb, created_at, updated_at).
- `obligation_attempts`(obligation_id, number, report_text, verdict, manager_comment, submitted_at, decided_at).
- `obligation_events`(append-only журнал: obligation_id, event_type, actor_id, data jsonb).
- `obligation_scheduled_actions`(obligation_id, action_type, scheduled_at, executed_at, payload).
- `recurring_templates` / `recurring_instances` (этап D).
- Enums: obligation_state(13), obligation_event_type(20), attempt_verdict(4), scheduled_action_type(8),
  recurring_period, recurring_instance_state, recurring_template_status, recurring_nonworking_behavior.
- Машина состояний: created→sent→delivered→accepted(вручную/авто 8 раб.ч)→in_progress→report_pending→
  resolved | rejected | (rework→in_progress, 1 раз); accepted/in_progress→overdue→overdue_responded→
  accepted/resolved|failed; ignored (grace-day); cancelled (из любого нетерминального).

## Этапы сборки
- **A — фундамент:** миграция ядра БД (obligations+attempts+events+scheduled_actions); Telegram initData
  auth (apps/admin); Mini App `/mini-app/zadachnik` (МОСТИК, new, [id]) + `/mini-app/tasks` (list, [id]);
  API `/api/admin/tasks*` + `/api/me/tasks*` (create/list/detail/accept/start/submit/approve/reject/
  rework/cancel); бот: menu button + пуш «новая задача»/«одобрено/отклонено/доработка»; терминальный стиль.
- **B — крон:** воркер scheduled_actions на Railway-боте (auto_accept, reminder_*, overdue sweep,
  report_auto_approve, ignore/extension); working-hours + scheduled-actions lib.
- **C — скоринг:** `/api/admin/tasks/scoring` + Mini App `/mini-app/zadachnik/scoring` (план/факт/светофор).
- **D — повторяющиеся:** recurring_templates/instances + sweep в кроне + Mini App `/recurring`.

## Файл-маппинг (TLX → TRANSLUX)
- TLX `supabase/migrations/*zadachnik*` → `packages/db/migrations/115_zadachnik_core.sql` (+ later для C/D).
- TLX `lib/zadachnik/*` → `apps/admin/src/lib/zadachnik/*` (адаптировать импорты: supabase, telegram-notify→grammY, timezone/holidays).
- TLX `app/api/admin/tasks*`, `app/api/me/tasks*` → `apps/admin/src/app/api/...`.
- TLX `app/mini-app/zadachnik|tasks/*` → `apps/admin/src/app/mini-app/*`.
- TLX `globals.css` Fallout-переменные + bg → TRANSLUX mini-app стиль (терминальный, 1:1).
- TLX cron runner → `apps/admin/src/app/api/cron/zadachnik-runner` + триггер с Railway-бота.

## Авторизация (Mini App)
Валидация `Telegram.WebApp.initData` HMAC по `TELEGRAM_BOT_TOKEN`; резолв `telegram_id → users`; роль
ADMIN→admin-вид (постановщик), CONTROLLER→employee-вид (исполнитель). Заголовок `x-telegram-init-data`.
Dev-обход: `ALLOW_DEV_AUTH=1` + initData `__dev__` → первый ADMIN.
