# Голосовой AI-агент TRANSLUX на ElevenLabs Conversational AI — дизайн

Дата: 2026-07-10
Статус: одобрен пользователем (устно в сессии)

## Цель

Телефонный AI-оператор TRANSLUX, который отвечает на **все входящие звонки** на номер
компании (+373 60 401 010) 24/7: рейсы, цены, акции, расписание, информация о компании,
приём жалоб. Живых операторов на линии нет — **отвечает только бот**.

## Решения (зафиксированы с пользователем)

| Вопрос | Решение |
|---|---|
| Объём итерации | Под ключ: агент + телефония |
| Направление звонков | Только входящие (inbound) |
| Post-call | Сохранять в Supabase + отчёт в Telegram |
| Готовность внешних сервисов | Ничего не заведено — аккаунты создаёт пользователь, всё остальное через API |
| Подход к конфигурации | Agent-as-code: идемпотентный setup-скрипт в репо |
| Кто отвечает на звонки | Только бот, 24/7. Перевода на человека нет — вместо этого бот фиксирует запрос обратного звонка |
| LLM | Claude Haiku 4.5 (встроенный в ElevenLabs) |
| TTS | Модель семейства **V3 Conversational**, голос — любой подходящий RO/RU мультиязычный |

## Архитектура

```
Клиент звонит на +373 60 401 010 (Moldcell)
   → переадресация Moldcell PBX на номер Zadarma
   → SIP-транк (transport TCP) → ElevenLabs ConvAI
        (STT + Claude Haiku 4.5 + TTS V3 Conversational + turn-taking)
        ├─ во время звонка: server tools → apps/admin /api/voice-tools/* (существуют)
        └─ после звонка: post-call webhook → apps/admin /api/voice-webhook (новый)
                            → Supabase (voice_calls) + Telegram-отчёт
```

Новых сервисов/процессов нет — всё на существующем Vercel-деплое `apps/admin`.

## Компоненты

### 1. Setup-скрипт (agent-as-code) — `scripts/voice-agent/`

- `agent-config.ts` — единственный источник правды по конфигурации агента:
  system prompt RO/RU (на основе `docs/elevenlabs-agent-config.md`, но без пункта
  «перевод на человека по номеру» — заменён на фиксацию запроса обратного звонка),
  first message, auto-detect языка (RO/RU), TTS V3 Conversational, LLM Claude Haiku 4.5,
  низкая temperature, определения 5 server-tools + системные `end_call`,
  `language_detection`.
- `setup.ts` — идемпотентный скрипт: создаёт агента, если его нет, иначе обновляет
  (PATCH) под конфиг. Настраивает post-call webhook. При наличии SIP-кредов Zadarma —
  создаёт/обновляет SIP-транк (TCP) и привязывает номер как inbound.
- Любое изменение промпта/tools = правка `agent-config.ts` + запуск `setup.ts`.

### 2. Server tools (существуют, доработка минимальная)

`apps/admin/src/app/api/voice-tools/`: search-trips, get-price, get-offers,
get-schedule, get-company-info. Auth: заголовок `X-Voice-API-Key`, timing-safe
сравнение (уже реализовано в `auth.ts`).

Новый tool: **request_callback** — фиксирует «клиент хочет живого оператора / жалоба»:
имя, телефон (dynamic variable `system__caller_id` как дефолт), суть вопроса.
Пишет строку в отдельную таблицу `voice_callback_requests` (`id`, `conversation_id`,
`caller_phone`, `reason`, `created_at`, `resolved` bool) и сразу шлёт
Telegram-уведомление (не дожидаясь post-call webhook). Логика записи и отчёта — в
`lib/` (по образцу `lib/trips-search.ts`), route остаётся тонким.

Формат ответов: существующие 5 tools сохраняют свой структурированный JSON-контракт
(`{count, trips[]}`, `{found, price}` и т.д.) — ElevenLabs нормально принимает
структурированный JSON, переписывать их не нужно. Новый request_callback возвращает
мягкий `{ "result": "текст" }`, в том числе при ошибке БД, чтобы агент не «спотыкался».

**Middleware:** `apps/admin/src/middleware.ts` закрывает все API-роуты по умолчанию —
`/api/voice-webhook` (и путь request_callback, если он вне `/api/voice-tools/`)
ОБЯЗАТЕЛЬНО добавить в `PUBLIC_PREFIXES`, иначе ElevenLabs не достучится.

### 3. Post-call webhook — `apps/admin/src/app/api/voice-webhook/route.ts`

- Верификация `ElevenLabs-Signature: t=<ts>,v0=<hmac>`: HMAC-SHA256 по `"{t}.{rawBody}"`,
  **raw body читается до JSON.parse**, сравнение timing-safe, анти-replay: `t` старше
  30 минут → отказ.
- Идемпотентность по `conversation_id` (unique) — дубликат webhook → тихий 200.
- Сохраняет: транскрипт (jsonb), summary/analysis, длительность, стоимость, номер
  звонящего, статус, `raw_webhook_data`.
- Отправляет Telegram-отчёт: краткое summary; жалобы помечаются отдельно.
  Если по этому `conversation_id` request_callback уже отправил мгновенный алерт —
  post-call отчёт его НЕ дублирует (проверка по `voice_callback_requests`).

### 3a. Telegram-уведомления — общий хелпер

Новый `apps/admin/src/lib/telegram-notify.ts`: `sendTelegram(chatIds, text)` +
`alertAdmins(text)` — получатели из таблицы `users` (`role='ADMIN'`, `active=true`,
`telegram_id not null`), по образцу `api/cron/bot-watchdog/route.ts`. Отдельный env
`VOICE_TELEGRAM_CHAT_ID` НЕ вводим — один источник правды «кому слать». Существующие
три inline-копии sendMessage не трогаем (surgical), но новая логика — только через хелпер.

### 4. БД — миграция Supabase (`226_voice_calls.sql`, проверить свободный номер)

Таблица `voice_calls`:
`id`, `conversation_id` (unique), `direction` ('in'), `caller_phone`, `transcript` (jsonb),
`summary`, `analysis` (jsonb), `duration_secs`, `cost`, `status`, `callback_requested`
(bool), `raw_webhook_data` (jsonb), `created_at`.

Таблица `voice_callback_requests`:
`id`, `conversation_id`, `caller_phone`, `reason`, `resolved` (bool default false),
`created_at`.

**RLS обязателен на обеих таблицах** (транскрипты и телефоны — персональные данные,
anon-ключ публичен в apps/web): `enable row level security` + deny-all политика
`using(false)`, по образцу `packages/db/migrations/115_*.sql`. Запись идёт через
service_role — deny-all функциональность не ломает.

### 5. Секреты (env: Vercel apps/admin + локально)

- `ELEVENLABS_API_KEY` — ключ API (создание/апдейт агента, транки, аудио).
- `VOICE_API_KEY` — уже существующий секрет для server tools.
- `ELEVENLABS_WEBHOOK_SECRET` — HMAC post-call webhook.
- Telegram: существующий токен бота; получатели — админы из таблицы `users` (см. 3a).
- Позже: SIP-креды Zadarma (используются только setup-скриптом, в ElevenLabs).

## Обработка ошибок

- Tool падает / БД недоступна → `{ "result": "Не смог проверить, попробуйте позже" }` (RO/RU).
- Webhook: невалидная подпись → 401; повтор → 200 без дубля; ошибка Telegram не
  блокирует сохранение в БД.
- Агенту запрещено выдумывать рейсы/цены (правило в промпте): нет данных — честно сказать
  и предложить зафиксировать запрос обратного звонка.

## Проверка (definition of done)

1. `setup.ts` отработал: агент в ElevenLabs с V3 Conversational + Claude Haiku 4.5 + tools.
2. Тестовый разговор (веб-сессия/дашборд): search_trips и get_price возвращают реальные
   данные из Supabase, агент корректно говорит RO и RU.
3. Тестовый звонок на номер Zadarma: агент отвечает по телефону, задержки приемлемы.
4. После звонка: строка в `voice_calls` + сообщение в Telegram.
5. Запрос «хочу человека» → request_callback → мгновенное Telegram-уведомление.
6. Переадресация Moldcell включена — боевой звонок на 060401010 попадает на бота.

## Ручные шаги пользователя (без них не взлетит)

1. **ElevenLabs**: аккаунт, план с Conversational AI, API-ключ → в `.env`.
2. **Zadarma**: аккаунт, баланс, SIP-креды (сервер/логин/пароль), номер → мне.
3. **Moldcell**: переадресация 060401010 → номер Zadarma (последний шаг, после тестов).

## Вне объёма этой итерации

- Исходящие звонки (claim-then-dial, ретраи, лимиты).
- Custom LLM (используется встроенный Haiku 4.5).
- Админ-UI для управления агентом и историей звонков.
- SIP-перевод на живого оператора (`transfer_to_number`) — нет второй линии.
