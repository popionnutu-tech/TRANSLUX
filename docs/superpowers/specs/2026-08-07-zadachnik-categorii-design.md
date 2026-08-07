# Задачник: категории задач + недельные цели (дизайн)

Дата: 2026-08-07 · Статус: на утверждении · Исполнитель задач: Iurie (единственный)

## Зачем

Все задачи Юрия сейчас в одном списке. Нужно разделить по смыслу работы и выделить
цели («минимум N видео в неделю»), чтобы Юрий с одного взгляда понимал, что за
задача перед ним и как идёт неделя.

## Категории (фиксированный список)

| код | название (RO) | эмодзи | цвет | что попадает |
|---|---|---|---|---|
| `MARKETING_AUTO` | Marketing auto | 🚌 | синий `#4f9cf0` | реклама на автобусах, панели маршрутов — все задачи Reclamă |
| `VIDEO` | Video TikTok/FB | 🎬 | фиолетовый `#b07cf0` | короткие видео; у шаблонов — недельные цели 🎯 |
| `DEZVOLTARE` | Dezvoltare marketing | 📈 | зелёный `#4fd08c` | развитие маркетинга |
| `ALTELE` | Altele | 📌 | серый `#8a93a5` | всё остальное (по умолчанию) |

Назначение категории:
- задачи Reclamă → `MARKETING_AUTO` автоматически (в `createReclamaTask`);
- задача из повторяющегося шаблона наследует категорию шаблона;
- при ручном создании задачи/шаблона админ выбирает категорию одним тапом
  (4 цветных чипа, по умолчанию `ALTELE`);
- на странице задачи админ может сменить категорию (исправление ошибок).

## Недельные цели

- Цель живёт на повторяющемся шаблоне: новое поле `target_per_week` (любое целое ≥1,
  опционально). Если не задано — цель выводится из расписания:
  `daily` → 7, `mon_fri` → 5, `custom` → число выбранных дней.
- Прогресс недели = число задач этого шаблона, **закрытых (resolved)** за текущую
  неделю (пн–вс, Europe/Chisinau). Для точной привязки задача получает
  `recurring_template_id`.
- Достигнута цель → бар зелёный с ✓. Панель показывает все активные шаблоны
  исполнителя (не только VIDEO — цель есть у любого шаблона).

## Данные (миграция 249)

```sql
alter table obligations
  add column category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column recurring_template_id uuid references recurring_task_templates(id) on delete set null;

alter table recurring_task_templates
  add column category text not null default 'ALTELE'
    check (category in ('MARKETING_AUTO','VIDEO','DEZVOLTARE','ALTELE')),
  add column target_per_week integer check (target_per_week >= 1);
```

Разовый backfill в той же миграции:
- `obligations` с `source='reclama'` → `MARKETING_AUTO`;
- 3 существующих шаблона (TikTok, Somn Chișinău, Șofer Ocnița) → `VIDEO`;
- их задачи (`source='recurring'`) → `VIDEO` + `recurring_template_id` по точному
  совпадению title/description (как в autoVerifyTiktokTasks).

## Изменения по слоям

**Бот** (`apps/bot`):
- `spawnObligation` принимает `category` и `recurringTemplateId`, пишет в insert;
- `createReclamaTask` передаёт `MARKETING_AUTO`;
- `generateRecurringTasks` передаёт `t.category` и `t.id`.

**API** (`apps/admin/src/app/api/zadachnik`):
- `GET /tasks` возвращает `category`; для CONTROLLER (bucket=active) дополнительно
  `targets: [{template_id, label, done, target}]` — считается сервером одним
  запросом по задачам недели;
- `POST /tasks` принимает `category` (валидация по списку, default `ALTELE`);
- `PATCH /tasks/[id]` (ADMIN) принимает `category`;
- `GET/POST/PATCH /recurring` — `category` + `target_per_week`.

**Mini App** (`apps/admin/src/app/mini-app/zadachnik`):
- Экран Юрия: панель «🎯 Săptămâna asta» сверху (бар на каждый активный шаблон:
  `label ▅▅▅░░ done/target`, при done≥target — ✓ зелёным), ниже секции по
  категориям в порядке VIDEO → MARKETING_AUTO → DEZVOLTARE → ALTELE (пустые
  скрываются); внутри секции текущая сортировка сохраняется;
- Карточка задачи: эмодзи категории перед названием (везде, включая историю
  и админ-виды); значки 📢/🔁 остаются;
- Админ «Per angajat»: у строк шаблонов добавляется `🎯 done/target`;
- Форма «+ Sarcină»: ряд из 4 чипов категории;
- Форма «Recurente»: чипы категории + поле «🎯 Țintă/săptămână» (пусто = auto);
- Страница задачи `[id]`: для ADMIN — смена категории (те же чипы).

## Ошибки / краевые случаи

- Неизвестная категория в API → 400; в UI список фиксирован.
- Шаблон удалён → `recurring_template_id` становится NULL, задача остаётся;
  цель шаблона исчезает из панели (шаблонов нет — панель скрыта).
- Неделя без сгенерированных задач (сбой генератора) → `done=0`, бар пустой —
  это честный сигнал, не ошибка UI.
- Старые задачи без template_id в текущей неделе: backfill привязывает
  сегодняшние; прошлые недели для баров не важны.

## Проверка (успех)

1. Миграция применена; 12 задач Reclamă → 🚌, 3 шаблона и их задачи → 🎬.
2. Юрий открывает Mini App: сверху бары целей, задачи разбиты на секции.
3. Юрий закрывает видео-задачу → бар недели растёт на 1.
4. Новая задача Reclamă (дефект от оператора) приходит с 🚌 без участия людей.
5. Админ создаёт шаблон «вт+чт» без цифры цели → в панели цель 2; ставит 5 → цель 5.

## Вне объёма (сознательно)

- Подсчёт по реальным публикациям из SMM-мониторинга (решено: считаем по задачам).
- Общая цель на категорию.
- Категории в еженедельном отчёте владельцу (можно добавить потом).
