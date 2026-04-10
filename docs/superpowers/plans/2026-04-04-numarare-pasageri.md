# Modul Numărare Pasageri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fast passenger counting module where operators enter total passengers per stop, mark short-distance passengers, and the system auto-calculates fares using dual-tariff pricing.

**Architecture:** Single-page accordion UI at `/numarare`. Server actions fetch route/stop/assignment data from existing tables. New DB tables store counting sessions, per-stop entries, and short passenger records. Calculation runs client-side in real-time, final sums saved server-side.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, Tailwind CSS, server actions pattern (identical to `/assignments` module).

**Spec:** `docs/superpowers/specs/2026-04-04-numarare-pasageri-design.md`

---

## File Structure

```
packages/db/migrations/
  021_numarare_pasageri.sql          — New tables + role + app_config keys

apps/web/src/app/(dashboard)/numarare/
  page.tsx                            — Page wrapper (server component)
  actions.ts                          — Server actions (CRUD, locking, save)
  NumarareClient.tsx                  — Main client component (route list + accordion)
  CountingForm.tsx                    — Tur/Retur stop table with inputs
  ShortPassengerPopup.tsx             — Popup for distributing short passengers
  calculation.ts                      — Pure calculation functions (testable)

apps/web/src/middleware.ts            — Add OPERATOR_CAMERE + ADMIN_CAMERE roles
apps/web/src/lib/auth.ts             — Update AdminRole type
apps/web/src/components/Sidebar.tsx   — Add /numarare nav link
```

---

### Task 1: Database Migration

**Files:**
- Create: `packages/db/migrations/021_numarare_pasageri.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 021_numarare_pasageri.sql
-- Modul numărare pasageri: sesiuni, intrări pe opriri, pasageri scurți

-- 1. Tabele noi

CREATE TABLE counting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_date DATE NOT NULL,
  crm_route_id INT NOT NULL REFERENCES crm_routes(id),
  operator_id UUID NOT NULL REFERENCES admin_accounts(id),
  locked_by UUID REFERENCES admin_accounts(id),
  locked_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'tur_done', 'completed')),
  double_tariff BOOLEAN NOT NULL DEFAULT false,
  tur_total_lei INT,
  retur_total_lei INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(crm_route_id, assignment_date)
);

CREATE TABLE counting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur')),
  stop_order INT NOT NULL,
  stop_name_ro VARCHAR(100) NOT NULL,
  km_from_start DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_passengers INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, direction, stop_order)
);

CREATE TABLE counting_short_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES counting_entries(id) ON DELETE CASCADE,
  boarded_stop_order INT NOT NULL,
  boarded_stop_name_ro VARCHAR(100) NOT NULL,
  km_distance DECIMAL(8,2) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  amount_lei DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counting_sessions_date ON counting_sessions(assignment_date);
CREATE INDEX idx_counting_sessions_route ON counting_sessions(crm_route_id, assignment_date);
CREATE INDEX idx_counting_entries_session ON counting_entries(session_id, direction);

-- 2. Chei noi în app_config pentru tarif dublu

INSERT INTO app_config (key, value)
VALUES 
  ('rate_per_km_long', '0.94'),
  ('rate_per_km_short', '0.94')
ON CONFLICT (key) DO NOTHING;

-- 3. Dacă coloana role nu are valorile noi, actualizăm constraint-ul
-- (admin_accounts.role deja există cu ADMIN, DISPATCHER, GRAFIC)
-- Adăugăm OPERATOR_CAMERE și ADMIN_CAMERE

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  -- Add updated constraint
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
```

- [ ] **Step 2: Run migration**

```bash
# Verifică conexiunea și rulează migrarea
cd /Users/ionpop/Desktop/TRANSLUX
npx supabase db push --db-url "$DATABASE_URL" < packages/db/migrations/021_numarare_pasageri.sql
# Sau manual prin Supabase Dashboard → SQL Editor
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/021_numarare_pasageri.sql
git commit -m "feat(db): add counting_sessions, counting_entries, counting_short_passengers tables"
```

---

### Task 2: Calculation Engine (Pure Functions)

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/calculation.ts`

This is pure logic with no DB dependencies — easy to verify independently.

- [ ] **Step 1: Create calculation module**

```typescript
// calculation.ts
// Logica de calcul sume — funcții pure, fără dependențe externe

export interface StopEntry {
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  shortPassengers: ShortPassengerGroup[];
}

export interface ShortPassengerGroup {
  boardedStopOrder: number;
  boardedStopNameRo: string;
  kmDistance: number;
  passengerCount: number;
}

export interface CalculationResult {
  longSum: number;
  shortSum: number;
  total: number;
  details: TronsonDetail[];
}

export interface TronsonDetail {
  fromStop: string;
  toStop: string;
  km: number;
  longPassengers: number;
  shortInTransit: number;
  tronsonSum: number;
}

/**
 * Calculează suma pentru o direcție (tur sau retur).
 * 
 * Lungi: pe fiecare tronson [oprire_i → oprire_i+1]:
 *   pasageri_lungi = total[i] - scurți_în_tranzit[i]
 *   suma = km_tronson × pasageri_lungi × preț_km_lung
 * 
 * Scurți: pentru fiecare grup de scurți:
 *   suma = km_distanță × nr_pasageri × preț_km_scurt
 */
export function calculateDirection(
  entries: StopEntry[],
  ratePerKmLong: number,
  ratePerKmShort: number,
): CalculationResult {
  if (entries.length < 2) {
    return { longSum: 0, shortSum: 0, total: 0, details: [] };
  }

  const sorted = [...entries].sort((a, b) => a.stopOrder - b.stopOrder);

  // Colectăm toți scurții — mapă: boardedStopOrder → { exitStopOrder, count }
  const shortRides: { boardedOrder: number; exitOrder: number; count: number; km: number }[] = [];
  for (const entry of sorted) {
    for (const sp of entry.shortPassengers) {
      shortRides.push({
        boardedOrder: sp.boardedStopOrder,
        exitOrder: entry.stopOrder,
        count: sp.passengerCount,
        km: sp.kmDistance,
      });
    }
  }

  // Calcul scurți
  let shortSum = 0;
  for (const ride of shortRides) {
    shortSum += ride.km * ride.count * ratePerKmShort;
  }

  // Calcul lungi pe tronsoane
  const details: TronsonDetail[] = [];
  let longSum = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const kmTronson = next.kmFromStart - current.kmFromStart;

    // Câți scurți sunt "în tranzit" pe acest tronson?
    // Un scurt e în tranzit dacă: boardedOrder <= current.stopOrder ȘI exitOrder > current.stopOrder
    let shortInTransit = 0;
    for (const ride of shortRides) {
      if (ride.boardedOrder <= current.stopOrder && ride.exitOrder > current.stopOrder) {
        shortInTransit += ride.count;
      }
    }

    const longPassengers = Math.max(0, current.totalPassengers - shortInTransit);
    const tronsonSum = kmTronson * longPassengers * ratePerKmLong;

    details.push({
      fromStop: current.stopNameRo,
      toStop: next.stopNameRo,
      km: kmTronson,
      longPassengers,
      shortInTransit,
      tronsonSum,
    });

    longSum += tronsonSum;
  }

  return {
    longSum: Math.round(longSum * 100) / 100,
    shortSum: Math.round(shortSum * 100) / 100,
    total: Math.round((longSum + shortSum) * 100) / 100,
    details,
  };
}

/**
 * Pentru o oprire dată (unde au ieșit scurți), returnează lista opririlor
 * de pe rută care sunt ≤ maxKm distanță ȘI sunt ÎNAINTE pe rută.
 */
export function getEligibleBoardingStops(
  allStops: { stopOrder: number; stopNameRo: string; kmFromStart: number }[],
  exitStopOrder: number,
  exitKm: number,
  maxKm: number,
): { stopOrder: number; stopNameRo: string; kmDistance: number }[] {
  return allStops
    .filter(s => s.stopOrder < exitStopOrder && (exitKm - s.kmFromStart) <= maxKm && (exitKm - s.kmFromStart) > 0)
    .map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.stopNameRo,
      kmDistance: Math.round((exitKm - s.kmFromStart) * 100) / 100,
    }))
    .sort((a, b) => b.stopOrder - a.stopOrder); // cele mai apropiate primele
}
```

- [ ] **Step 2: Verify in browser console (manual test)**

After the full module is running, open browser console and test:
```javascript
// Paste calculateDirection with test data to verify sums
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/calculation.ts
git commit -m "feat(numarare): add pure calculation functions for long/short passenger fares"
```

---

### Task 3: Server Actions

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/actions.ts`

- [ ] **Step 1: Create server actions**

```typescript
'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ─── Типы ───

export interface RouteForCounting {
  crm_route_id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
  driver_name: string | null;
  vehicle_plate: string | null;
  session_id: string | null;
  session_status: string | null;
  locked_by_email: string | null;
  locked_by_id: string | null;
  double_tariff: boolean;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
}

export interface RouteStop {
  stopOrder: number;
  nameRo: string;
  kmFromStart: number;
}

export interface SavedEntry {
  id: string;
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  shortPassengers: {
    id: string;
    boardedStopOrder: number;
    boardedStopNameRo: string;
    kmDistance: number;
    passengerCount: number;
    amountLei: number | null;
  }[];
}

export interface TariffConfig {
  ratePerKmLong: number;
  ratePerKmShort: number;
  doubleTariffEnabled: boolean;
}

// ─── Загрузка данных ───

export async function getRoutesForDate(date: string): Promise<{ data?: RouteForCounting[]; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Берём assignments на дату с join на routes, drivers, vehicles
  const { data: assignments, error: aErr } = await sb
    .from('daily_assignments')
    .select(`
      crm_route_id,
      crm_routes!inner(id, dest_to_ro, time_chisinau, time_nord, active),
      drivers(full_name),
      vehicles!daily_assignments_vehicle_id_fkey(plate_number)
    `)
    .eq('assignment_date', date)
    .eq('crm_routes.active', true);

  if (aErr) return { error: aErr.message };

  // Берём существующие сессии подсчёта на эту дату
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('crm_route_id, id, status, locked_by, locked_at, double_tariff, tur_total_lei, retur_total_lei, locker:admin_accounts!counting_sessions_locked_by_fkey(email)')
    .eq('assignment_date', date);

  const sessionMap = new Map<number, any>();
  for (const s of sessions || []) {
    sessionMap.set(s.crm_route_id, s);
  }

  const routes: RouteForCounting[] = (assignments || []).map((a: any) => {
    const s = sessionMap.get(a.crm_route_id);
    return {
      crm_route_id: a.crm_route_id,
      dest_to_ro: a.crm_routes.dest_to_ro,
      time_chisinau: a.crm_routes.time_chisinau,
      time_nord: a.crm_routes.time_nord,
      driver_name: a.drivers?.full_name || null,
      vehicle_plate: a.vehicles?.plate_number || null,
      session_id: s?.id || null,
      session_status: s?.status || null,
      locked_by_email: s?.locker?.email || null,
      locked_by_id: s?.locked_by || null,
      double_tariff: s?.double_tariff || false,
      tur_total_lei: s?.tur_total_lei || null,
      retur_total_lei: s?.retur_total_lei || null,
    };
  });

  // Сортируем по времени отправления из Кишинёва
  routes.sort((a, b) => a.time_chisinau.localeCompare(b.time_chisinau));

  return { data: routes };
}

export async function getRouteStops(crmRouteId: number, direction: 'tur' | 'retur'): Promise<RouteStop[]> {
  const session = await verifySession();
  if (!session) return [];

  const sb = getSupabase();
  const { data } = await sb
    .from('crm_stop_prices')
    .select('name_ro, km_from_chisinau, km_from_nord')
    .eq('crm_route_id', crmRouteId)
    .order('km_from_chisinau', { ascending: true });

  if (!data || data.length === 0) return [];

  return data.map((row: any, idx: number) => ({
    stopOrder: idx + 1,
    nameRo: row.name_ro,
    kmFromStart: direction === 'tur'
      ? Number(row.km_from_chisinau || 0)
      : Number(row.km_from_nord || 0),
  }));
}

export async function getTariffConfig(): Promise<TariffConfig> {
  const sb = getSupabase();
  const { data } = await sb
    .from('app_config')
    .select('key, value')
    .in('key', ['rate_per_km_long', 'rate_per_km_short']);

  const config: Record<string, string> = {};
  for (const row of data || []) {
    config[row.key] = row.value;
  }

  return {
    ratePerKmLong: parseFloat(config['rate_per_km_long'] || '0.94'),
    ratePerKmShort: parseFloat(config['rate_per_km_short'] || '0.94'),
    doubleTariffEnabled: false, // per-session, not global
  };
}

// ─── Locking ───

export async function lockRoute(
  crmRouteId: number,
  date: string,
): Promise<{ sessionId?: string; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Upsert сессию
  const { data, error } = await sb
    .from('counting_sessions')
    .upsert({
      crm_route_id: crmRouteId,
      assignment_date: date,
      operator_id: session.id,
      locked_by: session.id,
      locked_at: new Date().toISOString(),
      status: 'new',
    }, { onConflict: 'crm_route_id,assignment_date' })
    .select('id, status, locked_by')
    .single();

  if (error) {
    // Возможно уже заблокирована другим
    const { data: existing } = await sb
      .from('counting_sessions')
      .select('id, locked_by, locked_at, status')
      .eq('crm_route_id', crmRouteId)
      .eq('assignment_date', date)
      .single();

    if (existing && existing.locked_by && existing.locked_by !== session.id) {
      // Проверяем timeout 15 минут
      const lockedAt = new Date(existing.locked_at).getTime();
      const now = Date.now();
      if (now - lockedAt < 15 * 60 * 1000) {
        return { error: 'Cursă blocată de alt operator' };
      }
      // Timeout — перехватываем блокировку
      const { data: updated } = await sb
        .from('counting_sessions')
        .update({ locked_by: session.id, locked_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id')
        .single();
      return { sessionId: updated?.id };
    }

    return { sessionId: existing?.id };
  }

  return { sessionId: data.id };
}

export async function unlockRoute(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();
  await sb
    .from('counting_sessions')
    .update({ locked_by: null, locked_at: null })
    .eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

// ─── Сохранение данных ───

export async function saveDirection(
  sessionId: string,
  direction: 'tur' | 'retur',
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    shortPassengers: {
      boardedStopOrder: number;
      boardedStopNameRo: string;
      kmDistance: number;
      passengerCount: number;
      amountLei: number;
    }[];
  }[],
  totalLei: number,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const sb = getSupabase();

  // Удаляем старые entries для этого direction
  const { data: oldEntries } = await sb
    .from('counting_entries')
    .select('id')
    .eq('session_id', sessionId)
    .eq('direction', direction);

  if (oldEntries && oldEntries.length > 0) {
    const oldIds = oldEntries.map((e: any) => e.id);
    await sb.from('counting_short_passengers').delete().in('entry_id', oldIds);
    await sb.from('counting_entries').delete().eq('session_id', sessionId).eq('direction', direction);
  }

  // Вставляем новые entries
  for (const entry of entries) {
    const { data: inserted, error: eErr } = await sb
      .from('counting_entries')
      .insert({
        session_id: sessionId,
        direction,
        stop_order: entry.stopOrder,
        stop_name_ro: entry.stopNameRo,
        km_from_start: entry.kmFromStart,
        total_passengers: entry.totalPassengers,
      })
      .select('id')
      .single();

    if (eErr) return { error: eErr.message };

    // Вставляем short passengers
    if (entry.shortPassengers.length > 0) {
      const shorts = entry.shortPassengers.map(sp => ({
        entry_id: inserted!.id,
        boarded_stop_order: sp.boardedStopOrder,
        boarded_stop_name_ro: sp.boardedStopNameRo,
        km_distance: sp.kmDistance,
        passenger_count: sp.passengerCount,
        amount_lei: sp.amountLei,
      }));
      const { error: spErr } = await sb
        .from('counting_short_passengers')
        .insert(shorts);
      if (spErr) return { error: spErr.message };
    }
  }

  // Обновляем статус и сумму
  const updateFields: any = {};
  if (direction === 'tur') {
    updateFields.tur_total_lei = totalLei;
    updateFields.status = 'tur_done';
  } else {
    updateFields.retur_total_lei = totalLei;
    updateFields.status = 'completed';
  }
  updateFields.locked_by = null;
  updateFields.locked_at = null;

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}

export async function loadSavedEntries(
  sessionId: string,
  direction: 'tur' | 'retur',
): Promise<SavedEntry[]> {
  const session = await verifySession();
  if (!session) return [];

  const sb = getSupabase();
  const { data: entries } = await sb
    .from('counting_entries')
    .select(`
      id, stop_order, stop_name_ro, km_from_start, total_passengers,
      counting_short_passengers(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)
    `)
    .eq('session_id', sessionId)
    .eq('direction', direction)
    .order('stop_order');

  return (entries || []).map((e: any) => ({
    id: e.id,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    shortPassengers: (e.counting_short_passengers || []).map((sp: any) => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: sp.amount_lei ? Number(sp.amount_lei) : null,
    })),
  }));
}

// ─── Admin camere: toggle tarif dublu ───

export async function toggleDoubleTariff(
  sessionId: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  const sb = getSupabase();
  await sb.from('counting_sessions').update({ double_tariff: enabled }).eq('id', sessionId);
  revalidatePath('/numarare');
  return {};
}

// ─── Admin camere: deblocare forțată ───

export async function forceUnlock(sessionId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')) {
    return { error: 'Acces interzis' };
  }

  return unlockRoute(sessionId);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/actions.ts
git commit -m "feat(numarare): add server actions for counting sessions, locking, save"
```

---

### Task 4: Auth & Middleware Update

**Files:**
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Update AdminRole type in auth.ts**

Find the `AdminRole` type and add new roles. Look for:
```typescript
export type AdminRole = 'ADMIN' | 'DISPATCHER' | 'GRAFIC';
```
Change to:
```typescript
export type AdminRole = 'ADMIN' | 'DISPATCHER' | 'GRAFIC' | 'OPERATOR_CAMERE' | 'ADMIN_CAMERE';
```

- [ ] **Step 2: Update middleware.ts — add OPERATOR_CAMERE and ADMIN_CAMERE route access**

Add after existing role checks (DISPATCHER, GRAFIC blocks):

```typescript
const OPERATOR_CAMERE_ALLOWED = ['/numarare'];
const ADMIN_CAMERE_ALLOWED = ['/numarare'];

if (role === 'OPERATOR_CAMERE') {
  const allowed = OPERATOR_CAMERE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!allowed) return NextResponse.redirect(new URL('/numarare', request.url));
}

if (role === 'ADMIN_CAMERE') {
  const allowed = ADMIN_CAMERE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!allowed) return NextResponse.redirect(new URL('/numarare', request.url));
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/middleware.ts
git commit -m "feat(auth): add OPERATOR_CAMERE and ADMIN_CAMERE roles"
```

---

### Task 5: Page Wrapper & Sidebar

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/page.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Create page.tsx**

```typescript
import NumarareClient from './NumarareClient';

export const metadata = { title: 'Numărare pasageri — TRANSLUX' };

export default function NumararePage() {
  return <NumarareClient />;
}
```

- [ ] **Step 2: Add /numarare to Sidebar**

Find the navigation links array in Sidebar.tsx and add:
```typescript
{ href: '/numarare', label: 'Numărare', icon: '📋' }
```

Ensure it's visible for roles: ADMIN, OPERATOR_CAMERE, ADMIN_CAMERE. Follow existing pattern for role-based link visibility.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/page.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(numarare): add page wrapper and sidebar navigation"
```

---

### Task 6: Main Client Component — Route List

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx`

- [ ] **Step 1: Create NumarareClient with route list**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRoutesForDate,
  lockRoute,
  unlockRoute,
  getRouteStops,
  getTariffConfig,
  loadSavedEntries,
  type RouteForCounting,
  type RouteStop,
  type TariffConfig,
  type SavedEntry,
} from './actions';
import CountingForm from './CountingForm';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

export default function NumarareClient() {
  const [date, setDate] = useState(todayChisinau);
  const [routes, setRoutes] = useState<RouteForCounting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openRouteId, setOpenRouteId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [tariff, setTariff] = useState<TariffConfig | null>(null);
  const [savedTur, setSavedTur] = useState<SavedEntry[]>([]);
  const [savedRetur, setSavedRetur] = useState<SavedEntry[]>([]);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getRoutesForDate(date);
      if (result.error) setError(result.error);
      else setRoutes(result.data || []);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadRoutes();
    getTariffConfig().then(setTariff);
  }, [loadRoutes]);

  async function handleOpen(crmRouteId: number) {
    const result = await lockRoute(crmRouteId, date);
    if (result.error) {
      setError(result.error);
      return;
    }

    const routeStops = await getRouteStops(crmRouteId, 'tur');
    const sTur = result.sessionId ? await loadSavedEntries(result.sessionId, 'tur') : [];
    const sRetur = result.sessionId ? await loadSavedEntries(result.sessionId, 'retur') : [];

    setSessionId(result.sessionId || null);
    setStops(routeStops);
    setSavedTur(sTur);
    setSavedRetur(sRetur);
    setOpenRouteId(crmRouteId);
  }

  async function handleClose() {
    if (sessionId) {
      await unlockRoute(sessionId);
    }
    setOpenRouteId(null);
    setSessionId(null);
    setStops([]);
    setSavedTur([]);
    setSavedRetur([]);
    await loadRoutes();
  }

  function handleSaved() {
    loadRoutes();
  }

  function statusBadge(route: RouteForCounting) {
    if (!route.session_status) return <span className="text-muted">Neprocesat</span>;
    if (route.locked_by_email) return <span style={{ color: 'var(--warning)' }}>🔒 {route.locked_by_email}</span>;
    if (route.session_status === 'tur_done') return <span style={{ color: 'var(--primary)' }}>Tur gata</span>;
    if (route.session_status === 'completed') return <span style={{ color: 'var(--success)' }}>✅ Finalizat</span>;
    return <span className="text-muted">Nou</span>;
  }

  const openRoute = routes.find(r => r.crm_route_id === openRouteId);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Numărare pasageri</h1>
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setOpenRouteId(null); }}
          className="form-control"
          style={{ width: 180 }}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p className="text-muted">Se încarcă...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tur</th>
              <th>Destinația</th>
              <th>Retur</th>
              <th>Șofer</th>
              <th>Mașina</th>
              <th>Status</th>
              <th>Sumă</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => (
              <>
                <tr key={route.crm_route_id}>
                  <td>{route.time_chisinau}</td>
                  <td><strong>{route.dest_to_ro}</strong></td>
                  <td>{route.time_nord}</td>
                  <td>{route.driver_name || '—'}</td>
                  <td>{route.vehicle_plate || '—'}</td>
                  <td>{statusBadge(route)}</td>
                  <td>
                    {route.tur_total_lei != null || route.retur_total_lei != null
                      ? `${(route.tur_total_lei || 0) + (route.retur_total_lei || 0)} lei`
                      : '—'}
                  </td>
                  <td>
                    {openRouteId === route.crm_route_id ? (
                      <button className="btn btn-outline" onClick={handleClose}>Închide</button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleOpen(route.crm_route_id)}
                        disabled={!!route.locked_by_id || route.session_status === 'completed'}
                      >
                        Deschide
                      </button>
                    )}
                  </td>
                </tr>
                {openRouteId === route.crm_route_id && sessionId && tariff && (
                  <tr key={`${route.crm_route_id}-form`}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <CountingForm
                        sessionId={sessionId}
                        crmRouteId={route.crm_route_id}
                        stops={stops}
                        tariff={tariff}
                        doubleTariff={route.double_tariff}
                        sessionStatus={route.session_status || 'new'}
                        savedTur={savedTur}
                        savedRetur={savedRetur}
                        onSaved={handleSaved}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify route list renders**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npm run dev
# Open http://localhost:3000/numarare
# Should see date picker + table of routes from daily_assignments
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/NumarareClient.tsx
git commit -m "feat(numarare): add main client component with route list and locking"
```

---

### Task 7: Counting Form Component (Tur / Retur)

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/CountingForm.tsx`

- [ ] **Step 1: Create CountingForm**

```tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { saveDirection, getRouteStops, type RouteStop, type TariffConfig, type SavedEntry } from './actions';
import { calculateDirection, getEligibleBoardingStops, type StopEntry, type ShortPassengerGroup } from './calculation';
import ShortPassengerPopup from './ShortPassengerPopup';

interface Props {
  sessionId: string;
  crmRouteId: number;
  stops: RouteStop[];
  tariff: TariffConfig;
  doubleTariff: boolean;
  sessionStatus: string;
  savedTur: SavedEntry[];
  savedRetur: SavedEntry[];
  onSaved: () => void;
}

interface EntryState {
  totalPassengers: string; // строка для input
  shortCount: string;
  shortPassengers: ShortPassengerGroup[];
}

export default function CountingForm({
  sessionId, crmRouteId, stops, tariff, doubleTariff, sessionStatus, savedTur, savedRetur, onSaved,
}: Props) {
  const [returStops, setReturStops] = useState<RouteStop[]>([]);
  const [turEntries, setTurEntries] = useState<Record<number, EntryState>>({});
  const [returEntries, setReturEntries] = useState<Record<number, EntryState>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shortPopup, setShortPopup] = useState<{
    direction: 'tur' | 'retur';
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    count: number;
    allStops: RouteStop[];
  } | null>(null);

  const turRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const returRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const shortRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const turReadOnly = sessionStatus === 'tur_done' || sessionStatus === 'completed';
  const returReadOnly = sessionStatus === 'completed';

  // Загрузка остановок Retur
  useEffect(() => {
    getRouteStops(crmRouteId, 'retur').then(setReturStops);
  }, [crmRouteId]);

  // Инициализация из сохранённых данных
  useEffect(() => {
    if (savedTur.length > 0) {
      const entries: Record<number, EntryState> = {};
      for (const e of savedTur) {
        entries[e.stopOrder] = {
          totalPassengers: String(e.totalPassengers),
          shortCount: e.shortPassengers.length > 0
            ? String(e.shortPassengers.reduce((s, sp) => s + sp.passengerCount, 0))
            : '',
          shortPassengers: e.shortPassengers.map(sp => ({
            boardedStopOrder: sp.boardedStopOrder,
            boardedStopNameRo: sp.boardedStopNameRo,
            kmDistance: sp.kmDistance,
            passengerCount: sp.passengerCount,
          })),
        };
      }
      setTurEntries(entries);
    }
  }, [savedTur]);

  useEffect(() => {
    if (savedRetur.length > 0) {
      const entries: Record<number, EntryState> = {};
      for (const e of savedRetur) {
        entries[e.stopOrder] = {
          totalPassengers: String(e.totalPassengers),
          shortCount: e.shortPassengers.length > 0
            ? String(e.shortPassengers.reduce((s, sp) => s + sp.passengerCount, 0))
            : '',
          shortPassengers: e.shortPassengers.map(sp => ({
            boardedStopOrder: sp.boardedStopOrder,
            boardedStopNameRo: sp.boardedStopNameRo,
            kmDistance: sp.kmDistance,
            passengerCount: sp.passengerCount,
          })),
        };
      }
      setReturEntries(entries);
    }
  }, [savedRetur]);

  // Фокус на первое поле Tur
  useEffect(() => {
    if (!turReadOnly && stops.length > 0) {
      const firstRef = turRefs.current[stops[0].stopOrder];
      if (firstRef) firstRef.focus();
    }
  }, [stops, turReadOnly]);

  function getEntries(direction: 'tur' | 'retur') {
    return direction === 'tur' ? turEntries : returEntries;
  }

  function setEntries(direction: 'tur' | 'retur', entries: Record<number, EntryState>) {
    if (direction === 'tur') setTurEntries(entries);
    else setReturEntries(entries);
  }

  function getStops(direction: 'tur' | 'retur') {
    return direction === 'tur' ? stops : returStops;
  }

  function getTotal(stopOrder: number, direction: 'tur' | 'retur'): number {
    const e = getEntries(direction)[stopOrder];
    return e ? parseInt(e.totalPassengers) || 0 : 0;
  }

  function getPrevTotal(stopOrder: number, direction: 'tur' | 'retur'): number {
    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === stopOrder);
    if (idx <= 0) return 0;
    return getTotal(dirStops[idx - 1].stopOrder, direction);
  }

  function handleTotalChange(direction: 'tur' | 'retur', stopOrder: number, value: string) {
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder] || { totalPassengers: '', shortCount: '', shortPassengers: [] },
      totalPassengers: value,
    };
    setEntries(direction, entries);
  }

  function handleTotalKeyDown(
    direction: 'tur' | 'retur',
    stopOrder: number,
    e: React.KeyboardEvent,
  ) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;

    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === stopOrder);
    const currentTotal = getTotal(stopOrder, direction);
    const prevTotal = getPrevTotal(stopOrder, direction);
    const decreased = currentTotal < prevTotal;

    // Если число уменьшилось и двойной тариф — переходим в Scurți
    if (decreased && doubleTariff && e.key === 'Enter') {
      e.preventDefault();
      const shortRef = shortRefs.current[`${direction}-${stopOrder}`];
      if (shortRef) shortRef.focus();
      return;
    }

    // Иначе — следующая остановка
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < dirStops.length - 1) {
        const nextOrder = dirStops[idx + 1].stopOrder;
        const refs = direction === 'tur' ? turRefs : returRefs;
        refs.current[nextOrder]?.focus();
      }
    }
  }

  function handleShortChange(direction: 'tur' | 'retur', stopOrder: number, value: string) {
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder] || { totalPassengers: '', shortCount: '', shortPassengers: [] },
      shortCount: value,
    };
    setEntries(direction, entries);
  }

  function handleShortKeyDown(
    direction: 'tur' | 'retur',
    stopOrder: number,
    stop: RouteStop,
    e: React.KeyboardEvent,
  ) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const count = parseInt(getEntries(direction)[stopOrder]?.shortCount || '0') || 0;
    if (count > 0) {
      // Открываем popup
      setShortPopup({
        direction,
        stopOrder,
        stopNameRo: stop.nameRo,
        kmFromStart: stop.kmFromStart,
        count,
        allStops: getStops(direction),
      });
    } else {
      // Следующая остановка
      moveToNextStop(direction, stopOrder);
    }
  }

  function moveToNextStop(direction: 'tur' | 'retur', currentOrder: number) {
    const dirStops = getStops(direction);
    const idx = dirStops.findIndex(s => s.stopOrder === currentOrder);
    if (idx < dirStops.length - 1) {
      const nextOrder = dirStops[idx + 1].stopOrder;
      const refs = direction === 'tur' ? turRefs : returRefs;
      refs.current[nextOrder]?.focus();
    }
  }

  function handleShortConfirm(groups: ShortPassengerGroup[]) {
    if (!shortPopup) return;
    const { direction, stopOrder } = shortPopup;
    const entries = { ...getEntries(direction) };
    entries[stopOrder] = {
      ...entries[stopOrder],
      shortPassengers: groups,
    };
    setEntries(direction, entries);
    setShortPopup(null);
    moveToNextStop(direction, stopOrder);
  }

  function buildStopEntries(direction: 'tur' | 'retur'): StopEntry[] {
    const dirStops = getStops(direction);
    const entries = getEntries(direction);
    return dirStops.map(stop => {
      const e = entries[stop.stopOrder];
      return {
        stopOrder: stop.stopOrder,
        stopNameRo: stop.nameRo,
        kmFromStart: stop.kmFromStart,
        totalPassengers: e ? parseInt(e.totalPassengers) || 0 : 0,
        shortPassengers: e?.shortPassengers || [],
      };
    });
  }

  function calcResult(direction: 'tur' | 'retur') {
    const entries = buildStopEntries(direction);
    return calculateDirection(entries, tariff.ratePerKmLong, doubleTariff ? tariff.ratePerKmShort : tariff.ratePerKmLong);
  }

  const turResult = calcResult('tur');
  const returResult = calcResult('retur');

  async function handleSave(direction: 'tur' | 'retur') {
    setSaving(true);
    setError('');
    try {
      const entries = buildStopEntries(direction);
      const result = direction === 'tur' ? turResult : returResult;
      const saveEntries = entries.map(e => ({
        stopOrder: e.stopOrder,
        stopNameRo: e.stopNameRo,
        kmFromStart: e.kmFromStart,
        totalPassengers: e.totalPassengers,
        shortPassengers: e.shortPassengers.map(sp => ({
          boardedStopOrder: sp.boardedStopOrder,
          boardedStopNameRo: sp.boardedStopNameRo,
          kmDistance: sp.kmDistance,
          passengerCount: sp.passengerCount,
          amountLei: sp.kmDistance * sp.passengerCount * tariff.ratePerKmShort,
        })),
      }));

      const res = await saveDirection(sessionId, direction, saveEntries, Math.round(result.total));
      if (res.error) setError(res.error);
      else onSaved();
    } finally {
      setSaving(false);
    }
  }

  function renderColumn(direction: 'tur' | 'retur', dirStops: RouteStop[], readOnly: boolean) {
    const entries = getEntries(direction);
    const result = direction === 'tur' ? turResult : returResult;
    const refs = direction === 'tur' ? turRefs : returRefs;
    const label = direction === 'tur' ? 'Tur' : 'Retur';

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ marginBottom: 8 }}>{label}</h3>
        <table className="table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>Nr</th>
              <th>Stația</th>
              <th style={{ width: 50 }}>Km</th>
              <th style={{ width: 70 }}>Total</th>
              <th style={{ width: 40 }}>±</th>
              {doubleTariff && <th style={{ width: 70 }}>Scurți</th>}
            </tr>
          </thead>
          <tbody>
            {dirStops.map((stop, idx) => {
              const entry = entries[stop.stopOrder];
              const total = parseInt(entry?.totalPassengers || '') || 0;
              const prev = idx > 0 ? (parseInt(entries[dirStops[idx - 1].stopOrder]?.totalPassengers || '') || 0) : 0;
              const delta = idx > 0 ? total - prev : total;
              const decreased = delta < 0;

              return (
                <tr key={stop.stopOrder} style={decreased ? { background: 'rgba(217, 119, 6, 0.08)' } : undefined}>
                  <td>{idx + 1}</td>
                  <td>{stop.nameRo}</td>
                  <td>{Math.round(stop.kmFromStart)}</td>
                  <td>
                    <input
                      ref={el => { refs.current[stop.stopOrder] = el; }}
                      type="number"
                      min={0}
                      value={entry?.totalPassengers ?? ''}
                      onChange={e => handleTotalChange(direction, stop.stopOrder, e.target.value)}
                      onKeyDown={e => handleTotalKeyDown(direction, stop.stopOrder, e)}
                      disabled={readOnly}
                      style={{ width: 60, textAlign: 'center' }}
                    />
                  </td>
                  <td style={{ color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    {entry?.totalPassengers !== undefined && entry?.totalPassengers !== '' ? (delta > 0 ? `+${delta}` : delta) : ''}
                  </td>
                  {doubleTariff && (
                    <td>
                      {decreased ? (
                        <input
                          ref={el => { shortRefs.current[`${direction}-${stop.stopOrder}`] = el; }}
                          type="number"
                          min={0}
                          max={Math.abs(delta)}
                          value={entry?.shortCount ?? ''}
                          onChange={e => handleShortChange(direction, stop.stopOrder, e.target.value)}
                          onKeyDown={e => handleShortKeyDown(direction, stop.stopOrder, stop, e)}
                          placeholder="0"
                          disabled={readOnly}
                          style={{ width: 55, textAlign: 'center' }}
                        />
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          {doubleTariff && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pasageri lungi:</span>
                <strong>{Math.round(result.longSum)} lei</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Pasageri scurți:</span>
                <strong>{Math.round(result.shortSum)} lei</strong>
              </div>
              <hr style={{ margin: '6px 0' }} />
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
            <span>Total {label}:</span>
            <strong>{Math.round(result.total)} lei</strong>
          </div>

          {!readOnly && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => handleSave(direction)}
              disabled={saving}
            >
              {saving ? 'Se salvează...' : `Salvează ${label}`}
            </button>
          )}
          {readOnly && <p className="text-muted" style={{ marginTop: 8, textAlign: 'center' }}>Salvat ✅</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, background: 'var(--primary-dim)' }}>
      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 24 }}>
        {renderColumn('tur', stops, turReadOnly)}
        {returStops.length > 0 && renderColumn('retur', returStops, returReadOnly)}
      </div>

      {turResult.total > 0 && returResult.total > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 18 }}>
          <strong>Total cursă: {Math.round(turResult.total + returResult.total)} lei</strong>
        </div>
      )}

      {shortPopup && (
        <ShortPassengerPopup
          exitStopOrder={shortPopup.stopOrder}
          exitStopNameRo={shortPopup.stopNameRo}
          exitKm={shortPopup.kmFromStart}
          totalShort={shortPopup.count}
          allStops={shortPopup.allStops}
          maxKm={50}
          onConfirm={handleShortConfirm}
          onCancel={() => { setShortPopup(null); moveToNextStop(shortPopup.direction, shortPopup.stopOrder); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/CountingForm.tsx
git commit -m "feat(numarare): add CountingForm with tur/retur columns, keyboard nav, real-time calc"
```

---

### Task 8: Short Passenger Popup

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/ShortPassengerPopup.tsx`

- [ ] **Step 1: Create ShortPassengerPopup**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { getEligibleBoardingStops, type ShortPassengerGroup } from './calculation';
import type { RouteStop } from './actions';

interface Props {
  exitStopOrder: number;
  exitStopNameRo: string;
  exitKm: number;
  totalShort: number;
  allStops: RouteStop[];
  maxKm: number;
  onConfirm: (groups: ShortPassengerGroup[]) => void;
  onCancel: () => void;
}

export default function ShortPassengerPopup({
  exitStopOrder, exitStopNameRo, exitKm, totalShort, allStops, maxKm, onConfirm, onCancel,
}: Props) {
  const eligible = getEligibleBoardingStops(
    allStops.map(s => ({ stopOrder: s.stopOrder, stopNameRo: s.nameRo, kmFromStart: s.kmFromStart })),
    exitStopOrder,
    exitKm,
    maxKm,
  );

  const [counts, setCounts] = useState<Record<number, string>>({});
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const distributed = Object.values(counts).reduce((sum, v) => sum + (parseInt(v) || 0), 0);
  const remaining = totalShort - distributed;

  function handleConfirm() {
    const groups: ShortPassengerGroup[] = [];
    for (const stop of eligible) {
      const count = parseInt(counts[stop.stopOrder] || '0') || 0;
      if (count > 0) {
        groups.push({
          boardedStopOrder: stop.stopOrder,
          boardedStopNameRo: stop.stopNameRo,
          kmDistance: stop.kmDistance,
          passengerCount: count,
        });
      }
    }
    onConfirm(groups);
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (remaining === 0) {
        handleConfirm();
      }
    }
  }

  if (eligible.length === 0) {
    // Нет подходящих остановок ≤ 50 км — автоматически закрываем
    onCancel();
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ padding: 20, minWidth: 340, maxWidth: 450 }}
        onClick={e => e.stopPropagation()}
      >
        <h4 style={{ marginBottom: 4 }}>
          Scurți: {totalShort} pasageri
        </h4>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Au ieșit la <strong>{exitStopNameRo}</strong>. De unde s-au urcat?
        </p>

        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            {eligible.map((stop, idx) => (
              <tr key={stop.stopOrder}>
                <td style={{ padding: '4px 8px' }}>{stop.stopNameRo}</td>
                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{Math.round(stop.kmDistance)} km</td>
                <td style={{ padding: '4px 0', width: 60 }}>
                  <input
                    ref={idx === 0 ? firstRef : undefined}
                    type="number"
                    min={0}
                    max={remaining + (parseInt(counts[stop.stopOrder] || '0') || 0)}
                    value={counts[stop.stopOrder] || ''}
                    onChange={e => setCounts({ ...counts, [stop.stopOrder]: e.target.value })}
                    onKeyDown={e => handleKeyDown(e, idx)}
                    placeholder="0"
                    style={{ width: 55, textAlign: 'center' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: remaining > 0 ? 'var(--warning)' : 'var(--success)' }}>
            Rămas: {remaining}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={onCancel}>Anulează</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={remaining !== 0}
            >
              Confirmă
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/ShortPassengerPopup.tsx
git commit -m "feat(numarare): add short passenger popup with eligible stops filter"
```

---

### Task 9: Integration Test (Manual)

- [ ] **Step 1: Run dev server and test full flow**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npm run dev
```

Open `http://localhost:3000/numarare` and verify:

1. Route list loads from `daily_assignments` for today's date
2. Click "Deschide" → accordion opens with Tur/Retur columns
3. Stops load with names and km from `crm_stop_prices`
4. Enter numbers in Total column → delta (±) updates live
5. Enter/Tab navigates to next stop
6. When number decreases → short column activates (if double tariff)
7. Enter short count → popup appears with eligible stops (≤ 50 km)
8. Distribute passengers → Confirm → popup closes
9. Sum updates in real-time at bottom
10. "Salvează Tur" → saves to DB, column becomes read-only
11. "Salvează Retur" → saves, status "Finalizat"
12. Another operator sees route as locked/completed

- [ ] **Step 2: Fix any issues found during testing**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(numarare): complete passenger counting module v1"
```
