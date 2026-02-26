# TRANSLUX

Sistem de monitorizare transport — Telegram bot + Web dashboard.

## Structura

```
apps/web/    — Next.js admin dashboard (Vercel)
apps/bot/    — Telegram bot cu grammY (Node.js, long polling)
packages/db/ — Migrații SQL, tipuri TypeScript, seed
```

## Cerințe

- Node.js >= 18
- Cont Supabase (Postgres + Storage)
- Token Telegram bot de la @BotFather

## Setup

### 1. Configurare Supabase

1. Creează un proiect nou pe [supabase.com](https://supabase.com)
2. Rulează migrația din `packages/db/migrations/001_initial_schema.sql` în SQL Editor
3. Creează un bucket Storage numit `report-photos` (privat)
4. Copiază URL, anon key și service key

### 2. Configurare Telegram Bot

1. Deschide @BotFather în Telegram
2. `/newbot` → urmează instrucțiunile
3. Copiază token-ul botului

### 3. Variabile de mediu

```bash
cp .env.example .env
# Editează .env cu valorile tale
```

### 4. Instalare dependențe

```bash
npm install
```

### 5. Seed baza de date

```bash
npm run db:seed
```

Aceasta creează:
- Cont admin (email/parolă din .env)
- 5 rute
- 8 șoferi
- Curse pentru fiecare rută (ambele direcții, 8 ore/zi)

### 6. Pornire

**Web dashboard:**
```bash
npm run dev:web
# → http://localhost:3000
```

**Telegram bot:**
```bash
npm run dev:bot
```

## Deployment

### Web (Vercel)

1. Push la GitHub
2. Import în Vercel
3. Root directory: `apps/web`
4. Adaugă variabilele de mediu în Vercel dashboard

### Bot

Rulează ca proces Node.js separat (VPS, Railway, Fly.io, etc.):

```bash
cd apps/bot
npm run build
node dist/index.js
```

## Variabile de mediu

| Variabilă | Descriere |
|---|---|
| `SUPABASE_URL` | URL proiect Supabase |
| `SUPABASE_ANON_KEY` | Cheie anonimă Supabase |
| `SUPABASE_SERVICE_KEY` | Cheie service role Supabase |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `AUTH_SECRET` | Secret pentru JWT (min 32 caractere) |
| `ADMIN_EMAIL` | Email admin inițial |
| `ADMIN_PASSWORD` | Parolă admin inițial (doar pentru seed) |
| `NEXT_PUBLIC_BOT_USERNAME` | Username-ul botului (fără @) |
| `TZ` | Timezone: `Europe/Chisinau` |
