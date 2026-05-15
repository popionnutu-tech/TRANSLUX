# Compact Daily Digest + ANTA Weekly Report

**Data:** 2026-05-15
**Scop:** Două modificări la botul Telegram TRANSLUX:
1. Dnevnoi дайджест нарушений — отправлять раз в день компактным сообщением вместо real-time обновлений
2. Еженедельный отчёт объявлений ANTA — парсить сайт и отправлять список новых объявлений

---

## 1. Компактный дневной дайджест

### Текущее поведение
- `dailyDigest.ts` → при каждом нарушении вызывает `sendOrEditDigest()`
- Бот отправляет или редактирует сообщение в реальном времени
- State хранится в Supabase Storage: `report-photos/digest/{date}.json`
- State включает `violations[]` и `messageIds{}` (для edit)

### Новое поведение
- `addViolationAndUpdate()` → только копит нарушения в Storage, без отправки
- Новая функция `sendCompactDigest()` — отправляет одно финальное сообщение
- Вызывается cron-джобом в **20:30 Europe/Chisinau**
- Если нарушений 0 — ничего не отправляем
- `messageIds` убираем из state — больше нет редактирования

### Формат сообщения
```
📋 Raport 15.05 — 3 încălcări din 26 rapoarte
Chișinău: 2 (locație: 1, întârziere: 1)
Bălți: 1 (locație: 1)
```

- По одной строке на каждый пункт (Chișinău / Bălți)
- В скобках — тип нарушения и количество: `locație` (неверное место), `întârziere` (опоздание)
- Если у пункта нет нарушений — строку не выводим
- Общее количество раpoarte берём из БД (`reports` за сегодня)

### Изменяемые файлы
- `apps/bot/src/services/dailyDigest.ts` — убрать send/edit из `addViolationAndUpdate`, добавить `sendCompactDigest()`, убрать `messageIds` из DigestState
- `apps/bot/src/scheduler.ts` — добавить cron для дайджеста (20:30)

---

## 2. Еженедельный отчёт ANTA

### Описание
Каждый понедельник в 08:00 (вместе с основным weekly report) бот парсит страницу `https://anta.gov.md/anunturi/`, собирает объявления за прошлую неделю (пн–вс) и отправляет список админам.

### Парсинг
- fetch HTML первой страницы `anta.gov.md/anunturi/`
- Первая страница содержит ~20 объявлений — достаточно для покрытия недели
- Структура каждого объявления на странице:
  - Текстовый узел: `"12.05.2026 | Anunțuri"`
  - `<h2>` с `<a href="...">Заголовок</a>`
- Парсим regex-ом: извлекаем дату (DD.MM.YYYY) и заголовок
- Фильтруем по диапазону прошлой недели (пн–вс)
- Без внешних зависимостей (cheerio не нужен)

### Формат сообщения
```
📢 ANTA — Anunțuri săptămânale
📅 08.05 — 14.05.2026

• 12.05 — ANTA intensifică relațiile de colaborare cu autoritățile din Armenia
• 12.05 — Progresele în cooperarea moldo-suedeză - discutate la Summitul ITF 2026
• 07.05 — Anunț privind consultarea publică a proiectului Ordinului ANTA...

Total: 3 anunțuri
```

Если объявлений нет:
```
📢 ANTA — Anunțuri săptămânale
📅 08.05 — 14.05.2026

✅ Nicio publicație nouă în această perioadă.
```

### Обработка ошибок
- Если fetch не удался (сайт недоступен, таймаут) — логируем ошибку, не отправляем сообщение (silent fail)
- Таймаут fetch: 15 секунд

### Изменяемые файлы
- `apps/bot/src/services/antaReport.ts` — **новый файл**: `fetchAntaAnnouncements()`, `sendAntaWeeklyReport()`
- `apps/bot/src/scheduler.ts` — вызвать `sendAntaWeeklyReport()` после `sendWeeklyReport()` в weekly cron

---

## Расписание (итого)

| Что | Когда | Механизм |
|-----|-------|----------|
| Компактный дайджест | Ежедневно 20:30 Chisinau | Новый cron в scheduler.ts |
| Weekly report (существующий) | Понедельник 08:00 Chisinau | Существующий cron |
| ANTA отчёт (новый) | Понедельник 08:00 Chisinau | Вызов из существующего weekly cron, сразу после sendWeeklyReport() |

Получатели всех отчётов: пользователи с `role=ADMIN` и `telegram_id`.

## Файлы

| Файл | Действие |
|------|----------|
| `apps/bot/src/services/dailyDigest.ts` | Рефакторинг: убрать real-time отправку, добавить `sendCompactDigest()` |
| `apps/bot/src/services/antaReport.ts` | Новый файл: парсинг + отправка |
| `apps/bot/src/scheduler.ts` | Добавить daily digest cron (20:30), добавить вызов ANTA в weekly cron |
