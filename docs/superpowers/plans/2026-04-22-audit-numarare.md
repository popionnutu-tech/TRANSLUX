# Audit pentru numărarea pasagerilor — Plan de implementare

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adăugăm posibilitatea ca ADMIN_CAMERE să audit-eze (renumere independent) cursele `completed`, cu stocare paralelă a numărării originale și comparație vizuală.

**Architecture:** Tabele paralele (`counting_audit_entries`, `counting_audit_short_passengers`) identice ca structură cu cele existente + câmpuri `audit_*` pe `counting_sessions`. Form-urile existente primesc prop `mode: 'normal' | 'audit'` care comută sursa/destinația datelor fără duplicare de logică de calcul. Comparație afișată după finalizarea audit-ului.

**Tech Stack:** Next.js 14 (App Router), Supabase/Postgres, TypeScript, React, Vitest.

**Spec:** [docs/superpowers/specs/2026-04-22-audit-numarare-design.md](../specs/2026-04-22-audit-numarare-design.md)

---

## File Structure

**Create:**
- `packages/db/migrations/042_audit_numarare.sql` — migrația cu coloane noi + tabele + RLS
- `apps/web/src/app/(dashboard)/numarare/auditActions.ts` — server actions pentru audit (izolat de `actions.ts` pentru claritate)
- `apps/web/src/app/(dashboard)/numarare/AuditComparisonView.tsx` — componentă pentru afișarea comparației
- `apps/web/src/app/(dashboard)/numarare/comparison.ts` — funcție pură `buildComparisonRows` (ușor de unit-testat)
- `apps/web/src/app/(dashboard)/numarare/comparison.test.ts` — teste pentru funcția pură

**Modify:**
- `apps/web/src/app/(dashboard)/numarare/actions.ts` — extinde `RouteForCounting` cu câmpuri `audit_*`, populează în `getRoutesForDate`
- `apps/web/src/app/(dashboard)/numarare/CountingForm.tsx` — adaugă prop `mode: 'normal' | 'audit'`, comută data source
- `apps/web/src/app/(dashboard)/numarare/SuburbanCountingForm.tsx` — adaugă prop `mode: 'normal' | 'audit'`, comută data source
- `apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx` — buton `Audit`/`Refă audit`, afișare dublă sumă în tabel, flux open audit

---

## Task 1: Migrație BD — coloane audit pe counting_sessions + tabele noi

**Files:**
- Create: `packages/db/migrations/042_audit_numarare.sql`

- [ ] **Step 1: Write the migration file**

Create `packages/db/migrations/042_audit_numarare.sql`:

```sql
-- 042_audit_numarare.sql
-- Adaugă suport pentru audit paralel al sesiunilor de numărare.
-- Depends on: 021 (counting_sessions), 040 (suburban schedules)

-- 1. Coloane noi pe counting_sessions (păstrăm originalul intact)
ALTER TABLE counting_sessions
  ADD COLUMN IF NOT EXISTS audit_status VARCHAR(20) CHECK (audit_status IN ('new', 'tur_done', 'completed')),
  ADD COLUMN IF NOT EXISTS audit_tur_total_lei INT,
  ADD COLUMN IF NOT EXISTS audit_retur_total_lei INT,
  ADD COLUMN IF NOT EXISTS audit_tur_single_lei INT,
  ADD COLUMN IF NOT EXISTS audit_retur_single_lei INT,
  ADD COLUMN IF NOT EXISTS audit_operator_id UUID REFERENCES admin_accounts(id),
  ADD COLUMN IF NOT EXISTS audit_locked_by UUID REFERENCES admin_accounts(id),
  ADD COLUMN IF NOT EXISTS audit_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_last_edited_at TIMESTAMPTZ;

-- 2. Tabele paralele identice ca structură cu counting_entries/counting_short_passengers
CREATE TABLE IF NOT EXISTS counting_audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur')),
  stop_order INT NOT NULL,
  stop_name_ro VARCHAR(100) NOT NULL,
  km_from_start DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_passengers INT NOT NULL DEFAULT 0,
  alighted INT NOT NULL DEFAULT 0,
  schedule_id INT REFERENCES crm_route_schedules(id),
  cycle_number INT,
  alt_driver_id UUID REFERENCES drivers(id),
  alt_vehicle_id UUID REFERENCES vehicles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counting_audit_entries_session
  ON counting_audit_entries(session_id, direction);
CREATE INDEX IF NOT EXISTS idx_counting_audit_entries_suburban
  ON counting_audit_entries(session_id, schedule_id, cycle_number)
  WHERE schedule_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS counting_audit_short_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES counting_audit_entries(id) ON DELETE CASCADE,
  boarded_stop_order INT NOT NULL,
  boarded_stop_name_ro VARCHAR(100) NOT NULL,
  km_distance DECIMAL(8,2) NOT NULL,
  passenger_count INT NOT NULL DEFAULT 1,
  amount_lei DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counting_audit_short_passengers_entry
  ON counting_audit_short_passengers(entry_id);

-- 3. RLS: doar ADMIN și ADMIN_CAMERE pot accesa tabele audit
ALTER TABLE counting_audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE counting_audit_short_passengers ENABLE ROW LEVEL SECURITY;

-- Nota: în acest proiect, server actions folosesc service-role cheie, deci RLS nu filtrează.
-- Politica e "fail-closed" pentru client anonim / viitor — server actions fac verificarea prin requireRole.
CREATE POLICY counting_audit_entries_admin_only ON counting_audit_entries
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY counting_audit_short_passengers_admin_only ON counting_audit_short_passengers
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE counting_audit_entries IS
  'Al doilea set independent de numărare (audit) — structură identică cu counting_entries. Accesibil doar via server actions pentru ADMIN/ADMIN_CAMERE.';
COMMENT ON TABLE counting_audit_short_passengers IS
  'Pasageri scurți pentru audit — structură identică cu counting_short_passengers.';
COMMENT ON COLUMN counting_sessions.audit_status IS
  'NULL = no audit started; tur_done/completed = audit progres; structure mirrors session.status.';
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase MCP:

```
mcp__12335997-343c-42cb-8bd2-d902d84c3649__apply_migration
  project_id: tvefsxwqsopfboiaikeq
  name: 042_audit_numarare
  query: <contents of 042_audit_numarare.sql>
```

Expected: success without errors.

- [ ] **Step 3: Verify tables exist**

Run via Supabase MCP:

```
mcp__12335997-343c-42cb-8bd2-d902d84c3649__execute_sql
  query: SELECT column_name FROM information_schema.columns WHERE table_name = 'counting_sessions' AND column_name LIKE 'audit_%' ORDER BY column_name;
```

Expected: 9 rows (audit_last_edited_at, audit_locked_at, audit_locked_by, audit_operator_id, audit_retur_single_lei, audit_retur_total_lei, audit_status, audit_tur_single_lei, audit_tur_total_lei).

Run also:

```
mcp__12335997-343c-42cb-8bd2-d902d84c3649__execute_sql
  query: SELECT table_name FROM information_schema.tables WHERE table_name IN ('counting_audit_entries','counting_audit_short_passengers') ORDER BY table_name;
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add packages/db/migrations/042_audit_numarare.sql
git commit -m "feat(db): add audit tables and columns for numarare"
```

---

## Task 2: Types — extinde RouteForCounting și RouteForPeriod cu câmpuri audit

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/actions.ts` (interfețele + getRoutesForDate + getRoutesForPeriod)

- [ ] **Step 1: Extend RouteForCounting interface**

Add audit fields to `RouteForCounting` interface in `actions.ts` (after `retur_single_lei`):

```ts
export interface RouteForCounting {
  crm_route_id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  session_id: string | null;
  session_status: string | null;
  locked_by_email: string | null;
  locked_by_id: string | null;
  operator_id: string | null;
  operator_email: string | null;
  double_tariff: boolean;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  tur_single_lei: number | null;
  retur_single_lei: number | null;
  // Audit fields
  audit_status: string | null;
  audit_tur_total_lei: number | null;
  audit_retur_total_lei: number | null;
  audit_tur_single_lei: number | null;
  audit_retur_single_lei: number | null;
  audit_locked_by_email: string | null;
  audit_locked_by_id: string | null;
  route_type: 'interurban' | 'suburban';
  dest_from_ro: string;
}
```

- [ ] **Step 2: Extend getRoutesForDate to select audit fields**

In `actions.ts`, locate the `counting_sessions` select query (around line 159-170). Extend the `.select(...)` to include audit fields:

```ts
const { data: sessions } = await sb
  .from('counting_sessions')
  .select(`
    crm_route_id, id, status, operator_id, locked_by, locked_at,
    double_tariff, tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei,
    audit_status, audit_tur_total_lei, audit_retur_total_lei, audit_tur_single_lei, audit_retur_single_lei,
    audit_locked_by,
    driver_id, vehicle_id,
    session_driver:drivers!counting_sessions_driver_id_fkey(id, full_name),
    session_vehicle:vehicles!counting_sessions_vehicle_id_fkey(id, plate_number),
    locker:admin_accounts!counting_sessions_locked_by_fkey(email),
    operator:admin_accounts!counting_sessions_operator_id_fkey(email),
    audit_locker:admin_accounts!counting_sessions_audit_locked_by_fkey(email)
  `)
  .eq('assignment_date', date);
```

- [ ] **Step 3: Map audit fields in route construction**

In the `.map((r: any) => {...})` block (around line 192-228), after the existing `retur_single_lei` mapping, add:

```ts
return {
  // ...existing fields...
  tur_single_lei: s?.tur_single_lei ?? null,
  retur_single_lei: s?.retur_single_lei ?? null,
  audit_status: s?.audit_status ?? null,
  audit_tur_total_lei: s?.audit_tur_total_lei ?? null,
  audit_retur_total_lei: s?.audit_retur_total_lei ?? null,
  audit_tur_single_lei: s?.audit_tur_single_lei ?? null,
  audit_retur_single_lei: s?.audit_retur_single_lei ?? null,
  audit_locked_by_email: s?.audit_locker?.email ?? null,
  audit_locked_by_id: s?.audit_locked_by ?? null,
  route_type: (r.route_type || 'interurban') as 'interurban' | 'suburban',
  dest_from_ro: r.dest_from_ro || '',
};
```

- [ ] **Step 4: Strip audit financial fields for non-admin roles**

In the `if (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE')` block (around line 238), add:

```ts
if (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE') {
  for (const r of routes) {
    r.tur_total_lei = null;
    r.retur_total_lei = null;
    r.tur_single_lei = null;
    r.retur_single_lei = null;
    r.audit_tur_total_lei = null;
    r.audit_retur_total_lei = null;
    r.audit_tur_single_lei = null;
    r.audit_retur_single_lei = null;
    r.audit_status = null;
  }
}
```

- [ ] **Step 5: Extend RouteForPeriod similarly**

Add audit fields to `RouteForPeriod` interface (after `retur_single_lei`):

```ts
export interface RouteForPeriod {
  crm_route_id: number;
  dest_to_ro: string;
  time_chisinau: string;
  time_nord: string;
  sessions_count: number;
  tur_total_lei: number | null;
  retur_total_lei: number | null;
  tur_single_lei: number | null;
  retur_single_lei: number | null;
  audit_tur_total_lei: number | null;
  audit_retur_total_lei: number | null;
  audit_sessions_count: number;
}
```

In `getRoutesForPeriod` (around line 269), extend the select:

```ts
.select('crm_route_id, tur_total_lei, retur_total_lei, tur_single_lei, retur_single_lei, audit_tur_total_lei, audit_retur_total_lei, audit_status')
```

In the aggregation loop (around line 282-309), add:

```ts
const auditTur = Number(s.audit_tur_total_lei) || 0;
const auditRetur = Number(s.audit_retur_total_lei) || 0;
const hasAudit = s.audit_status === 'completed';
if (existing) {
  existing.sessions_count += 1;
  existing.tur_total_lei = (existing.tur_total_lei ?? 0) + tur;
  existing.retur_total_lei = (existing.retur_total_lei ?? 0) + retur;
  existing.tur_single_lei = (existing.tur_single_lei ?? 0) + turSingle;
  existing.retur_single_lei = (existing.retur_single_lei ?? 0) + returSingle;
  existing.audit_tur_total_lei = (existing.audit_tur_total_lei ?? 0) + auditTur;
  existing.audit_retur_total_lei = (existing.audit_retur_total_lei ?? 0) + auditRetur;
  existing.audit_sessions_count += hasAudit ? 1 : 0;
} else {
  agg.set(s.crm_route_id, {
    crm_route_id: s.crm_route_id,
    dest_to_ro: r.dest_to_ro,
    time_chisinau: r.time_chisinau,
    time_nord: r.time_nord,
    sessions_count: 1,
    tur_total_lei: tur,
    retur_total_lei: retur,
    tur_single_lei: turSingle,
    retur_single_lei: returSingle,
    audit_tur_total_lei: auditTur,
    audit_retur_total_lei: auditRetur,
    audit_sessions_count: hasAudit ? 1 : 0,
  });
}
```

And în strip-financial block:

```ts
if (session.role !== 'ADMIN' && session.role !== 'ADMIN_CAMERE') {
  for (const r of result) {
    r.tur_total_lei = null;
    r.retur_total_lei = null;
    r.tur_single_lei = null;
    r.retur_single_lei = null;
    r.audit_tur_total_lei = null;
    r.audit_retur_total_lei = null;
  }
}
```

- [ ] **Step 6: Verify compilation**

Run from `/Users/ionpop/Desktop/TRANSLUX`:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(dashboard)/numarare/actions.ts
git commit -m "feat(numarare): add audit fields to route types and queries"
```

---

## Task 3: Server actions — audit lock/unlock/reset

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/auditActions.ts`

- [ ] **Step 1: Create auditActions.ts with lockAudit**

Create `apps/web/src/app/(dashboard)/numarare/auditActions.ts`:

```ts
'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { SavedEntry } from './actions';

const AUDIT_ROLES = ['ADMIN', 'ADMIN_CAMERE'] as const;

// Reusing SavedEntry from ./actions — audit entries have identical shape.

/**
 * Blochează sesiunea pentru audit. Doar ADMIN/ADMIN_CAMERE.
 * Returnează eroare dacă sesiunea NU este 'completed' sau dacă alt admin audită acum.
 */
export async function lockAudit(sessionId: string): Promise<{ error?: string }> {
  let session;
  try { session = requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  const { data: row, error: fetchErr } = await sb
    .from('counting_sessions')
    .select('id, status, audit_status, audit_locked_by, audit_operator_id')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !row) return { error: 'Sesiune inexistentă' };
  if (row.status !== 'completed') return { error: 'Cursa trebuie să fie finalizată de operator înainte de audit' };
  if (row.audit_locked_by && row.audit_locked_by !== session.id) {
    return { error: 'Audit în desfășurare de alt admin' };
  }

  const updates: any = {
    audit_locked_by: session.id,
    audit_locked_at: new Date().toISOString(),
  };
  if (!row.audit_operator_id) updates.audit_operator_id = session.id;
  if (!row.audit_status) updates.audit_status = 'new';

  const { error: updErr } = await sb.from('counting_sessions').update(updates).eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/numarare');
  return {};
}

/**
 * Eliberează blocajul audit (fără a reseta progresul).
 */
export async function unlockAudit(sessionId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  const { error } = await sb
    .from('counting_sessions')
    .update({ audit_locked_by: null, audit_locked_at: null })
    .eq('id', sessionId);

  if (error) return { error: error.message };
  revalidatePath('/numarare');
  return {};
}

/**
 * Resetează auditul complet — șterge entries, resetează totaluri și status.
 * Folosit pentru "Refă audit".
 */
export async function resetAudit(sessionId: string): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  // CASCADE pe short_passengers via FK
  const { error: delErr } = await sb
    .from('counting_audit_entries')
    .delete()
    .eq('session_id', sessionId);
  if (delErr) return { error: delErr.message };

  const { error: updErr } = await sb
    .from('counting_sessions')
    .update({
      audit_status: null,
      audit_tur_total_lei: null,
      audit_retur_total_lei: null,
      audit_tur_single_lei: null,
      audit_retur_single_lei: null,
      audit_locked_by: null,
      audit_locked_at: null,
    })
    .eq('id', sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/numarare');
  return {};
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/auditActions.ts
git commit -m "feat(numarare): add audit lock/unlock/reset server actions"
```

---

## Task 4: Server actions — interurban audit save/load

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/auditActions.ts`

- [ ] **Step 1: Add saveAuditDirection function**

Append to `auditActions.ts`:

```ts
/**
 * Salvează o direcție (tur sau retur) de audit interurban.
 * Șterge entries vechi pentru acea direcție înainte de inserare.
 * Updatează audit_status: tur → 'tur_done', retur → 'completed'.
 */
export async function saveAuditDirection(
  sessionId: string,
  direction: 'tur' | 'retur',
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
    shortPassengers: {
      boardedStopOrder: number;
      boardedStopNameRo: string;
      kmDistance: number;
      passengerCount: number;
      amountLei: number;
    }[];
  }[],
  totalLei: number,
  totalLeiSingle: number,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Șterge entries vechi pentru această direcție
  const { data: oldEntries } = await sb
    .from('counting_audit_entries')
    .select('id')
    .eq('session_id', sessionId)
    .eq('direction', direction);

  if (oldEntries && oldEntries.length > 0) {
    const oldIds = oldEntries.map((e: any) => e.id);
    await sb.from('counting_audit_short_passengers').delete().in('entry_id', oldIds);
    await sb.from('counting_audit_entries').delete().eq('session_id', sessionId).eq('direction', direction);
  }

  // Inserează noile entries
  for (const entry of entries) {
    const { data: inserted, error: eErr } = await sb
      .from('counting_audit_entries')
      .insert({
        session_id: sessionId,
        direction,
        stop_order: entry.stopOrder,
        stop_name_ro: entry.stopNameRo,
        km_from_start: entry.kmFromStart,
        total_passengers: entry.totalPassengers,
        alighted: entry.alighted,
      })
      .select('id')
      .single();

    if (eErr) return { error: eErr.message };

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
        .from('counting_audit_short_passengers')
        .insert(shorts);
      if (spErr) return { error: spErr.message };
    }
  }

  const updateFields: any = {
    audit_last_edited_at: new Date().toISOString(),
    audit_locked_by: null,
    audit_locked_at: null,
  };
  if (direction === 'tur') {
    updateFields.audit_tur_total_lei = totalLei;
    updateFields.audit_tur_single_lei = totalLeiSingle;
    updateFields.audit_status = 'tur_done';
  } else {
    updateFields.audit_retur_total_lei = totalLei;
    updateFields.audit_retur_single_lei = totalLeiSingle;
    updateFields.audit_status = 'completed';
  }

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}
```

- [ ] **Step 2: Add loadAuditEntries function**

Append to `auditActions.ts`:

```ts
/**
 * Încarcă entries de audit pentru continuarea numărării (dacă admin a salvat tur dar nu retur).
 */
export async function loadAuditEntries(
  sessionId: string,
  direction: 'tur' | 'retur',
): Promise<SavedEntry[]> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return []; }

  const sb = getSupabase();
  const { data: entries } = await sb
    .from('counting_audit_entries')
    .select(`
      id, stop_order, stop_name_ro, km_from_start, total_passengers, alighted,
      counting_audit_short_passengers(id, boarded_stop_order, boarded_stop_name_ro, km_distance, passenger_count, amount_lei)
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
    alighted: e.alighted ?? 0,
    shortPassengers: (e.counting_audit_short_passengers || []).map((sp: any) => ({
      id: sp.id,
      boardedStopOrder: sp.boarded_stop_order,
      boardedStopNameRo: sp.boarded_stop_name_ro,
      kmDistance: Number(sp.km_distance),
      passengerCount: sp.passenger_count,
      amountLei: sp.amount_lei ? Number(sp.amount_lei) : null,
    })),
  }));
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/auditActions.ts
git commit -m "feat(numarare): add interurban audit save/load actions"
```

---

## Task 5: Server actions — suburban audit save/load

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/auditActions.ts`

- [ ] **Step 1: Add saveSuburbanAuditCycle function**

Append to `auditActions.ts`:

```ts
/**
 * Salvează un ciclu suburban de audit. Șterge entries anterioare pentru acest (session, schedule, cycle).
 */
export async function saveSuburbanAuditCycle(
  sessionId: string,
  scheduleId: number,
  direction: 'tur' | 'retur',
  cycleNumber: number,
  entries: {
    stopOrder: number;
    stopNameRo: string;
    kmFromStart: number;
    totalPassengers: number;
    alighted: number;
  }[],
  totalLei: number,
  altDriverId?: string | null,
  altVehicleId?: string | null,
): Promise<{ error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }
  const sb = getSupabase();

  await sb
    .from('counting_audit_entries')
    .delete()
    .eq('session_id', sessionId)
    .eq('schedule_id', scheduleId)
    .eq('cycle_number', cycleNumber);

  for (const entry of entries) {
    const { error } = await sb.from('counting_audit_entries').insert({
      session_id: sessionId,
      direction,
      schedule_id: scheduleId,
      cycle_number: cycleNumber,
      stop_order: entry.stopOrder,
      stop_name_ro: entry.stopNameRo,
      km_from_start: entry.kmFromStart,
      total_passengers: entry.totalPassengers,
      alighted: entry.alighted,
      alt_driver_id: altDriverId || null,
      alt_vehicle_id: altVehicleId || null,
    });
    if (error) return { error: error.message };
  }

  // Pentru suburban, marcăm status și păstrăm totalul raportat per call.
  // Totalul final se recalculează când ambele direcții au cel puțin un ciclu.
  const updateFields: any = {
    audit_last_edited_at: new Date().toISOString(),
    audit_locked_by: null,
    audit_locked_at: null,
    audit_status: direction === 'retur' ? 'completed' : 'tur_done',
  };
  if (direction === 'tur') {
    updateFields.audit_tur_total_lei = totalLei;
  } else {
    updateFields.audit_retur_total_lei = totalLei;
  }

  await sb.from('counting_sessions').update(updateFields).eq('id', sessionId);

  revalidatePath('/numarare');
  return {};
}
```

- [ ] **Step 2: Add loadSuburbanAuditEntries function**

Append to `auditActions.ts`:

```ts
export interface SuburbanAuditEntry {
  scheduleId: number | null;
  cycleNumber: number;
  direction: 'tur' | 'retur';
  stopOrder: number;
  stopNameRo: string;
  kmFromStart: number;
  totalPassengers: number;
  alighted: number;
  altDriverId: string | null;
  altVehicleId: string | null;
}

export async function loadSuburbanAuditEntries(sessionId: string): Promise<SuburbanAuditEntry[]> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return []; }
  const sb = getSupabase();
  const { data } = await sb
    .from('counting_audit_entries')
    .select('schedule_id, cycle_number, direction, stop_order, stop_name_ro, km_from_start, total_passengers, alighted, alt_driver_id, alt_vehicle_id')
    .eq('session_id', sessionId)
    .order('cycle_number')
    .order('stop_order');
  return (data || []).map((e: any) => ({
    scheduleId: e.schedule_id,
    cycleNumber: e.cycle_number,
    direction: e.direction,
    stopOrder: e.stop_order,
    stopNameRo: e.stop_name_ro,
    kmFromStart: Number(e.km_from_start),
    totalPassengers: e.total_passengers,
    alighted: e.alighted ?? 0,
    altDriverId: e.alt_driver_id || null,
    altVehicleId: e.alt_vehicle_id || null,
  }));
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/auditActions.ts
git commit -m "feat(numarare): add suburban audit save/load actions"
```

---

## Task 6: Pure function — buildComparisonRows + tests

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/comparison.ts`
- Create: `apps/web/src/app/(dashboard)/numarare/comparison.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/app/(dashboard)/numarare/comparison.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildComparisonRows, type ComparisonRow } from './comparison';

describe('buildComparisonRows', () => {
  it('returns rows for each stop present in operator or audit', () => {
    const operator = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 15, alighted: 2, shortSum: 1 },
    ];
    const audit = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 14, alighted: 2, shortSum: 1 },
    ];

    const rows = buildComparisonRows(operator, audit);

    expect(rows).toHaveLength(2);
    expect(rows[0].hasDiff).toBe(false);
    expect(rows[1].hasDiff).toBe(true);
    expect(rows[1].deltaTotal).toBe(-1);
  });

  it('handles missing entries in audit', () => {
    const operator = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const audit: typeof operator = [];
    const rows = buildComparisonRows(operator, audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].auditTotal).toBeNull();
    expect(rows[0].hasDiff).toBe(true);
  });

  it('handles missing entries in operator', () => {
    const operator: any[] = [];
    const audit = [
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const rows = buildComparisonRows(operator, audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].operatorTotal).toBeNull();
    expect(rows[0].hasDiff).toBe(true);
  });

  it('sorts by stopOrder', () => {
    const operator = [
      { stopOrder: 3, stopNameRo: 'C', totalPassengers: 5, alighted: 0, shortSum: 0 },
      { stopOrder: 1, stopNameRo: 'A', totalPassengers: 10, alighted: 0, shortSum: 0 },
    ];
    const audit = [
      { stopOrder: 2, stopNameRo: 'B', totalPassengers: 7, alighted: 0, shortSum: 0 },
    ];
    const rows = buildComparisonRows(operator, audit);
    expect(rows.map(r => r.stopOrder)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx vitest run src/app/\(dashboard\)/numarare/comparison.test.ts
```

Expected: FAIL with "Cannot find module './comparison'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/(dashboard)/numarare/comparison.ts`:

```ts
export interface ComparisonInput {
  stopOrder: number;
  stopNameRo: string;
  totalPassengers: number;
  alighted: number;
  shortSum: number;
}

export interface ComparisonRow {
  stopOrder: number;
  stopNameRo: string;
  operatorTotal: number | null;
  operatorAlighted: number | null;
  operatorShort: number | null;
  auditTotal: number | null;
  auditAlighted: number | null;
  auditShort: number | null;
  deltaTotal: number | null;
  deltaAlighted: number | null;
  deltaShort: number | null;
  hasDiff: boolean;
}

/**
 * Produce rânduri de comparație pentru fiecare stop_order prezent în operator SAU audit.
 * Setează null pe partea lipsă și marchează hasDiff=true pentru diferențe.
 */
export function buildComparisonRows(
  operator: ComparisonInput[],
  audit: ComparisonInput[],
): ComparisonRow[] {
  const byOrderOp = new Map<number, ComparisonInput>();
  const byOrderAu = new Map<number, ComparisonInput>();
  for (const e of operator) byOrderOp.set(e.stopOrder, e);
  for (const e of audit) byOrderAu.set(e.stopOrder, e);

  const allOrders = new Set<number>([...byOrderOp.keys(), ...byOrderAu.keys()]);
  const rows: ComparisonRow[] = [];

  for (const stopOrder of Array.from(allOrders).sort((a, b) => a - b)) {
    const op = byOrderOp.get(stopOrder);
    const au = byOrderAu.get(stopOrder);
    const name = op?.stopNameRo || au?.stopNameRo || '';

    const opTotal = op ? op.totalPassengers : null;
    const opAlighted = op ? op.alighted : null;
    const opShort = op ? op.shortSum : null;
    const auTotal = au ? au.totalPassengers : null;
    const auAlighted = au ? au.alighted : null;
    const auShort = au ? au.shortSum : null;

    const deltaTotal = opTotal != null && auTotal != null ? auTotal - opTotal : null;
    const deltaAlighted = opAlighted != null && auAlighted != null ? auAlighted - opAlighted : null;
    const deltaShort = opShort != null && auShort != null ? auShort - opShort : null;

    const hasDiff =
      op == null || au == null ||
      opTotal !== auTotal ||
      opAlighted !== auAlighted ||
      opShort !== auShort;

    rows.push({
      stopOrder, stopNameRo: name,
      operatorTotal: opTotal, operatorAlighted: opAlighted, operatorShort: opShort,
      auditTotal: auTotal, auditAlighted: auAlighted, auditShort: auShort,
      deltaTotal, deltaAlighted, deltaShort,
      hasDiff,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx vitest run src/app/\(dashboard\)/numarare/comparison.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/comparison.ts apps/web/src/app/(dashboard)/numarare/comparison.test.ts
git commit -m "feat(numarare): add buildComparisonRows pure function + tests"
```

---

## Task 7: Server action — getAuditComparison

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/auditActions.ts`

- [ ] **Step 1: Add getAuditComparison function**

Add `import type { ComparisonInput } from './comparison';` at the top of `auditActions.ts` with existing imports.

Then append the function to the end of `auditActions.ts`:

```ts
export interface AuditComparison {
  sessionId: string;
  routeType: 'interurban' | 'suburban';
  tur: { operator: ComparisonInput[]; audit: ComparisonInput[] };
  retur: { operator: ComparisonInput[]; audit: ComparisonInput[] };
  // Pentru suburban, grouping pe (schedule_id, cycle_number) — gestionat client-side.
  suburbanGroups?: {
    scheduleId: number;
    cycleNumber: number;
    direction: 'tur' | 'retur';
    operator: ComparisonInput[];
    audit: ComparisonInput[];
  }[];
  totals: {
    operatorTur: number | null;
    operatorRetur: number | null;
    auditTur: number | null;
    auditRetur: number | null;
  };
}

/**
 * Încarcă datele operator + audit pentru afișarea comparației.
 * Pentru interurban: grupare pe direcție.
 * Pentru suburban: returnează grupuri (schedule_id, cycle_number).
 */
export async function getAuditComparison(sessionId: string): Promise<{ data?: AuditComparison; error?: string }> {
  try { requireRole(await verifySession(), ...AUDIT_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  const { data: sess } = await sb
    .from('counting_sessions')
    .select(`
      id, crm_route_id,
      tur_total_lei, retur_total_lei, audit_tur_total_lei, audit_retur_total_lei,
      crm_routes!inner(route_type)
    `)
    .eq('id', sessionId)
    .single();

  if (!sess) return { error: 'Sesiune inexistentă' };
  const routeType = (sess as any).crm_routes?.route_type || 'interurban';

  // Încarcă entries operator + audit
  const [opRes, auRes] = await Promise.all([
    sb.from('counting_entries')
      .select(`
        direction, stop_order, stop_name_ro, total_passengers, alighted, schedule_id, cycle_number,
        counting_short_passengers(passenger_count)
      `)
      .eq('session_id', sessionId),
    sb.from('counting_audit_entries')
      .select(`
        direction, stop_order, stop_name_ro, total_passengers, alighted, schedule_id, cycle_number,
        counting_audit_short_passengers(passenger_count)
      `)
      .eq('session_id', sessionId),
  ]);

  type Row = any;
  function toCI(r: Row, shortsKey: 'counting_short_passengers' | 'counting_audit_short_passengers'): ComparisonInput {
    const shorts = (r[shortsKey] || []) as { passenger_count: number }[];
    const shortSum = shorts.reduce((s, sp) => s + (sp.passenger_count || 0), 0);
    return {
      stopOrder: r.stop_order,
      stopNameRo: r.stop_name_ro,
      totalPassengers: r.total_passengers || 0,
      alighted: r.alighted || 0,
      shortSum,
    };
  }

  const opRows = (opRes.data || []) as Row[];
  const auRows = (auRes.data || []) as Row[];

  if (routeType === 'suburban') {
    const groupMap = new Map<string, {
      scheduleId: number;
      cycleNumber: number;
      direction: 'tur' | 'retur';
      operator: ComparisonInput[];
      audit: ComparisonInput[];
    }>();
    const keyOf = (r: Row) => `${r.schedule_id}|${r.cycle_number}|${r.direction}`;
    for (const r of opRows) {
      if (!r.schedule_id) continue;
      const k = keyOf(r);
      if (!groupMap.has(k)) groupMap.set(k, { scheduleId: r.schedule_id, cycleNumber: r.cycle_number, direction: r.direction, operator: [], audit: [] });
      groupMap.get(k)!.operator.push(toCI(r, 'counting_short_passengers'));
    }
    for (const r of auRows) {
      if (!r.schedule_id) continue;
      const k = keyOf(r);
      if (!groupMap.has(k)) groupMap.set(k, { scheduleId: r.schedule_id, cycleNumber: r.cycle_number, direction: r.direction, operator: [], audit: [] });
      groupMap.get(k)!.audit.push(toCI(r, 'counting_audit_short_passengers'));
    }

    return {
      data: {
        sessionId,
        routeType: 'suburban',
        tur: { operator: [], audit: [] },
        retur: { operator: [], audit: [] },
        suburbanGroups: Array.from(groupMap.values()).sort((a, b) =>
          a.direction.localeCompare(b.direction) || a.scheduleId - b.scheduleId || a.cycleNumber - b.cycleNumber
        ),
        totals: {
          operatorTur: (sess as any).tur_total_lei ?? null,
          operatorRetur: (sess as any).retur_total_lei ?? null,
          auditTur: (sess as any).audit_tur_total_lei ?? null,
          auditRetur: (sess as any).audit_retur_total_lei ?? null,
        },
      },
    };
  }

  const turOp = opRows.filter(r => r.direction === 'tur').map(r => toCI(r, 'counting_short_passengers'));
  const returOp = opRows.filter(r => r.direction === 'retur').map(r => toCI(r, 'counting_short_passengers'));
  const turAu = auRows.filter(r => r.direction === 'tur').map(r => toCI(r, 'counting_audit_short_passengers'));
  const returAu = auRows.filter(r => r.direction === 'retur').map(r => toCI(r, 'counting_audit_short_passengers'));

  return {
    data: {
      sessionId,
      routeType: 'interurban',
      tur: { operator: turOp, audit: turAu },
      retur: { operator: returOp, audit: returAu },
      totals: {
        operatorTur: (sess as any).tur_total_lei ?? null,
        operatorRetur: (sess as any).retur_total_lei ?? null,
        auditTur: (sess as any).audit_tur_total_lei ?? null,
        auditRetur: (sess as any).audit_retur_total_lei ?? null,
      },
    },
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/auditActions.ts
git commit -m "feat(numarare): add getAuditComparison server action"
```

---

## Task 8: Refactor CountingForm — adaugă prop mode

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/CountingForm.tsx`

- [ ] **Step 1: Add mode prop and import audit actions**

In `CountingForm.tsx`, top of file, after existing imports add:

```ts
import { saveAuditDirection } from './auditActions';
```

Change Props interface (note: `onSaved` gains a `direction` parameter so the parent can trigger comparison view after retur audit):

```ts
interface Props {
  sessionId: string;
  crmRouteId: number;
  stops: RouteStop[];
  tariff: TariffConfig;
  sessionStatus: string;         // Pentru mode='normal': operator status. Pentru mode='audit': audit_status.
  savedTur: SavedEntry[];
  savedRetur: SavedEntry[];
  onSaved: (direction: 'tur' | 'retur') => void;
  canSeeSums: boolean;
  mode?: 'normal' | 'audit';
}
```

- [ ] **Step 2: Use mode in component and replace saveDirection call**

Update component signature and body:

```tsx
export default function CountingForm({
  sessionId, crmRouteId, stops, tariff, sessionStatus, savedTur, savedRetur, onSaved, canSeeSums,
  mode = 'normal',
}: Props) {
  // ... existing state ...
```

In `handleSave`, replace the `saveDirection(...)` call with the mode-aware dispatch, and change the success handler to pass `direction` to `onSaved`:

```ts
const res = mode === 'audit'
  ? await saveAuditDirection(
      sessionId,
      direction,
      saveEntries,
      Math.round(result.total),
      Math.round(singleTotal),
    )
  : await saveDirection(
      sessionId,
      direction,
      saveEntries,
      Math.round(result.total),
      Math.round(singleTotal),
    );
if (res.error) setError(res.error);
else onSaved(direction);
```

- [ ] **Step 3: Add visual audit mode indicator**

In the outer JSX `return`, replace the top-level div with:

```tsx
return (
  <div style={{ padding: 16, background: 'var(--primary-dim)' }}>
    {mode === 'audit' && (
      <div style={{
        padding: '8px 12px',
        background: 'rgba(155,27,48,0.12)',
        color: '#9B1B30',
        fontWeight: 600,
        marginBottom: 12,
        borderRadius: 6,
        border: '1px solid rgba(155,27,48,0.3)',
      }}>
        🔍 MOD AUDIT — numărare independentă
      </div>
    )}
    {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
    {/* ... rest unchanged ... */}
```

- [ ] **Step 4: Update save button label**

In `renderColumn`, update the save button text:

```tsx
<button
  className="btn btn-primary"
  style={{ width: '100%', marginTop: 10 }}
  onClick={() => handleSave(direction)}
  disabled={saving}
>
  {saving ? 'Se salvează...' : `Salvează ${label}${mode === 'audit' ? ' (audit)' : ''}`}
</button>
```

- [ ] **Step 5: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/CountingForm.tsx
git commit -m "feat(numarare): add mode prop to CountingForm for audit support"
```

---

## Task 9: Refactor SuburbanCountingForm — adaugă prop mode

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/SuburbanCountingForm.tsx`

- [ ] **Step 1: Import audit actions and add mode prop**

At top of `SuburbanCountingForm.tsx`, update imports:

```ts
import { getSuburbanSchedule, saveSuburbanCycle, loadSuburbanEntries, type SuburbanSchedule, type TariffConfig, type DriverOption, type VehicleOption } from './actions';
import { saveSuburbanAuditCycle, loadSuburbanAuditEntries } from './auditActions';
```

Update Props interface (same `onSaved` change as CountingForm):

```ts
interface Props {
  sessionId: string;
  crmRouteId: number;
  date: string;
  tariff: TariffConfig;
  canSeeSums: boolean;
  onSaved: (direction: 'tur' | 'retur') => void;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  mode?: 'normal' | 'audit';
}
```

In the save handler (around line 106), find the `onSaved()` call (if present) and change to `onSaved(direction)`. If no explicit `onSaved()` — add one after successful save, passing the current save direction.

Component signature:

```tsx
export default function SuburbanCountingForm({
  sessionId, crmRouteId, date, tariff, canSeeSums, onSaved, drivers, vehicles, mode = 'normal',
}: Props) {
```

- [ ] **Step 2: Swap data loading source based on mode**

In the `useEffect` that calls `loadSuburbanEntries(sessionId)`, replace with:

```tsx
const existing = mode === 'audit'
  ? await loadSuburbanAuditEntries(sessionId)
  : await loadSuburbanEntries(sessionId);
```

- [ ] **Step 3: Swap save target based on mode**

There is a single call site of `saveSuburbanCycle` around line 106 (the only save handler). Replace:

```tsx
const { error } = await saveSuburbanCycle(
  // ... args ...
);
```

With:

```tsx
const saveFn = mode === 'audit' ? saveSuburbanAuditCycle : saveSuburbanCycle;
const { error } = await saveFn(
  // ... same args ...
);
```

Verify afterward:

```bash
grep -n "saveSuburbanCycle\|saveSuburbanAuditCycle" /Users/ionpop/Desktop/TRANSLUX/apps/web/src/app/\(dashboard\)/numarare/SuburbanCountingForm.tsx
```

Expected: import line + the single dispatch line.

- [ ] **Step 4: Add audit mode visual indicator**

At the top of JSX `return` (right after loading check), add:

```tsx
{mode === 'audit' && (
  <div style={{
    padding: '8px 12px',
    background: 'rgba(155,27,48,0.12)',
    color: '#9B1B30',
    fontWeight: 600,
    marginBottom: 12,
    borderRadius: 6,
    border: '1px solid rgba(155,27,48,0.3)',
  }}>
    🔍 MOD AUDIT — numărare independentă
  </div>
)}
```

- [ ] **Step 5: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/SuburbanCountingForm.tsx
git commit -m "feat(numarare): add mode prop to SuburbanCountingForm for audit"
```

---

## Task 10: AuditComparisonView component

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/AuditComparisonView.tsx`

- [ ] **Step 1: Create component**

Create `apps/web/src/app/(dashboard)/numarare/AuditComparisonView.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getAuditComparison, type AuditComparison } from './auditActions';
import { buildComparisonRows, type ComparisonRow } from './comparison';

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function AuditComparisonView({ sessionId, onClose }: Props) {
  const [data, setData] = useState<AuditComparison | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAuditComparison(sessionId).then(res => {
      if (res.error) setError(res.error);
      else setData(res.data || null);
    });
  }, [sessionId]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <p className="text-muted">Se încarcă comparația...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>Comparație Operator vs Audit</h2>
        <button className="btn btn-outline" onClick={onClose}>Închide</button>
      </div>

      <TotalsCard totals={data.totals} />

      {data.routeType === 'interurban' && (
        <>
          <DirectionTable title="Tur" rows={buildComparisonRows(data.tur.operator, data.tur.audit)} />
          <DirectionTable title="Retur" rows={buildComparisonRows(data.retur.operator, data.retur.audit)} />
        </>
      )}

      {data.routeType === 'suburban' && data.suburbanGroups && data.suburbanGroups.map(g => (
        <DirectionTable
          key={`${g.scheduleId}-${g.cycleNumber}-${g.direction}`}
          title={`${g.direction.toUpperCase()} — schedule ${g.scheduleId}, ciclu ${g.cycleNumber}`}
          rows={buildComparisonRows(g.operator, g.audit)}
        />
      ))}
    </div>
  );
}

function TotalsCard({ totals }: { totals: AuditComparison['totals'] }) {
  const opTotal = (totals.operatorTur ?? 0) + (totals.operatorRetur ?? 0);
  const auTotal = (totals.auditTur ?? 0) + (totals.auditRetur ?? 0);
  const delta = auTotal - opTotal;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div><span className="text-muted">Operator (Tur+Retur):</span> <strong>{opTotal} lei</strong></div>
      <div><span className="text-muted">Audit (Tur+Retur):</span> <strong>{auTotal} lei</strong></div>
      <div>
        <span className="text-muted">Δ:</span>{' '}
        <strong style={{ color: delta === 0 ? 'var(--success)' : 'var(--warning)' }}>
          {delta >= 0 ? '+' : ''}{delta} lei
        </strong>
      </div>
    </div>
  );
}

function DirectionTable({ title, rows }: { title: string; rows: ComparisonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 8 }}>{title}</h3>
      <table className="table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>Nr</th>
            <th>Stație</th>
            <th>Op. Total</th>
            <th>Au. Total</th>
            <th>Δ Total</th>
            <th>Op. Cob.</th>
            <th>Au. Cob.</th>
            <th>Op. Scurți</th>
            <th>Au. Scurți</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.stopOrder} style={r.hasDiff ? { background: 'rgba(217, 119, 6, 0.08)' } : undefined}>
              <td>{r.stopOrder}</td>
              <td>{r.stopNameRo}</td>
              <td>{r.operatorTotal ?? '—'}</td>
              <td>{r.auditTotal ?? '—'}</td>
              <td style={{ color: r.deltaTotal === 0 ? 'var(--text-muted)' : 'var(--warning)', fontWeight: r.deltaTotal === 0 ? 400 : 600 }}>
                {r.deltaTotal != null ? (r.deltaTotal >= 0 ? `+${r.deltaTotal}` : r.deltaTotal) : '—'}
              </td>
              <td>{r.operatorAlighted ?? '—'}</td>
              <td>{r.auditAlighted ?? '—'}</td>
              <td>{r.operatorShort ?? '—'}</td>
              <td>{r.auditShort ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/AuditComparisonView.tsx
git commit -m "feat(numarare): add AuditComparisonView component"
```

---

## Task 11: NumarareClient — buton Audit și flux audit

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx`

- [ ] **Step 1: Import new dependencies**

At the top of `NumarareClient.tsx`:

```ts
import { lockAudit, unlockAudit, resetAudit, loadAuditEntries } from './auditActions';
import AuditComparisonView from './AuditComparisonView';
```

- [ ] **Step 2: Add audit state**

After existing `useState` declarations inside `NumarareClient`:

```ts
const [auditMode, setAuditMode] = useState(false);
const [showComparison, setShowComparison] = useState<string | null>(null); // sessionId

const canAudit = role === 'ADMIN' || role === 'ADMIN_CAMERE';
```

- [ ] **Step 3: Add handleOpenAudit function**

After existing `handleOpen`:

```ts
async function handleOpenAudit(route: RouteForCounting) {
  if (!route.session_id) return;
  const lock = await lockAudit(route.session_id);
  if (lock.error) { setError(lock.error); return; }

  if (route.route_type === 'suburban') {
    setSessionId(route.session_id);
    setAuditMode(true);
    setOpenRouteId(route.crm_route_id);
    return;
  }

  const routeStops = await getRouteStops(route.crm_route_id, 'tur');
  const sTur = await loadAuditEntries(route.session_id, 'tur');
  const sRetur = await loadAuditEntries(route.session_id, 'retur');

  setSessionId(route.session_id);
  setStops(routeStops);
  setSavedTur(sTur);
  setSavedRetur(sRetur);
  setAuditMode(true);
  setOpenRouteId(route.crm_route_id);
}
```

- [ ] **Step 4: Update handleClose to handle audit mode**

Replace existing `handleClose`:

```ts
async function handleClose() {
  if (sessionId) {
    if (auditMode) await unlockAudit(sessionId);
    else await unlockRoute(sessionId);
  }
  setOpenRouteId(null);
  setSessionId(null);
  setStops([]);
  setSavedTur([]);
  setSavedRetur([]);
  setAuditMode(false);
  await loadRoutes();
}
```

- [ ] **Step 5: Update handleSaved signature to receive direction**

Callback signatures were updated in Tasks 8 and 9 to accept `direction`. Replace existing `handleSaved()` in `NumarareClient.tsx`:

```ts
async function handleSaved(direction: 'tur' | 'retur') {
  if (auditMode && direction === 'retur' && sessionId) {
    setShowComparison(sessionId);
    setOpenRouteId(null);
    setSessionId(null);
    setAuditMode(false);
    await loadRoutes();
    return;
  }
  loadRoutes();
}
```

- [ ] **Step 6: Add Audit button in route rows**

In the `<tbody>` map inside the interurban/suburban table, update the last `<td>` (action button) to include Audit:

Replace:
```tsx
<td>
  <button
    className="btn btn-primary"
    onClick={() => handleOpen(route)}
    disabled={completed || !!ownedByOther}
  >
    Deschide
  </button>
</td>
```

With:
```tsx
<td>
  <div style={{ display: 'flex', gap: 6 }}>
    <button
      className="btn btn-primary"
      onClick={() => handleOpen(route)}
      disabled={completed || !!ownedByOther}
    >
      Deschide
    </button>
    {canAudit && completed && (!route.audit_locked_by_id || route.audit_locked_by_id === currentUserId) && (
      <button
        className="btn btn-outline"
        onClick={async () => {
          if (route.audit_status === 'completed') {
            const ok = confirm('Ștergi auditul existent și începi unul nou?');
            if (!ok) return;
            if (route.session_id) {
              const r = await resetAudit(route.session_id);
              if (r.error) { setError(r.error); return; }
            }
          }
          handleOpenAudit(route);
        }}
        style={{ fontSize: 12 }}
      >
        {route.audit_status === 'completed' ? '🔍 Refă audit' :
          route.audit_status === 'tur_done' ? '🔍 Continuă audit' : '🔍 Audit'}
      </button>
    )}
    {canAudit && route.audit_status === 'completed' && route.session_id && (
      <button
        className="btn btn-outline"
        onClick={() => setShowComparison(route.session_id!)}
        style={{ fontSize: 12 }}
        title="Vezi comparația"
      >
        📊
      </button>
    )}
    {canAudit && route.audit_locked_by_id && route.audit_locked_by_id !== currentUserId && (
      <span style={{ fontSize: 11, color: 'var(--warning)' }}>🔒 {route.audit_locked_by_email}</span>
    )}
  </div>
</td>
```

- [ ] **Step 7: Render AuditComparisonView conditionally**

At the very top of the JSX return, before existing content, add:

```tsx
if (showComparison) {
  return (
    <div>
      <AuditComparisonView
        sessionId={showComparison}
        onClose={() => setShowComparison(null)}
      />
    </div>
  );
}
```

- [ ] **Step 8: Pass mode prop when opening audit**

Find the block that renders `<CountingForm ... />` and `<SuburbanCountingForm ... />` (around lines 256-279). Add `mode` prop:

```tsx
{openRoute.route_type === 'suburban' ? (
  <SuburbanCountingForm
    sessionId={sessionId}
    crmRouteId={openRoute.crm_route_id}
    date={date}
    tariff={tariff}
    canSeeSums={canSeeSums}
    onSaved={handleSaved}
    drivers={drivers}
    vehicles={vehicles}
    mode={auditMode ? 'audit' : 'normal'}
  />
) : (
  <CountingForm
    sessionId={sessionId}
    crmRouteId={openRoute.crm_route_id}
    stops={stops}
    tariff={tariff}
    sessionStatus={auditMode ? (openRoute.audit_status || 'new') : (openRoute.session_status || 'new')}
    savedTur={savedTur}
    savedRetur={savedRetur}
    onSaved={handleSaved}
    canSeeSums={canSeeSums}
    mode={auditMode ? 'audit' : 'normal'}
  />
)}
```

- [ ] **Step 9: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx apps/web/src/app/(dashboard)/numarare/CountingForm.tsx apps/web/src/app/(dashboard)/numarare/SuburbanCountingForm.tsx
git commit -m "feat(numarare): add audit flow in NumarareClient"
```

---

## Task 12: NumarareClient — afișare dublă sumă în coloana `Sumă (2 tarife)`

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx`

- [ ] **Step 1: Update interurban sum column rendering**

In `NumarareClient.tsx`, find the row rendering for `canSeeSums` in the interurban branch (around line 417-418):

Replace:
```tsx
{canSeeSums && (
  <td>{hasSums ? `${Math.round(dualTotal)} lei` : '—'}</td>
)}
```

With:
```tsx
{canSeeSums && (
  <td>
    {hasSums ? `${Math.round(dualTotal)} lei` : '—'}
    {route.audit_status === 'completed' && (
      <>
        <br />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {Math.round((Number(route.audit_tur_total_lei) || 0) + (Number(route.audit_retur_total_lei) || 0))} lei (audit)
        </span>
      </>
    )}
  </td>
)}
```

- [ ] **Step 2: Update period view sum column rendering**

Find the period table rendering for `dualTotal` (around line 329):

Replace:
```tsx
{canSeeSums && <td>{hasSums ? `${Math.round(dualTotal)} lei` : '—'}</td>}
```

With (after loop variables):
```tsx
// Inside the map, before return, add:
const auditTotal = (Number(route.audit_tur_total_lei) || 0) + (Number(route.audit_retur_total_lei) || 0);
const hasAudit = route.audit_sessions_count > 0;
// Then in JSX:
{canSeeSums && (
  <td>
    {hasSums ? `${Math.round(dualTotal)} lei` : '—'}
    {hasAudit && (
      <>
        <br />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {Math.round(auditTotal)} lei (audit, {route.audit_sessions_count})
        </span>
      </>
    )}
  </td>
)}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/(dashboard)/numarare/NumarareClient.tsx
git commit -m "feat(numarare): show audit sum alongside operator sum in list"
```

---

## Task 13: Testare manuală și deploy

**Files:** N/A

- [ ] **Step 1: Run full typecheck and tests**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npx tsc --noEmit && npx vitest run
```

Expected: all tests pass, no TS errors.

- [ ] **Step 2: Manual test — interurban audit flow**

Start dev server: `cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npm run dev`

In browser:
1. Login ca ADMIN_CAMERE.
2. Navigare la `/numarare`, alege o dată cu curse `completed`.
3. Verifică: lângă butonul "Deschide" pe o cursă completed există butonul `🔍 Audit`.
4. Click Audit → form se deschide cu bannerul roșu "MOD AUDIT".
5. Verifică: tur-ul și retur-ul sunt goale (slepy audit).
6. Introduce date diferite de operator → click "Salvează Tur (audit)".
7. Ieși din form (butonul Înapoi). Revino pe aceeași cursă.
8. Verifică: buton devine `🔍 Continuă audit`. Click → tur deja populat, retur gol.
9. Completează retur → Salvează Retur (audit).
10. Verifică: se deschide automat `AuditComparisonView` cu tabel comparativ.
11. Închide. În listă, coloana sumei arată `X lei` pe primul rând și `Y lei (audit)` pe al doilea.
12. Verifică: lângă butonul Audit există și butonul 📊 (comparație). Click → comparația se redeschide.
13. Click Refă audit → dialog confirm → totul resetat, butonul devine Audit simplu.

- [ ] **Step 3: Manual test — suburban audit flow**

Repetă pașii 2-12 pentru o cursă `suburban` completă. Verifică că comparația afișează grupuri pe (schedule, cycle).

- [ ] **Step 4: Manual test — access control**

1. Logout. Login ca OPERATOR_CAMERE.
2. Navigare `/numarare`. Verifică: butonul Audit NU este vizibil.
3. Verifică (în DevTools Network): apelul `getAuditComparison` returnează eroare `Acces interzis` dacă e invocat manual.

- [ ] **Step 5: Manual test — concurrent audit lock**

1. Deschide `/numarare` în două browsere diferite, ambele ca ADMIN_CAMERE (sau ADMIN + ADMIN_CAMERE).
2. În primul: click Audit pe o cursă. Form se deschide.
3. În al doilea: reîncarcă pagina, verifică că pe aceeași cursă butonul Audit e înlocuit cu `🔒 email_primul`.

- [ ] **Step 6: Commit final and deploy**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git log --oneline -20
# Verifică lista commit-urilor de audit
```

Dacă totul OK: push pentru auto-deploy.

```bash
git push origin main
```

`[AUTO-DEPLOY]` va fi detectat de hook-uri — Vercel și Railway se vor deploy-a automat.

---

## Self-Review Checklist

- [ ] All 7 spec sections have corresponding tasks:
  - Model de date → Task 1, 2
  - Server actions → Tasks 3, 4, 5, 7
  - UI flow → Tasks 8, 9, 10, 11, 12
  - Testare → Tasks 6 (pure fn), 13 (manual)
  - Securitate / RLS → Task 1 (policies)
- [ ] No placeholders (TBD/TODO) in code blocks.
- [ ] Types consistent: `AuditSavedEntry`, `ComparisonInput`, `ComparisonRow`, `AuditComparison` referenced correctly.
- [ ] Every task ends with commit.
- [ ] File paths exact. Checkbox syntax `- [ ]` for tracking.
