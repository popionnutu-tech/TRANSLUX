# @translux/admin

Внутренняя админка TRANSLUX — отдельное Next.js приложение, физически отделённое
от публичного сайта (`apps/web`).

## Что сейчас готово (скаффолд)

- ✅ `package.json`, `next.config.js`, `tsconfig.json`, `postcss.config.mjs`
- ✅ `src/middleware.ts` — JWT-auth для всех маршрутов кроме `/login` и `/api/auth/*`
- ✅ `src/lib/auth.ts` + `src/lib/supabase.ts` — копии из apps/web (используют `SUPABASE_SERVICE_KEY`)
- ✅ `src/app/layout.tsx` — корневой layout с `robots: noindex`
- ✅ `src/app/page.tsx` — корневой редирект по роли
- ✅ `src/app/login/page.tsx` — упрощённая страница логина (плейсхолдер, перенеси полную из `apps/web/src/app/login/page.tsx`)
- ✅ `src/app/api/auth/login/route.ts` и `logout/route.ts` — копии из apps/web
- ✅ `public/robots.txt` с `Disallow: /` + заголовок `X-Robots-Tag: noindex` в `next.config.js`

## Что ещё нужно сделать

### 1. Скопировать остальные модули из apps/web

Перенеси (с заменой импортов `@translux/routing` где нужно):

- `apps/web/src/app/(dashboard)/` → `apps/admin/src/app/(dashboard)/`
- `apps/web/src/app/api/voice-tools/` → `apps/admin/src/app/api/voice-tools/`
- `apps/web/src/app/api/cron/` → `apps/admin/src/app/api/cron/`
- `apps/web/src/app/api/fb-bot/` → `apps/admin/src/app/api/fb-bot/`
- `apps/web/src/app/api/facebook/` → `apps/admin/src/app/api/facebook/`
- `apps/web/src/app/api/tiktok/` → `apps/admin/src/app/api/tiktok/`
- `apps/web/src/app/api/schedule-image/` → `apps/admin/src/app/api/schedule-image/`
- `apps/web/src/app/api/analytics/moneyball/` → `apps/admin/src/app/api/analytics/moneyball/`
- `apps/web/src/components/` → `apps/admin/src/components/` (компоненты которые используются только в dashboard)
- `apps/web/src/lib/{cron-auth,fb-bot,moneyball,operators,schedule-image,update-prices,weather,verificare-auth}.ts` → `apps/admin/src/lib/`
- `apps/web/src/lib/i18n.ts` и `utils.ts` — оставить копии в обоих apps (это маленькие утилиты)

### 2. Заменить импорт `@/lib/assignments` на `@translux/routing`

В перенесённом коде везде где `import { ... } from '@/lib/assignments'` —
поменять на `import { ... } from '@translux/routing'`.

### 3. Установить зависимости

```bash
cd /Users/ionpop/Desktop/TRANSLUX
npm install
npm run build --workspace=packages/routing
npm run build --workspace=packages/db
```

### 4. Запустить локально

```bash
npm run dev --workspace=apps/admin   # стартует на http://localhost:3001
```

Публичный сайт apps/web продолжает работать на :3000 без изменений.

### 5. Деплой на Vercel

- Создать новый Vercel-проект `translux-admin`
- Root Directory: `apps/admin`
- Привязать домен `admin.translux.md` (или другой)
- Скопировать ENV из текущего проекта: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `AUTH_SECRET`, `CRON_SECRET`, `VOICE_API_KEY`, `ANTHROPIC_API_KEY`, и т.д.

### 6. После проверки работы admin app

- Удалить из `apps/web`: `(dashboard)/`, `/login`, `/api/auth/`, `/api/voice-tools/`,
  `/api/cron/`, `/api/fb-bot/`, `/api/facebook/`, `/api/tiktok/`, `/api/schedule-image/`,
  `/api/analytics/moneyball/`
- Удалить из `apps/web/src/lib/`: `auth.ts`, `verificare-auth.ts` (если не нужна публично),
  `cron-auth.ts`, `fb-bot/`, `moneyball/`, `operators.ts`, `schedule-image.ts`,
  `update-prices.ts`, `weather.ts`
- В `apps/web` убрать переменную окружения `SUPABASE_SERVICE_KEY` (на Vercel тоже)
- Переписать `apps/web/src/lib/supabase.ts` на использование `SUPABASE_ANON_KEY`
- В `apps/web` обновить публичный код использовать `public_drivers_view` и
  `public_vehicles_view` вместо прямого доступа к таблицам drivers/vehicles
  (см. миграцию `packages/db/migrations/076_public_anon_access.sql`)

### 7. Двухфакторка (опционально, можно отдельной задачей)

Зависимости `otplib` и `qrcode` уже добавлены в `package.json`.
Реализация:
- Миграция: добавить `totp_secret TEXT NULL` и `totp_enabled BOOLEAN DEFAULT FALSE` в `admin_accounts`
- В `auth.ts`: после успешного `compare(password)` — если `totp_enabled`, выдать короткий JWT с `twofa_verified=false`, иначе сразу полный
- Новая страница `/login/2fa` для ввода 6-значного кода
- API `/api/auth/verify-2fa` для проверки кода через `authenticator.verify(...)` из otplib
- Страница настроек юзера для включения 2FA: показать QR-код через `qrcode.toDataURL(authenticator.keyuri(...))`
