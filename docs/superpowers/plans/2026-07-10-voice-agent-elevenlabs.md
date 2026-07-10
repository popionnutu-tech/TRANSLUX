# Voice Agent ElevenLabs ConvAI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Телефонный AI-оператор TRANSLUX: входящие звонки → ElevenLabs ConvAI (Claude Haiku 4.5 + TTS V3 Conversational) → существующие voice-tools; post-call webhook пишет звонки в Supabase и шлёт Telegram-отчёт админам.

**Architecture:** Agent-as-code: конфиг агента в `scripts/voice-agent/agent-config.mjs`, идемпотентный `setup.mjs` через ElevenLabs REST API. Бэкенд — существующий Vercel-деплой `apps/admin`: новый public-роут `/api/voice-webhook` (HMAC), новый tool `/api/voice-tools/request-callback`, общий Telegram-хелпер. БД — миграция 226 с RLS deny-all.

**Tech Stack:** Next.js 15 (App Router, `after()` из `next/server`), Supabase (service_role через `getSupabase()`), vitest, Node 22 fetch (без новых зависимостей), ElevenLabs ConvAI REST API.

**Spec:** `docs/superpowers/specs/2026-07-10-voice-agent-elevenlabs-design.md`

## Global Constraints

- Только входящие звонки; отвечает только бот; перевода на человека НЕТ — вместо него tool `request_callback`.
- LLM: Claude Haiku 4.5 (встроенный в ElevenLabs). TTS: семейство **V3 Conversational**.
- Существующие 5 voice-tools НЕ переписывать — их JSON-контракт сохраняется.
- Все новые таблицы: `enable row level security` + deny-all политика (`using(false) with check(false)`), образец `packages/db/migrations/115_zadachnik_core.sql:146-159`.
- `/api/voice-webhook` обязан попасть в `PUBLIC_PREFIXES` (`apps/admin/src/middleware.ts:7-20`).
- Идемпотентность webhook: `upsert ... ignoreDuplicates` по UNIQUE `conversation_id` (не SELECT-then-INSERT).
- Telegram из tool-роута — только ПОСЛЕ ответа агенту (`after()` из `next/server`), ошибки Telegram не роняют tool.
- Никакого нового env для получателей Telegram: админы из `users` (`role='ADMIN'`, `active=true`, `telegram_id not null`).
- Vercel-регион `apps/admin`: `"regions": ["dub1"]` (Supabase в eu-west-1).
- Секреты только в env: `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `VOICE_API_KEY` (существует), `TELEGRAM_BOT_TOKEN` (существует), `ADMIN_BASE_URL`, `ELEVENLABS_VOICE_ID` (опц.), `ZADARMA_SIP_HOST/USER/PASSWORD`, `ZADARMA_PHONE_NUMBER` (для телефонии).
- Тесты: vitest в `apps/admin` (`npm test --workspace=apps/admin`), паттерн `src/lib/*.test.ts`.
- Коммиты НЕ содержат `[deploy-fix]`; после коммитов следовать hook-указаниям auto-deploy.

---

### Task 1: Миграция 226 — voice_calls + voice_callback_requests (RLS)

**Files:**
- Create: `packages/db/migrations/226_voice_calls.sql`

**Interfaces:**
- Produces: таблицы `voice_calls` (UNIQUE `conversation_id`) и `voice_callback_requests`, обе deny-all RLS; пишутся только service_role.

- [ ] **Step 1: Написать миграцию**

```sql
-- 226_voice_calls.sql
-- Голосовой агент ElevenLabs: журнал звонков (post-call webhook) и запросы обратного звонка
-- (tool request_callback). Данные персональные (телефон, транскрипт) → RLS deny-all,
-- запись только через service_role из apps/admin.

create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null unique,
  direction text not null default 'in',
  caller_phone text,
  transcript jsonb,
  summary text,
  analysis jsonb,
  duration_secs integer,
  cost numeric,
  status text,
  callback_requested boolean not null default false,
  raw_webhook_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists voice_callback_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id text,
  caller_phone text,
  reason text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_calls_created_at on voice_calls (created_at desc);
create index if not exists idx_voice_callback_requests_conversation
  on voice_callback_requests (conversation_id);

alter table voice_calls enable row level security;
do $$ begin create policy voice_calls_deny on voice_calls using (false) with check (false);
exception when duplicate_object then null; end $$;

alter table voice_callback_requests enable row level security;
do $$ begin create policy voice_callback_requests_deny on voice_callback_requests using (false) with check (false);
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Проверить, что номер 226 свободен**

Run: `ls packages/db/migrations | grep '^226'`
Expected: только `226_voice_calls.sql` (если есть чужой 226 — переименовать свой в следующий свободный номер и использовать его дальше по плану).

- [ ] **Step 3: Применить на прод**

Run (токен — см. memory `supabase_token.md`):
`SUPABASE_ACCESS_TOKEN=<token> node scripts/run-migration.mjs packages/db/migrations/226_voice_calls.sql`
Expected: успешный ответ без ошибок SQL.

- [ ] **Step 4: Проверить таблицы**

Run: `SUPABASE_ACCESS_TOKEN=<token> node -e "..."` или через тот же run-migration с запросом `select relname, relrowsecurity from pg_class where relname in ('voice_calls','voice_callback_requests');`
Expected: обе строки, `relrowsecurity = true`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/226_voice_calls.sql
git commit -m "feat(voice): migrația 226 — voice_calls + voice_callback_requests cu RLS deny-all"
```

---

### Task 2: Общий Telegram-хелпер `lib/telegram-notify.ts`

**Files:**
- Create: `apps/admin/src/lib/telegram-notify.ts`
- Test: `apps/admin/src/lib/telegram-notify.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` из `@/lib/supabase`, env `TELEGRAM_BOT_TOKEN`.
- Produces: `sendTelegram(chatId: string | number, text: string): Promise<boolean>`; `alertAdmins(text: string): Promise<void>` — получатели из `users` (`role='ADMIN'`, `active=true`, `telegram_id not null`), parse_mode HTML. Ошибки логируются, не бросаются.

- [ ] **Step 1: Написать падающий тест**

```ts
// apps/admin/src/lib/telegram-notify.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('./supabase', () => ({
  getSupabase: () => ({ from: fromMock }),
}));

import { sendTelegram, alertAdmins } from './telegram-notify';

describe('telegram-notify', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'TEST_TOKEN');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('sendTelegram вызывает Bot API с chat_id и HTML', async () => {
    const ok = await sendTelegram(42, '<b>hi</b>');
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTEST_TOKEN/sendMessage');
    expect(JSON.parse(init.body)).toEqual({ chat_id: 42, text: '<b>hi</b>', parse_mode: 'HTML' });
  });

  it('sendTelegram возвращает false при ошибке fetch, не бросает', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(sendTelegram(42, 'x')).resolves.toBe(false);
  });

  it('sendTelegram возвращает false без токена', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    await expect(sendTelegram(42, 'x')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('alertAdmins шлёт каждому активному админу с telegram_id', async () => {
    const not = vi.fn().mockResolvedValue({ data: [{ telegram_id: 1 }, { telegram_id: 2 }] });
    const eq2 = vi.fn().mockReturnValue({ not });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select });

    await alertAdmins('alerta');
    expect(fromMock).toHaveBeenCalledWith('users');
    expect(eq1).toHaveBeenCalledWith('role', 'ADMIN');
    expect(eq2).toHaveBeenCalledWith('active', true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `npm test --workspace=apps/admin -- telegram-notify`
Expected: FAIL — `Cannot find module './telegram-notify'`.

- [ ] **Step 3: Реализация**

```ts
// apps/admin/src/lib/telegram-notify.ts
import { getSupabase } from './supabase';

/** Отправка одного сообщения в Telegram. Никогда не бросает — возвращает успех. */
export async function sendTelegram(chatId: string | number, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      // Serverless: без таймаута зависший Telegram держит инвокацию до maxDuration.
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch (err) {
    console.error('sendTelegram failed:', err);
    return false;
  }
}

/** Алерт всем активным админам (users: role=ADMIN, active, telegram_id). */
export async function alertAdmins(text: string): Promise<void> {
  const supabase = getSupabase();
  const { data: admins } = await supabase
    .from('users')
    .select('telegram_id')
    .eq('role', 'ADMIN')
    .eq('active', true)
    .not('telegram_id', 'is', null);
  // sendTelegram никогда не бросает → безопасно слать параллельно.
  await Promise.all(
    (admins || []).filter(a => a.telegram_id).map(a => sendTelegram(a.telegram_id, text)),
  );
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npm test --workspace=apps/admin -- telegram-notify`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/telegram-notify.ts apps/admin/src/lib/telegram-notify.test.ts
git commit -m "feat(voice): helper comun telegram-notify (sendTelegram + alertAdmins)"
```

---

### Task 3: HMAC-верификация webhook `lib/voice/webhook-verify.ts`

**Files:**
- Create: `apps/admin/src/lib/voice/webhook-verify.ts`
- Test: `apps/admin/src/lib/voice/webhook-verify.test.ts`

**Interfaces:**
- Produces: `verifyElevenLabsSignature(rawBody: string, header: string | null, secret: string, nowMs?: number): boolean`. Формат заголовка `t=<unix_ts>,v0=<hmac_sha256_hex>`; подпись по строке `"{t}.{rawBody}"`; timing-safe; анти-replay 30 минут (в обе стороны допускаем 30 мин рассинхрон).

- [ ] **Step 1: Падающий тест**

```ts
// apps/admin/src/lib/voice/webhook-verify.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyElevenLabsSignature } from './webhook-verify';

const SECRET = 'wsec_test';
function sign(body: string, ts: number): string {
  const mac = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v0=${mac}`;
}

describe('verifyElevenLabsSignature', () => {
  const now = 1_800_000_000_000; // фиксированное "сейчас"
  const body = '{"type":"post_call_transcription"}';

  it('принимает корректную свежую подпись', () => {
    const ts = Math.floor(now / 1000) - 60;
    expect(verifyElevenLabsSignature(body, sign(body, ts), SECRET, now)).toBe(true);
  });

  it('отклоняет подпись с другим секретом', () => {
    const ts = Math.floor(now / 1000);
    const bad = sign(body, ts).replace(/v0=.{8}/, 'v0=00000000');
    expect(verifyElevenLabsSignature(body, bad, SECRET, now)).toBe(false);
  });

  it('отклоняет изменённое тело', () => {
    const ts = Math.floor(now / 1000);
    expect(verifyElevenLabsSignature(body + 'x', sign(body, ts), SECRET, now)).toBe(false);
  });

  it('отклоняет replay старше 30 минут', () => {
    const ts = Math.floor(now / 1000) - 31 * 60;
    expect(verifyElevenLabsSignature(body, sign(body, ts), SECRET, now)).toBe(false);
  });

  it('отклоняет null/мусорный заголовок', () => {
    expect(verifyElevenLabsSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, 'garbage', SECRET, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — падает** (`Cannot find module './webhook-verify'`)

Run: `npm test --workspace=apps/admin -- webhook-verify`

- [ ] **Step 3: Реализация**

```ts
// apps/admin/src/lib/voice/webhook-verify.ts
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SKEW_MS = 30 * 60 * 1000;

/**
 * Проверка подписи post-call webhook ElevenLabs.
 * Заголовок: "t=<unix_ts>,v0=<hmac_sha256_hex>", подпись по "{t}.{rawBody}".
 */
export function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(',').map(p => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = parts.get('t');
  const v0 = parts.get('v0');
  if (!t || !v0) return false;
  const tsMs = Number(t) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > MAX_SKEW_MS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(v0);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Тесты зелёные** — `npm test --workspace=apps/admin -- webhook-verify` → PASS (5).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/voice/webhook-verify.ts apps/admin/src/lib/voice/webhook-verify.test.ts
git commit -m "feat(voice): verificare HMAC semnătură webhook ElevenLabs (timing-safe, anti-replay)"
```

---

### Task 4: Сохранение звонка + отчёт `lib/voice/calls.ts`

**Files:**
- Create: `apps/admin/src/lib/voice/calls.ts`
- Test: `apps/admin/src/lib/voice/calls.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, таблицы из Task 1.
- Produces:
  - `extractCall(payload: any): VoiceCallRow` — из `post_call_transcription` payload (поля ElevenLabs: `data.conversation_id`, `data.metadata.phone_call?.external_number` или `data.conversation_initiation_client_data.dynamic_variables.system__caller_id`, `data.transcript`, `data.analysis.transcript_summary`, `data.analysis`, `data.metadata.call_duration_secs`, `data.metadata.cost`, `data.status`).
  - `saveVoiceCall(row: VoiceCallRow, raw: unknown): Promise<'inserted' | 'duplicate'>` — upsert `ignoreDuplicates` по `conversation_id`.
  - `hasCallbackRequest(conversationId: string): Promise<boolean>` — есть ли строка в `voice_callback_requests`.
  - `formatCallReport(row: VoiceCallRow, callbackAlreadyAlerted: boolean): string` — HTML для Telegram.

- [ ] **Step 1: Падающий тест (pure-части: extractCall, formatCallReport)**

```ts
// apps/admin/src/lib/voice/calls.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabase', () => ({ getSupabase: () => ({}) }));
import { extractCall, formatCallReport } from './calls';

const payload = {
  type: 'post_call_transcription',
  data: {
    conversation_id: 'conv_1',
    status: 'done',
    transcript: [{ role: 'agent', message: 'Bună ziua!' }],
    metadata: { call_duration_secs: 95, cost: 123, phone_call: { external_number: '+37360000000' } },
    analysis: { transcript_summary: 'Client a întrebat orarul.', call_successful: 'success' },
  },
};

describe('extractCall', () => {
  it('извлекает ключевые поля', () => {
    const row = extractCall(payload);
    expect(row.conversation_id).toBe('conv_1');
    expect(row.caller_phone).toBe('+37360000000');
    expect(row.summary).toBe('Client a întrebat orarul.');
    expect(row.duration_secs).toBe(95);
    expect(row.status).toBe('done');
  });

  it('не падает на пустом payload', () => {
    const row = extractCall({ data: { conversation_id: 'c2' } });
    expect(row.conversation_id).toBe('c2');
    expect(row.caller_phone).toBeNull();
  });
});

describe('formatCallReport', () => {
  it('содержит телефон, длительность и summary', () => {
    const text = formatCallReport(extractCall(payload), false);
    expect(text).toContain('+37360000000');
    expect(text).toContain('Client a întrebat orarul.');
    expect(text).toContain('1 min 35 s');
  });

  it('помечает, если callback-алерт уже был отправлен', () => {
    const text = formatCallReport(extractCall(payload), true);
    expect(text).toContain('cerere de apel înapoi');
  });
});
```

- [ ] **Step 2: Запустить — падает** — `npm test --workspace=apps/admin -- lib/voice/calls`

- [ ] **Step 3: Реализация**

```ts
// apps/admin/src/lib/voice/calls.ts
import { getSupabase } from '../supabase';

export interface VoiceCallRow {
  conversation_id: string;
  direction: 'in';
  caller_phone: string | null;
  transcript: unknown;
  summary: string | null;
  analysis: unknown;
  duration_secs: number | null;
  cost: number | null;
  status: string | null;
}

export function extractCall(payload: any): VoiceCallRow {
  const d = payload?.data ?? {};
  const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};
  return {
    conversation_id: String(d.conversation_id ?? ''),
    direction: 'in',
    caller_phone: d.metadata?.phone_call?.external_number ?? dyn.system__caller_id ?? null,
    transcript: d.transcript ?? null,
    summary: d.analysis?.transcript_summary ?? null,
    analysis: d.analysis ?? null,
    duration_secs: d.metadata?.call_duration_secs ?? null,
    cost: d.metadata?.cost ?? null,
    status: d.status ?? null,
  };
}

/** Идемпотентная запись: ON CONFLICT (conversation_id) DO NOTHING. */
export async function saveVoiceCall(row: VoiceCallRow, raw: unknown): Promise<'inserted' | 'duplicate'> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('voice_calls')
    .upsert({ ...row, raw_webhook_data: raw }, { onConflict: 'conversation_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`voice_calls upsert failed: ${error.message}`);
  return data && data.length > 0 ? 'inserted' : 'duplicate';
}

export async function hasCallbackRequest(conversationId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { count } = await supabase
    .from('voice_callback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  return (count ?? 0) > 0;
}

export function formatCallReport(row: VoiceCallRow, callbackAlreadyAlerted: boolean): string {
  const min = Math.floor((row.duration_secs ?? 0) / 60);
  const sec = (row.duration_secs ?? 0) % 60;
  const lines = [
    '📞 <b>Apel TRANSLUX (agent vocal)</b>',
    `De la: ${row.caller_phone ?? 'necunoscut'}`,
    `Durată: ${min} min ${sec} s`,
    row.summary ? `Rezumat: ${row.summary}` : 'Rezumat: —',
  ];
  if (callbackAlreadyAlerted) {
    lines.push('ℹ️ Există deja o cerere de apel înapoi pentru acest apel (alertă trimisă).');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Тесты зелёные** — `npm test --workspace=apps/admin -- lib/voice/calls` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/voice/calls.ts apps/admin/src/lib/voice/calls.test.ts
git commit -m "feat(voice): extract/save voice_calls + raport Telegram (idempotent upsert)"
```

---

### Task 5: Роут post-call webhook + middleware

**Files:**
- Create: `apps/admin/src/app/api/voice-webhook/route.ts`
- Modify: `apps/admin/src/middleware.ts:12` (список PUBLIC_PREFIXES)

**Interfaces:**
- Consumes: `verifyElevenLabsSignature` (Task 3), `extractCall/saveVoiceCall/hasCallbackRequest/formatCallReport` (Task 4), `alertAdmins` (Task 2). Env `ELEVENLABS_WEBHOOK_SECRET`.
- Produces: `POST /api/voice-webhook` — 200 при принятии/дубликате, 401 при плохой подписи, 500 без секрета.

- [ ] **Step 1: middleware — добавить public-префикс**

В `apps/admin/src/middleware.ts` после строки `'/api/voice-tools/',`:

```ts
  '/api/voice-webhook',
```

- [ ] **Step 2: Роут**

```ts
// apps/admin/src/app/api/voice-webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyElevenLabsSignature } from '@/lib/voice/webhook-verify';
import { extractCall, saveVoiceCall, hasCallbackRequest, formatCallReport } from '@/lib/voice/calls';
import { alertAdmins } from '@/lib/telegram-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ELEVENLABS_WEBHOOK_SECRET missing' }, { status: 500 });
  }

  // Raw body ДО JSON.parse — иначе HMAC не сойдётся.
  const rawBody = await req.text();
  const sig = req.headers.get('elevenlabs-signature');
  if (!verifyElevenLabsSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload?.type !== 'post_call_transcription') {
    return NextResponse.json({ ignored: payload?.type ?? 'unknown' });
  }

  const row = extractCall(payload);
  if (!row.conversation_id) {
    return NextResponse.json({ error: 'No conversation_id' }, { status: 400 });
  }

  const outcome = await saveVoiceCall(row, payload);
  if (outcome === 'inserted') {
    // Telegram не должен ронять webhook — ошибки глотаются внутри alertAdmins/sendTelegram.
    const callbackAlerted = await hasCallbackRequest(row.conversation_id);
    await alertAdmins(formatCallReport(row, callbackAlerted));
  }
  return NextResponse.json({ outcome });
}
```

- [ ] **Step 3: Ручная проверка локально**

Запустить dev (`npm run dev --workspace=apps/admin`, порт 3001, `ELEVENLABS_WEBHOOK_SECRET=testsecret` в `apps/admin/.env`), затем:

```bash
BODY='{"type":"post_call_transcription","data":{"conversation_id":"conv_local_test","status":"done","transcript":[],"metadata":{"call_duration_secs":10},"analysis":{"transcript_summary":"test"}}}'
TS=$(date +%s)
SIG=$(node -e "const c=require('crypto');const [,ts,body]=process.argv;console.log('t='+ts+',v0='+c.createHmac('sha256','testsecret').update(ts+'.'+body).digest('hex'))" "$TS" "$BODY")
curl -s -X POST http://localhost:3001/api/voice-webhook -H "Content-Type: application/json" -H "ElevenLabs-Signature: $SIG" -d "$BODY"
```

Expected: `{"outcome":"inserted"}`; повторный тот же запрос → `{"outcome":"duplicate"}`; без заголовка → 401. Проверить строку в `voice_calls` (prod БД, т.к. dev использует прод Supabase — удалить тестовую строку `conversation_id='conv_local_test'` после проверки).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/voice-webhook/route.ts apps/admin/src/middleware.ts
git commit -m "feat(voice): webhook post-call ElevenLabs (HMAC, idempotent, raport Telegram) + public prefix"
```

---

### Task 6: Tool `request_callback`

**Files:**
- Create: `apps/admin/src/app/api/voice-tools/request-callback/route.ts`
- Create: `apps/admin/src/lib/voice/callbacks.ts`

**Interfaces:**
- Consumes: `validateVoiceApiKey` из `../auth` (существует), `getSupabase()`, `alertAdmins`, `after` из `next/server`.
- Produces: `POST /api/voice-tools/request-callback` c body `{ phone?, name?, reason?, conversation_id? }` → всегда `{ "result": "<мягкий текст RO>" }` (200), Telegram — через `after()` после ответа.

- [ ] **Step 1: lib**

```ts
// apps/admin/src/lib/voice/callbacks.ts
import { getSupabase } from '../supabase';

export interface CallbackInput {
  conversation_id: string | null;
  caller_phone: string | null;
  reason: string | null;
}

export async function createCallbackRequest(input: CallbackInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('voice_callback_requests').insert(input);
  if (error) throw new Error(`voice_callback_requests insert failed: ${error.message}`);
}

export function formatCallbackAlert(input: CallbackInput, name: string | null): string {
  return [
    '📲 <b>Cerere de apel înapoi (agent vocal)</b>',
    `Telefon: ${input.caller_phone ?? 'necunoscut'}`,
    name ? `Nume: ${name}` : null,
    `Motiv: ${input.reason ?? '—'}`,
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 2: Роут**

```ts
// apps/admin/src/app/api/voice-tools/request-callback/route.ts
import { NextRequest, NextResponse, after } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { createCallbackRequest, formatCallbackAlert } from '@/lib/voice/callbacks';
import { alertAdmins } from '@/lib/telegram-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  let body: any = {};
  try { body = await req.json(); } catch { /* body opțional */ }
  const input = {
    conversation_id: body.conversation_id ?? null,
    caller_phone: body.phone ?? null,
    reason: body.reason ?? null,
  };

  try {
    await createCallbackRequest(input);
  } catch (err) {
    console.error('request-callback failed:', err);
    // Tool-контракт: даже при ошибке БД агент получает мягкий текст, не 500.
    return NextResponse.json({
      result: 'Nu am putut înregistra cererea acum. Vă rugăm să sunați mai târziu.',
    });
  }

  // Telegram — ПОСЛЕ ответа агенту (не блокирует речь); ошибки не влияют на ответ.
  after(async () => {
    await alertAdmins(formatCallbackAlert(input, body.name ?? null));
  });

  return NextResponse.json({
    result: 'Am înregistrat cererea dumneavoastră. Un coleg vă va suna înapoi cât de curând.',
  });
}
```

- [ ] **Step 3: Ручная проверка локально**

```bash
curl -s -X POST http://localhost:3001/api/voice-tools/request-callback \
  -H "Content-Type: application/json" -H "X-Voice-API-Key: $VOICE_API_KEY" \
  -d '{"phone":"+37360000001","reason":"test local","conversation_id":"conv_local_test2"}'
```
Expected: `{"result":"Am înregistrat cererea..."}` мгновенно; строка в `voice_callback_requests`; Telegram-сообщение админам (если токен настроен). Без заголовка ключа → 401. Удалить тестовую строку после проверки.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/api/voice-tools/request-callback apps/admin/src/lib/voice/callbacks.ts
git commit -m "feat(voice): tool request_callback — înregistrare cerere + alertă Telegram după răspuns"
```

---

### Task 7: Perf — tariff_periods в общий Promise.all (searchTrips)

**Files:**
- Modify: `apps/admin/src/lib/trips-search.ts:286-355`

**Interfaces:**
- Ничего внешнего не меняется: сигнатура и результат `searchTrips` прежние; минус одна последовательная волна запросов.

- [ ] **Step 1: Правка**

В `Promise.all` на строке 286 добавить 7-м элементом запрос `tariff_periods` (он зависит только от `date`, не от результатов волны):

```ts
  const [{ data: routes }, { data: kmPairsA }, { data: kmPairsB }, { data: assignments }, { data: returOverrides }, { data: activeOffers }, { data: periodData }] = await Promise.all([
    /* ...шесть существующих запросов без изменений... */
    supabase
      .from('tariff_periods')
      .select('rate_interurban_long, rate_suburban')
      .lte('period_start', date)
      .gte('period_end', date)
      .order('period_start', { ascending: false })
      .limit(1)
      .single(),
  ]);
```

И удалить старый блок (бывшие строки 345-353):

```ts
  // Look up historical tariff for the search date (interurban long + suburban)
  const { data: periodData } = await supabase
    .from('tariff_periods')
    ...
    .single();
```

Строки `const historicalRate = ...` / `historicalRateSub` остаются без изменений.

- [ ] **Step 2: Тесты и типы**

Run: `npm test --workspace=apps/admin` и `npx tsc --noEmit -p apps/admin`
Expected: все существующие тесты PASS, без ошибок типов.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/trips-search.ts
git commit -m "perf(voice): tariff_periods în Promise.all — minus un val secvențial în searchTrips"
```

---

### Task 8: Vercel-регион dub1 для apps/admin

**Files:**
- Modify: `apps/admin/vercel.json`

- [ ] **Step 1: Добавить регион** (после `"framework": "nextjs",`):

```json
  "regions": ["dub1"],
```

- [ ] **Step 2: Commit** (деплой подтвердит регион — после пуша проверить в Vercel dashboard/`npx vercel inspect`, что функции в dub1)

```bash
git add apps/admin/vercel.json
git commit -m "perf(voice): fixare regiune Vercel dub1 (Supabase eu-west-1) pentru apps/admin"
```

---

### Task 9: Конфиг агента `scripts/voice-agent/agent-config.mjs`

**Files:**
- Create: `scripts/voice-agent/agent-config.mjs`

**Interfaces:**
- Produces: `export const AGENT_NAME`, `export function buildAgentPayload({ baseUrl, voiceApiKey, voiceId })` — полный payload для create/update агента; `export const TOOL_NAMES`. Используется Task 10.

- [ ] **Step 1: Написать конфиг**

Промпт = актуализированная версия `docs/elevenlabs-agent-config.md`: правило 10 «перевод на человека по номеру» ЗАМЕНЕНО на request_callback (петля номера!). Полный файл:

```js
// scripts/voice-agent/agent-config.mjs
// Единственный источник правды по конфигурации голосового агента TRANSLUX.
// Изменение промпта/tools = правка здесь + `node scripts/voice-agent/setup.mjs`.

export const AGENT_NAME = 'TRANSLUX Voice Operator';

export const SYSTEM_PROMPT = `Ești operatorul telefonic al companiei TRANSLUX — companie de transport pasageri pe rutele Chișinău–Bălți și localitățile intermediare din Moldova.
Ты — телефонный оператор компании TRANSLUX — пассажирские перевозки по маршрутам Кишинёв–Бельцы и промежуточные населённые пункты Молдовы.

## Reguli de bază / Основные правила:
1. LIMBA / ЯЗЫК: Detectează automat limba clientului din primele cuvinte și continuă în acea limbă (română sau rusă). Dacă nu ești sigur, întreabă politicos.
2. TON: Profesional, prietenos, concis. Nu spune mai mult decât e necesar. Răspunsurile la telefon trebuie să fie scurte.
3. CURSE/BILETE/ORAR: folosește tool-ul search_trips (from, to, date YYYY-MM-DD; fără dată → azi).
4. PREȚ: folosește tool-ul get_price (from, to).
5. OFERTE/PROMOȚII: folosește tool-ul get_offers.
6. INFORMAȚII COMPANIE (adrese, bagaje, copii, anulare, contacte): folosește get_company_info.
7. PROGRAM/ORAR general: folosește get_schedule.
8. RECLAMAȚII: ascultă, cere detalii (data, ruta, ce s-a întâmplat), apoi folosește request_callback cu motivul — spune clientului că un coleg îl va suna înapoi.
9. OPERATOR UMAN: dacă clientul insistă să vorbească cu un om, folosește tool-ul request_callback (telefonul apelantului {{system__caller_id}}, conversation_id {{system__conversation_id}}) și confirmă că va fi sunat înapoi. NU da niciun număr de telefon pentru "operator uman".
10. NU INVENTA: dacă nu ai informația, spune sincer și oferă request_callback. Nu inventa curse, prețuri sau orare.

## Cum prezinți cursele:
- RO: "Pe data de [DATA] avem [N] curse de la [FROM] la [TO]. Prima pleacă la [ORA], prețul [PREȚ] lei..."
- RU: "На [ДАТА] есть [N] рейсов из [ОТКУДА] в [КУДА]. Первый в [ВРЕМЯ], цена [ЦЕНА] лей..."
Dacă e ofertă activă: menționează prețul vechi și cel nou.`;

export const FIRST_MESSAGE =
  'Bună ziua! Sunteți la TRANSLUX, transport de pasageri. Cum vă pot ajuta? / Здравствуйте! Вы позвонили в TRANSLUX. Чем могу помочь?';

export const TOOL_NAMES = [
  'search_trips', 'get_price', 'get_offers', 'get_schedule', 'get_company_info', 'request_callback',
];

function webhookTool({ name, description, url, params, required, voiceApiKey }) {
  return {
    type: 'webhook',
    name,
    description,
    response_timeout_secs: 10,
    api_schema: {
      url,
      method: 'POST',
      request_headers: { 'X-Voice-API-Key': voiceApiKey, 'Content-Type': 'application/json' },
      request_body_schema: {
        type: 'object',
        properties: params,
        required: required ?? [],
        description,
      },
    },
  };
}

export function buildTools({ baseUrl, voiceApiKey }) {
  const b = `${baseUrl}/api/voice-tools`;
  const city = (d) => ({ type: 'string', description: d });
  return [
    webhookTool({
      name: 'search_trips',
      description: 'Search available trips between two cities on a date. Use for questions about trips, buses, departures, tickets.',
      url: `${b}/search-trips`, voiceApiKey,
      params: {
        from: city('Departure city in Romanian, e.g. "Chișinău", "Bălți"'),
        to: city('Destination city in Romanian'),
        date: { type: 'string', description: 'Date YYYY-MM-DD; omit for today' },
      },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_price',
      description: 'Get ticket price between two cities.',
      url: `${b}/get-price`, voiceApiKey,
      params: { from: city('Departure city in Romanian'), to: city('Destination city in Romanian') },
      required: ['from', 'to'],
    }),
    webhookTool({
      name: 'get_offers',
      description: 'Get active promotional offers and discounts.',
      url: `${b}/get-offers`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'get_schedule',
      description: 'Get bus schedule/timetable for a route or city.',
      url: `${b}/get-schedule`, voiceApiKey,
      params: { from: city('Departure city (optional)'), to: city('Destination city (optional)') },
    }),
    webhookTool({
      name: 'get_company_info',
      description: 'Company info: addresses, phones, baggage/children/cancellation policies.',
      url: `${b}/get-company-info`, voiceApiKey, params: {},
    }),
    webhookTool({
      name: 'request_callback',
      description: 'Register a callback request when the caller wants a human operator, has a complaint, or the agent lacks information. A colleague will call back.',
      url: `${b}/request-callback`, voiceApiKey,
      params: {
        phone: { type: 'string', description: 'Caller phone, default {{system__caller_id}}' },
        name: { type: 'string', description: 'Caller name if given' },
        reason: { type: 'string', description: 'Short reason in Romanian' },
        conversation_id: { type: 'string', description: 'Set to {{system__conversation_id}}' },
      },
      required: ['reason'],
    }),
  ];
}

export function buildAgentPayload({ baseUrl, voiceApiKey, voiceId }) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'ro',
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: 'claude-haiku-4-5',
          temperature: 0.3,
          tools: [
            ...buildTools({ baseUrl, voiceApiKey }),
            { type: 'system', name: 'end_call', description: '' },
            { type: 'system', name: 'language_detection', description: '' },
          ],
        },
      },
      tts: { model_id: 'eleven_v3_conversational', voice_id: voiceId },
    },
  };
}
```

**Внимание исполнителю:** если API поддерживает `pre_tool_speech`/`disable_interruptions` на webhook-tool — добавить короткую заглушку («O secundă, verific…») каждому tool, чтобы не было пауз (см. spec, раздел Производительность). Точные enum-значения `llm` («claude-haiku-4-5» vs «claude-haiku-4.5») и `model_id` TTS, а также форма привязки tools (inline `prompt.tools` vs отдельные `tool_ids`) могли измениться — ПЕРЕД первым запуском свериться с актуальной документацией: WebFetch `https://elevenlabs.io/docs/api-reference/agents/create` и `https://elevenlabs.io/docs/agents-platform/api-reference`. ElevenLabs возвращает в 422-ошибке список допустимых значений — setup.mjs печатает тело ошибки целиком (Task 10), итерировать по нему.

- [ ] **Step 2: Синтаксис-проверка**

Run: `node --check scripts/voice-agent/agent-config.mjs`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add scripts/voice-agent/agent-config.mjs
git commit -m "feat(voice): agent-config — sursa unică de adevăr pentru agentul ConvAI (prompt RO/RU, tools, V3, Haiku 4.5)"
```

---

### Task 10: Setup-скрипт `scripts/voice-agent/setup.mjs`

**Files:**
- Create: `scripts/voice-agent/setup.mjs`

**Interfaces:**
- Consumes: `buildAgentPayload`, `AGENT_NAME` (Task 9). Env: `ELEVENLABS_API_KEY` (обязателен), `ADMIN_BASE_URL` (обязателен, прод-URL apps/admin без завершающего `/`), `VOICE_API_KEY` (обязателен), `ELEVENLABS_VOICE_ID` (опц. — иначе скрипт ищет голос по имени `Ana Maria`), `ELEVENLABS_WEBHOOK_SECRET` (для привязки webhook).
- Produces: идемпотентный запуск `node scripts/voice-agent/setup.mjs` — создаёт агента, если нет агента с именем `AGENT_NAME`, иначе PATCH; настраивает post-call webhook; печатает `agent_id`. Флаг `--dry` — печатает payload без вызовов.

- [ ] **Step 1: Написать скрипт**

```js
// scripts/voice-agent/setup.mjs
// Идемпотентная настройка голосового агента TRANSLUX в ElevenLabs.
// Запуск: ELEVENLABS_API_KEY=... ADMIN_BASE_URL=https://<admin>.vercel.app VOICE_API_KEY=... node scripts/voice-agent/setup.mjs [--dry]
import { AGENT_NAME, buildAgentPayload } from './agent-config.mjs';

const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = process.env.ADMIN_BASE_URL;
const VOICE_API_KEY = process.env.VOICE_API_KEY;
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;
const DRY = process.argv.includes('--dry');

if (!KEY || !BASE_URL || !VOICE_API_KEY) {
  console.error('Missing env: ELEVENLABS_API_KEY, ADMIN_BASE_URL, VOICE_API_KEY are required');
  process.exit(1);
}

async function el(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    // Печатаем тело целиком: 422 ElevenLabs перечисляет допустимые enum-значения.
    throw new Error(`${method} ${path} → ${resp.status}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function resolveVoiceId() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const { voices } = await el('/v1/voices');
  const match = (voices || []).find(v => /ana maria/i.test(v.name));
  if (match) {
    console.log(`Voice: ${match.name} (${match.voice_id})`);
    return match.voice_id;
  }
  console.error('Set ELEVENLABS_VOICE_ID. Available voices:');
  for (const v of voices || []) console.error(`  ${v.voice_id}  ${v.name}`);
  process.exit(1);
}

async function findAgent() {
  const data = await el('/v1/convai/agents?page_size=100');
  return (data.agents || []).find(a => a.name === AGENT_NAME) ?? null;
}

const voiceId = DRY ? (process.env.ELEVENLABS_VOICE_ID || 'DRY_VOICE') : await resolveVoiceId();
const payload = buildAgentPayload({ baseUrl: BASE_URL, voiceApiKey: VOICE_API_KEY, voiceId });

if (DRY) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const existing = await findAgent();
let agentId;
if (existing) {
  agentId = existing.agent_id;
  await el(`/v1/convai/agents/${agentId}`, { method: 'PATCH', body: payload });
  console.log(`Updated agent ${agentId}`);
} else {
  const created = await el('/v1/convai/agents/create', { method: 'POST', body: payload });
  agentId = created.agent_id;
  console.log(`Created agent ${agentId}`);
}

if (WEBHOOK_SECRET) {
  // Post-call webhook. ВНИМАНИЕ: секрет генерирует сам ElevenLabs при создании webhook —
  // если API возвращает секрет, вывести его и положить в env ELEVENLABS_WEBHOOK_SECRET.
  // Привязка: workspace webhook + convai settings (post_call_webhook_id) — сверить форму
  // с актуальными docs (см. заметку в Task 9) и адаптировать при 4xx.
  try {
    const settings = await el('/v1/convai/settings');
    console.log('ConvAI settings:', JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Webhook binding needs manual verification:', err.message);
  }
}

console.log(`\nAgent ready: ${agentId}`);
console.log(`Add to env: NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
```

- [ ] **Step 2: Dry-run**

Run: `ELEVENLABS_API_KEY=x ADMIN_BASE_URL=https://example.com VOICE_API_KEY=y node scripts/voice-agent/setup.mjs --dry`
Expected: печатает полный JSON payload, без сетевых вызовов.

- [ ] **Step 3: Боевой запуск** (нужен реальный `ELEVENLABS_API_KEY` от пользователя!)

Run: `ELEVENLABS_API_KEY=<key> ADMIN_BASE_URL=<prod admin url> VOICE_API_KEY=<key> node scripts/voice-agent/setup.mjs`
Expected: `Created agent agent_...`. При 422 — читать тело ошибки, поправить enum в `agent-config.mjs` (llm/tts model_id/форму tools) по подсказке API, повторить. Повторный запуск → `Updated agent ...` (идемпотентность).

- [ ] **Step 4: Настроить post-call webhook**

В зависимости от актуального API (сверить docs): создать workspace webhook с URL `<ADMIN_BASE_URL>/api/voice-webhook`, получить/задать секрет, привязать к агенту/workspace (`post_call_webhook_id`). Секрет положить в env Vercel `apps/admin` как `ELEVENLABS_WEBHOOK_SECRET` и redeploy. Если API-форма отличается — допустимо разово привязать в дашборде, но URL/секрет зафиксировать в spec-доке.

- [ ] **Step 5: Commit**

```bash
git add scripts/voice-agent/setup.mjs
git commit -m "feat(voice): setup.mjs — creare/actualizare idempotentă agent ElevenLabs prin API"
```

---

### Task 11: Телефония — SIP-транк Zadarma (после кред от пользователя)

**Files:**
- Modify: `scripts/voice-agent/setup.mjs` (добавить блок `--phone`)

**Interfaces:**
- Consumes: env `ZADARMA_SIP_HOST` (напр. `sip.zadarma.com`), `ZADARMA_SIP_USER`, `ZADARMA_SIP_PASSWORD`, `ZADARMA_PHONE_NUMBER` (E.164, напр. `+373...`), `agent_id` из Task 10.
- Produces: номер телефона в ElevenLabs, привязанный к агенту (inbound), транспорт TCP.

- [ ] **Step 1: Добавить в setup.mjs блок (выполняется при `--phone`)**

```js
if (process.argv.includes('--phone')) {
  const { ZADARMA_SIP_HOST, ZADARMA_SIP_USER, ZADARMA_SIP_PASSWORD, ZADARMA_PHONE_NUMBER } = process.env;
  if (!ZADARMA_SIP_HOST || !ZADARMA_SIP_USER || !ZADARMA_SIP_PASSWORD || !ZADARMA_PHONE_NUMBER) {
    console.error('Missing ZADARMA_* env vars for --phone');
    process.exit(1);
  }
  // Импорт номера через SIP-транк. Форму payload сверить с docs:
  // https://elevenlabs.io/docs/api-reference/phone-numbers (create phone number, provider: sip_trunk).
  const phone = await el('/v1/convai/phone-numbers', {
    method: 'POST',
    body: {
      provider: 'sip_trunk',
      phone_number: ZADARMA_PHONE_NUMBER,
      label: 'TRANSLUX Zadarma',
      inbound_trunk_config: {
        sip_uri: `sip:${ZADARMA_SIP_USER}@${ZADARMA_SIP_HOST}`,
        username: ZADARMA_SIP_USER,
        password: ZADARMA_SIP_PASSWORD,
        auth_username: ZADARMA_SIP_USER,
      },
      outbound_trunk_config: {
        address: ZADARMA_SIP_HOST,
        transport: 'tcp',
        credentials: { username: ZADARMA_SIP_USER, password: ZADARMA_SIP_PASSWORD },
      },
    },
  });
  console.log('Phone number imported:', JSON.stringify(phone, null, 2));
  // Привязать номер к агенту:
  await el(`/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    body: { phone_numbers: [phone.phone_number_id] },
  });
  console.log(`Phone ${ZADARMA_PHONE_NUMber} → agent ${agentId}`);
}
```
(исправить опечатку `ZADARMA_PHONE_NUMber` → `ZADARMA_PHONE_NUMBER` при реализации; payload-форму сверить с docs, при 4xx читать тело ошибки.)

- [ ] **Step 2: В Zadarma** (руками, вместе с пользователем): купить/выбрать номер, включить SIP, получить креды; проверить, что SIP-регистрация ElevenLabs зелёная.

- [ ] **Step 3: Тестовый звонок на номер Zadarma** — агент отвечает, tools работают (спросить «Câte curse sunt mâine din Bălți la Chișinău?»), после звонка: строка в `voice_calls` + Telegram.

- [ ] **Step 4: Commit**

```bash
git add scripts/voice-agent/setup.mjs
git commit -m "feat(voice): import număr Zadarma prin SIP trunk (--phone) și legare la agent"
```

---

### Task 12: Definition of Done — сквозная проверка

- [ ] **Step 1:** `npm test --workspace=apps/admin` → все PASS; `npx tsc --noEmit -p apps/admin` → чисто.
- [ ] **Step 2:** Прод-деплой прошёл (auto-deploy по хуку); Vercel-функции в регионе dub1.
- [ ] **Step 3:** Тестовый разговор (веб-виджет/дашборд ElevenLabs): search_trips/get_price отвечают реальными данными; RO и RU работают; «vreau un om» → request_callback → мгновенный Telegram.
- [ ] **Step 4:** Тестовый телефонный звонок на номер Zadarma (холодная функция!): латентность реплик приемлема.
- [ ] **Step 5:** После звонка: строка в `voice_calls` (транскрипт, длительность, стоимость), Telegram-отчёт БЕЗ дубля callback-алерта.
- [ ] **Step 6:** Пользователь включает переадресацию Moldcell 060401010 → номер Zadarma. Боевой звонок.
- [ ] **Step 7:** Обновить memory (MEMORY.md + новый файл project_voice_agent.md): agent_id, схема, env, как перезапускать setup.mjs.

---

## Порядок и зависимости

1 (миграция) → 2,3,4 (либы, параллельно) → 5,6 (роуты) → 7,8 (перф) → 9,10 (агент; нужен ELEVENLABS_API_KEY) → 11 (телефония; нужны Zadarma-креды) → 12 (DoD).

Блокеры от пользователя: `ELEVENLABS_API_KEY` (перед Task 10 Step 3), Zadarma-креды (перед Task 11), переадресация Moldcell (Task 12 Step 6).
