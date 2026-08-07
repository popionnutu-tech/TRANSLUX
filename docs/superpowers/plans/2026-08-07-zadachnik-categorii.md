# Zadachnik: категории + недельные цели — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Задачи и шаблоны получают категорию (🚌🎬📈📌), у шаблонов — недельная цель с прогресс-баром на экране Юрия.

**Architecture:** Колонки `category`/`recurring_template_id` на `obligations` и `category`/`target_per_week` на `recurring_task_templates`; оба писателя (бот `spawnObligation`, админ `core.createTask`) проставляют категорию; прогресс недели считает API сервером; Mini App рисует панель целей + секции.

**Tech Stack:** Supabase (SQL-миграция), Node/TS (бот), Next.js App Router (API+Mini App).

## Global Constraints

- Категории — фиксированный список: `MARKETING_AUTO`, `VIDEO`, `DEZVOLTARE`, `ALTELE` (default `ALTELE`).
- Неделя: понедельник 00:00 Europe/Chisinau — воскресенье.
- Цель шаблона: `target_per_week ?? (daily→7, mon_fri→5, custom→week_days.length)`.
- НЕ использовать `.update()/.delete()` + `.or()` в supabase-js (PostgREST проекта отдаёт 42703).
- У мутаций всегда читать `error` из ответа.
- Проверка каждого шага: `npx tsc` соответствующего проекта; в конце — живая проверка через SQL/скриншот.

---

### Task 1: Миграция 249 + backfill

**Files:**
- Create: `packages/db/migrations/249_zadachnik_categorii.sql`

**Interfaces:**
- Produces: колонки `obligations.category text`, `obligations.recurring_template_id uuid`, `recurring_task_templates.category text`, `recurring_task_templates.target_per_week int`.

- [ ] **Step 1: написать миграцию**

```sql
-- 249: категории задач + недельные цели шаблонов (spec 2026-08-07-zadachnik-categorii-design.md)
alter table obligations
  add column if not exists category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column if not exists recurring_template_id uuid references recurring_task_templates(id) on delete set null;

alter table recurring_task_templates
  add column if not exists category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column if not exists target_per_week integer check (target_per_week >= 1);

-- Backfill: вся реклама → MARKETING_AUTO
update obligations set category = 'MARKETING_AUTO' where source = 'reclama';

-- Backfill: существующие шаблоны — все видео → VIDEO
update recurring_task_templates set category = 'VIDEO';

-- Backfill: задачи из шаблонов → категория шаблона + привязка по title/description
update obligations o
set category = t.category, recurring_template_id = t.id
from recurring_task_templates t
where o.source = 'recurring'
  and coalesce(o.title,'') = coalesce(t.title,'')
  and o.description = t.description;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: применить в Supabase (проект zqkzqpfdymddsywxjxow) через apply_migration**
- [ ] **Step 3: проверить**: `select category, count(*) from obligations group by 1` → 🚌=12+, 🎬=3 (recurring), остальное ALTELE; `select category, target_per_week from recurring_task_templates` → 3×VIDEO/null.
- [ ] **Step 4: проверить REST-запись новой колонки** (PGRST204-ловушка): PATCH одной задачи `category=ALTELE→ALTELE` через curl с service key → 200.
- [ ] **Step 5: commit**

### Task 2: Бот проставляет категорию

**Files:**
- Modify: `apps/bot/src/services/db.ts` (spawnObligation, createReclamaTask, generateRecurringTasks)

**Interfaces:**
- Consumes: колонки из Task 1.
- Produces: `spawnObligation(o: {... category?: string; recurringTemplateId?: string | null })` — insert пишет `category` (default 'ALTELE') и `recurring_template_id`.

- [ ] **Step 1**: в `spawnObligation` добавить в параметры `category?: string; recurringTemplateId?: string | null` и в insert: `category: o.category ?? 'ALTELE', recurring_template_id: o.recurringTemplateId ?? null`.
- [ ] **Step 2**: `createReclamaTask` → `category: 'MARKETING_AUTO'`.
- [ ] **Step 3**: `generateRecurringTasks` → `category: t.category ?? 'ALTELE', recurringTemplateId: t.id`. Также LOW-фикс из перф-ревью: у select исполнителя читать `error` и бросать (`assignee select: ...`).
- [ ] **Step 4**: `npx tsc --project apps/bot/tsconfig.json` → OK.
- [ ] **Step 5: commit**

### Task 3: Админ-API: категория + цели

**Files:**
- Modify: `apps/admin/src/lib/zadachnik/core.ts` (createTask, createRecurringTemplate, listRecurring)
- Modify: `apps/admin/src/app/api/zadachnik/tasks/route.ts` (POST: category; GET CONTROLLER: targets)
- Modify: `apps/admin/src/app/api/zadachnik/tasks/[id]/route.ts` (PATCH category, ADMIN)
- Modify: `apps/admin/src/app/api/zadachnik/recurring/route.ts` (POST: category, target_per_week)

**Interfaces:**
- Produces: `GET /tasks` (CONTROLLER, bucket=active) → `{ role, tasks, targets: Array<{template_id, label, done, target}> }`; `POST /tasks` и `POST /recurring` принимают `category`; `POST /recurring` принимает `target_per_week`; `PATCH /tasks/[id]` принимает `{category}`.

- [ ] **Step 1**: константа `const CATEGORIES = ['MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE'] as const;` в core.ts + export; `createTask`/`createRecurringTemplate` принимают и пишут `category` (валидация: не из списка → 'ALTELE'); `createRecurringTemplate` пишет `target_per_week ?? null`; спавн-при-создании шаблона передаёт категорию и `recurring_template_id`.
- [ ] **Step 2**: `GET /tasks` для CONTROLLER+active: посчитать targets — активные шаблоны исполнителя; done по `obligations` за неделю (`created_at >= weekStartISO`, `recurring_template_id in (...)`, `current_state='resolved'`); weekStart: понедельник 00:00 Кишинёв.
- [ ] **Step 3**: `POST /tasks` — прокинуть `body.category`; `POST /recurring` — `body.category`, `body.target_per_week` (int ≥1 или null).
- [ ] **Step 4**: PATCH в `tasks/[id]/route.ts`: ADMIN, `{category}` из списка → update obligations (простой `.eq('id')`, без .or()); читать error.
- [ ] **Step 5**: `npx tsc --project apps/admin/tsconfig.json` (или next build later) → OK; commit.

### Task 4: Mini App UI

**Files:**
- Modify: `apps/admin/src/app/mini-app/zadachnik/ui.ts` (Task.category, CAT-мета)
- Modify: `apps/admin/src/app/mini-app/zadachnik/page.tsx` (панель целей + секции по категориям для CONTROLLER; эмодзи на карточках)
- Modify: `apps/admin/src/app/mini-app/zadachnik/new/page.tsx` (чипы категории; поле цели для рекуррентных)
- Modify: `apps/admin/src/app/mini-app/zadachnik/recurente/page.tsx` (показ категории и цели)
- Modify: `apps/admin/src/app/mini-app/zadachnik/[id]/page.tsx` (ADMIN: смена категории)

**Interfaces:**
- Consumes: `targets` из Task 3; `Task.category`.

- [ ] **Step 1**: в ui.ts: `category?: string` в Task; `export const CAT = { MARKETING_AUTO: {label:'Marketing auto', emoji:'🚌', color:'#4f9cf0'}, VIDEO: {label:'Video TikTok/FB', emoji:'🎬', color:'#b07cf0'}, DEZVOLTARE: {label:'Dezvoltare marketing', emoji:'📈', color:'#4fd08c'}, ALTELE: {label:'Altele', emoji:'📌', color:'#8a93a5'} }` + `CAT_ORDER`.
- [ ] **Step 2**: page.tsx CONTROLLER-active: панель `🎯 Săptămâna asta` (бар: заполненная доля done/target, ✓ зелёным при достижении), затем секции CAT_ORDER (пустые скрыть); история — плоский список как сейчас. Card: эмодзи категории перед 📢/🔁.
- [ ] **Step 3**: new/page.tsx: ряд из 4 чипов (фон = color при выборе), state `category`, отправка в POST; при включённой «Recurentă» — числовое поле «🎯 Țintă/săptămână (gol = auto)» → `target_per_week`.
- [ ] **Step 4**: recurente/page.tsx: `{CAT[t.category].emoji}` в заголовке карточки + `🎯 N/săpt` в мете; [id]/page.tsx: для ADMIN — 4 чипа, тап → PATCH.
- [ ] **Step 5**: компиляция + commit.

### Task 5: Деплой и живая проверка

- [ ] Vercel deploy (web можно днём — операторов не трогает): `bash .claude/scripts/deploy-vercel.sh` через vercel-deploy-monitor.
- [ ] Проверка живьём: SQL — категории проставлены; Mini App (скриншот через браузер не обязателен — проверить JSON `GET /tasks` с targets).
- [ ] Бот-часть уедет вечерним Railway-деплоем 22:06 (уже запланирован); в промпт крона добавлено повторное `update obligations set category='MARKETING_AUTO' where source='reclama' and category='ALTELE'` для задач, созданных днём старым кодом бота.
- [ ] Ревью architecture-guardian + performance-reviewer (обязательные) на итоговые коммиты.
