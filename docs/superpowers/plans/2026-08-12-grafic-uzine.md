# Grafic uzine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grilă săptămânală de atribuiri mașină+șofer pe cursele de uzină (desktop `/lde/grafic-uzine`, rol admin nou `UZINE`) + schimbări multi-zi din Telegram Mini App.

**Architecture:** Zero tabele noi — se refolosește `lde_weekly_template` (intenția recurentă) + `lde_atribuiri_zilnice` (planul real, materializare lazy idempotentă din `ensureDayMaterialized`). Pagina web materializează toate cele 7 zile L–D ale săptămânii curente la deschidere și editează rândurile direct; «și în șablon» scrie `lde_weekly_template` (afectează doar săptămânile viitoare). Invariant nou global: pe rândurile de uzină, mașina atribuită cere mereu șofer (titularul din `lde_active_assignments` se pune automat).

**Tech Stack:** Next.js 14 App Router (apps/admin), Supabase service-role (RLS deny-all), vitest, jose/bcryptjs pentru admin auth.

**Spec:** `docs/superpowers/specs/2026-08-12-grafic-uzine-design.md`

## Global Constraints

- UI în română; comunicare cu Ion în rusă. Timezone: `Europe/Chisinau`.
- NU se atinge `daily_assignments` din fluxul de uzină (contractul cronului 20:00 — rândurile `route_kind='uzina'` nu au write-through; nu adăuga unul).
- Acces DB doar prin `getSupabase()` (service-role); tabelele LDE au RLS deny-all — nu adăuga policies.
- Erorile DB nu se înghit (throw), pattern-ul existent din `core.ts`.
- Stil: fișierele existente folosesc inline styles + comentarii scurte în română — păstrează idiomul; modificări chirurgicale, fără refactor adiacent.
- Migrația nouă = **251** (`packages/db/migrations/251_grafic_uzine.sql`); se aplică pe proiectul Supabase `zqkzqpfdymddsywxjxow` (MCP `apply_migration`).
- Teste: `cd apps/admin && npm test` (vitest). Nu există test-DB — doar teste pe funcții pure.
- Commit-urile pot declanșa hook-ul `[AUTO-DEPLOY]` — urmează instrucțiunile din `CLAUDE.md` al proiectului când apare.
- La final (după ultimul task): rulează agenții `architecture-guardian` + `performance-reviewer` în paralel (regulă globală CLAUDE.md).

---

### Task 1: Migrația 251 — audit admin + rolul UZINE (DB, tipuri, middleware, sidebar)

**Files:**
- Create: `packages/db/migrations/251_grafic_uzine.sql`
- Modify: `packages/db/src/types.ts:40` (AdminRole)
- Modify: `apps/admin/src/middleware.ts:24` (UZINE_ALLOWED) și `:56-59` (gating)
- Modify: `apps/admin/src/components/Sidebar.tsx:56` (link nou în `ldeChildren`), `:322-334` (filtrare rol UZINE)

**Interfaces:**
- Produces: rolul `'UZINE'` valid în `admin_accounts.role` și în tipul `AdminRole`; coloanele `lde_atribuiri_zilnice.changed_by_admin`, `lde_weekly_template.updated_by_admin`; ruta `/lde/grafic-uzine` accesibilă pentru ADMIN+UZINE (UZINE e închis DOAR pe ea).

- [ ] **Step 1: Scrie migrația**

```sql
-- 251_grafic_uzine.sql
-- Grafic uzine (grilă săptămânală în panoul web admin):
--  1) audit pentru editările din admin (admin_accounts ≠ users/Telegram);
--  2) rol admin nou UZINE — vede doar /lde/grafic-uzine (managerul uzinelor, Alexei).

ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS changed_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL;

ALTER TABLE lde_weekly_template
  ADD COLUMN IF NOT EXISTS updated_by_admin uuid REFERENCES admin_accounts(id) ON DELETE SET NULL;

-- pattern identic cu 221_depozitar_manager_roles.sql (lista curentă live + UZINE)
DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE',
                    'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER',
                    'GESTIONAR', 'UZINE'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI, CONTABIL, DEPOZITAR, VINZATOR, MANAGER, GESTIONAR, UZINE (grafic uzine LDE).';
```

- [ ] **Step 2: Aplică migrația pe Supabase**

MCP `mcp__claude_ai_Supabase__apply_migration` cu `project_id: zqkzqpfdymddsywxjxow`, `name: 251_grafic_uzine`, conținutul de mai sus.
Verifică: `select column_name from information_schema.columns where table_name='lde_atribuiri_zilnice' and column_name='changed_by_admin';` → 1 rând.

- [ ] **Step 3: Extinde AdminRole**

În `packages/db/src/types.ts` linia 40, adaugă `| 'UZINE'` la final:

```ts
export type AdminRole = 'ADMIN' | 'DISPATCHER' | 'GRAFIC' | 'OPERATOR_CAMERE' | 'ADMIN_CAMERE' | 'EVALUATOR_INCASARI' | 'CONTABIL' | 'DEPOZITAR' | 'VINZATOR' | 'MANAGER' | 'GESTIONAR' | 'UZINE';
```

- [ ] **Step 4: Middleware — închide UZINE pe pagina lui**

În `apps/admin/src/middleware.ts`, sub linia 24 (`GRAFIC_ALLOWED`):

```ts
const UZINE_ALLOWED = ['/lde/grafic-uzine'];
```

și după blocul `if (role === 'GRAFIC') {...}` (linia 59):

```ts
    if (role === 'UZINE') {
      const allowed = UZINE_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
      if (!allowed) return NextResponse.redirect(new URL('/lde/grafic-uzine', request.url));
    }
```

- [ ] **Step 5: Sidebar — link nou + vizibilitate UZINE**

În `apps/admin/src/components/Sidebar.tsx`, în `ldeChildren` imediat după rândul `/lde/atribuiri` (linia 56):

```ts
  { href: '/lde/grafic-uzine',   label: 'Grafic uzine',   adminOnly: true, icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
```

În `filteredNav` (linia 322-325), adaugă ramura UZINE (nav gol):

```ts
    : role === 'UZINE' ? []
```

imediat înaintea ramurii `: role === 'OPERATOR_CAMERE' || ...`. În `filteredModules` (linia 330-334), adaugă înaintea ramurii finale `: []`:

```ts
    : role === 'UZINE'
      ? moduleItems.filter(m => m.href === '/lde').map(m => ({ ...m, children: m.children?.filter(c => c.href === '/lde/grafic-uzine'), subGroup: undefined }))
```

(`showNomenclator` rămâne cum e — UZINE nu e ADMIN/DISPATCHER, deci nu-l vede.)

- [ ] **Step 6: Verifică compilarea**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | head -20`
Expected: fără erori noi (erorile pre-existente, dacă există, se ignoră — compară cu `git stash && npx tsc --noEmit` la nevoie).

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/251_grafic_uzine.sql packages/db/src/types.ts apps/admin/src/middleware.ts apps/admin/src/components/Sidebar.tsx
git commit -m "feat(lde): migrația 251 — rol UZINE + audit admin pe atribuiri/șablon"
```

---

### Task 2: Helper pur `weekDates` (TDD)

**Files:**
- Create: `apps/admin/src/lib/atribuiri/saptamana.ts`
- Test: `apps/admin/src/lib/atribuiri/saptamana.test.ts`

**Interfaces:**
- Produces: `weekDates(todayYMD: string): string[]` — cele 7 date L→D ale săptămânii ISO care conține `todayYMD`. Pur, fără DB. Consumat de Task 3 (`listSaptamana` nu-l cere, dar actions din Task 5 da) și de client.

- [ ] **Step 1: Scrie testul (failing)**

```ts
// apps/admin/src/lib/atribuiri/saptamana.test.ts
import { describe, it, expect } from 'vitest';
import { weekDates } from './saptamana';

describe('weekDates', () => {
  it('miercuri → săptămâna L 10.08 – D 16.08', () => {
    expect(weekDates('2026-08-12')).toEqual([
      '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
      '2026-08-14', '2026-08-15', '2026-08-16',
    ]);
  });
  it('luni → începe cu ea însăși', () => {
    expect(weekDates('2026-08-10')[0]).toBe('2026-08-10');
  });
  it('duminică → începe cu lunea din urmă', () => {
    expect(weekDates('2026-08-16')).toEqual(weekDates('2026-08-10'));
  });
  it('trecere de an', () => {
    expect(weekDates('2026-01-01')).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
      '2026-01-02', '2026-01-03', '2026-01-04',
    ]);
  });
});
```

- [ ] **Step 2: Rulează testul — trebuie să pice**

Run: `cd apps/admin && npx vitest run src/lib/atribuiri/saptamana.test.ts`
Expected: FAIL — `Cannot find module './saptamana'`.

- [ ] **Step 3: Implementarea minimă**

```ts
// apps/admin/src/lib/atribuiri/saptamana.ts
// Helper pur (fără DB) pentru grila săptămânală — testabil izolat.

/** Cele 7 date L→D (YYYY-MM-DD) ale săptămânii ISO care conține ziua dată. */
export function weekDates(todayYMD: string): string[] {
  const d = new Date(`${todayYMD}T12:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Luni … 7=Duminică
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (wd - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}
```

- [ ] **Step 4: Rulează testele — verde**

Run: `cd apps/admin && npx vitest run src/lib/atribuiri/saptamana.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/atribuiri/saptamana.ts apps/admin/src/lib/atribuiri/saptamana.test.ts
git commit -m "feat(lde): weekDates — săptămâna ISO pentru graficul uzinelor"
```

---

### Task 3: Core — invariant mașină⇒șofer, audit admin, `atribuieMulti`, `listSaptamana`

**Files:**
- Modify: `apps/admin/src/lib/atribuiri/core.ts` (funcțiile `updateRow`, `atribuie`, `atribuieSofer`, `setTemplateCell`, `confirmaManual` + funcții noi)

**Interfaces:**
- Consumes: `weekDates` NU e folosit aici (datele vin ca parametru); folosește `isoWeekday` existent.
- Produces (semnături exacte, consumate de Task 4/5/6):
  - `titularForVehicle(vehicleId: string, shiftNumber: number): Promise<string | null>`
  - `atribuieMulti(p: AtribuieMultiParams, userId: string | null, adminId?: string | null): Promise<{ updated: number }>` cu `AtribuieMultiParams = { factoryRouteId: string; shiftNumber: number; dates: string[]; vehicleId: string | null; driverId?: string | null; siInSablon?: boolean }`
  - `listSaptamana(uzinaId: string, dates: string[]): Promise<AtribuireView[]>`
  - Semnături schimbate (compatibil cu apelurile existente — parametru opțional nou la final): `atribuie(rowId, vehicleId, userId, adminId?)`, `atribuieSofer(rowId, driverId, userId, adminId?)`, `setTemplateCell(frId, shift, weekday, vehicleId, userId, adminId?)`, `confirmaManual(rowId, userId, adminId?)`. `userId` devine `string | null` peste tot (null = editare din web).

- [ ] **Step 1: `titularForVehicle` (extras din logica `ensureDayMaterialized`)**

Adaugă după `chisinauToday()`/`isoWeekday()`:

```ts
/** Șoferul titular al unei mașini din lde_active_assignments (schimb exact, apoi orice schimb). */
export async function titularForVehicle(vehicleId: string, shiftNumber: number): Promise<string | null> {
  const { data } = await getSupabase()
    .from('lde_active_assignments')
    .select('driver_id, shift_number')
    .eq('vehicle_id', vehicleId)
    .is('valid_to', null);
  const rows = data ?? [];
  const exact = rows.find((r) => r.shift_number === shiftNumber);
  return ((exact ?? rows[0])?.driver_id as string | undefined) ?? null;
}
```

- [ ] **Step 2: audit admin în `updateRow`**

Schimbă semnătura și patch-ul (linia 302-322):

```ts
async function updateRow(
  rowId: string, patch: Record<string, unknown>, userId: string | null, adminId?: string | null,
): Promise<{ prev: AtribuireRow; next: AtribuireRow }> {
```

iar în `.update({...})`:

```ts
    .update({ ...patch, status, changed_by: userId, changed_by_admin: adminId ?? null, changed_at: new Date().toISOString() })
```

- [ ] **Step 3: invariantul în `atribuie`**

Înlocuiește corpul `atribuie` (linia 325-331):

```ts
/** Atribuie o mașină pe un rând (autorizarea pe direcție se face în API/actions).
 *  Pe uzine mașina merge mereu cu șofer: titularul se pune automat; golirea mașinii curăță șoferul. */
export async function atribuie(rowId: string, vehicleId: string | null, userId: string | null, adminId?: string | null): Promise<AtribuireRow> {
  const { data: r0 } = await getSupabase().from('lde_atribuiri_zilnice')
    .select('route_kind, shift_number, driver_id').eq('id', rowId).maybeSingle();
  const patch: Record<string, unknown> = { vehicle_id: vehicleId };
  if (r0?.route_kind === 'uzina') {
    if (vehicleId == null) patch.driver_id = null;
    else patch.driver_id = (await titularForVehicle(vehicleId, (r0.shift_number as number) ?? 1)) ?? r0.driver_id ?? null;
  }
  const { prev, next } = await updateRow(rowId, patch, userId, adminId);
  if (prev.route_kind !== 'uzina' && prev.crm_route_id != null) {
    await writeThroughCrm(prev.date, prev.crm_route_id, vehicleId);
  }
  return next;
}
```

- [ ] **Step 4: invariantul în `atribuieSofer`**

În blocul `if (driverId == null)` (linia 336-342), selectează și `vehicle_id` și blochează scoaterea când mașina e atribuită:

```ts
  if (driverId == null) {
    const { data: r } = await getSupabase()
      .from('lde_atribuiri_zilnice').select('route_kind, vehicle_id').eq('id', rowId).maybeSingle();
    if (r && r.route_kind !== 'uzina') {
      throw new Error('Cursa din orar trebuie să aibă șofer — alege altul în loc să-l scoți');
    }
    if (r && r.route_kind === 'uzina' && r.vehicle_id) {
      throw new Error('Mașina atribuită trebuie să aibă șofer — înlocuiește-l sau golește mașina');
    }
  }
```

și actualizează semnătura: `atribuieSofer(rowId: string, driverId: string | null, userId: string | null, adminId?: string | null)` — pasează `adminId` la `updateRow`.

- [ ] **Step 5: audit în `setTemplateCell` și `confirmaManual`**

`setTemplateCell(..., userId: string | null, adminId?: string | null)`; în upsert: `updated_by: userId, updated_by_admin: adminId ?? null`. `confirmaManual(rowId: string, userId: string | null, adminId?: string | null)`; în update: `changed_by: userId, changed_by_admin: adminId ?? null`.

- [ ] **Step 6: `atribuieMulti` + `listSaptamana`**

Adaugă la finalul fișierului:

```ts
export interface AtribuieMultiParams {
  factoryRouteId: string;
  shiftNumber: number;
  dates: string[];           // YYYY-MM-DD — zilele bifate
  vehicleId: string | null;  // null = golește cursa (curăță și șoferul)
  driverId?: string | null;  // omis/null = auto (titularul mașinii)
  siInSablon?: boolean;      // scrie și lde_weekly_template pe weekday-urile zilelor
}

/** Schimbare pe una sau mai multe zile — nucleul grilei săptămânale (web) și al
 *  «Aplică și pe alte zile» (mini app). Zilele fără rând (uzina nu lucrează) se sar. */
export async function atribuieMulti(
  p: AtribuieMultiParams, userId: string | null, adminId?: string | null,
): Promise<{ updated: number }> {
  const db = getSupabase();
  const routeKey = `uzina:${p.factoryRouteId}:${p.shiftNumber}`;
  let driverId = p.driverId ?? null;
  if (p.vehicleId == null) driverId = null;
  else if (driverId == null) {
    driverId = await titularForVehicle(p.vehicleId, p.shiftNumber);
    if (driverId == null) throw new Error('Mașina nu are șofer titular — alege șoferul explicit');
  }
  let updated = 0;
  for (const date of [...new Set(p.dates)].sort()) {
    await ensureDayMaterialized(date);
    const { data: row } = await db.from('lde_atribuiri_zilnice')
      .select('id').eq('date', date).eq('route_key', routeKey).maybeSingle();
    if (!row) continue;
    await updateRow(row.id, { vehicle_id: p.vehicleId, driver_id: driverId }, userId, adminId);
    updated++;
  }
  if (p.siInSablon && p.vehicleId != null) {
    for (const wd of [...new Set(p.dates.map(isoWeekday))]) {
      await setTemplateCell(p.factoryRouteId, p.shiftNumber, wd, p.vehicleId, userId, adminId);
    }
  }
  return { updated };
}

/** Rândurile unei uzine pe un set de zile (materializează fiecare zi — idempotent). */
export async function listSaptamana(uzinaId: string, dates: string[]): Promise<AtribuireView[]> {
  const out: AtribuireView[] = [];
  for (const d of dates) out.push(...await listZi(d, [uzinaId]));
  return out;
}
```

- [ ] **Step 7: Verifică apelurile existente + compilarea**

`grep -rn "atribuie(\|atribuieSofer(\|setTemplateCell(\|confirmaManual(" apps/admin/src --include="*.ts" --include="*.tsx" | grep -v "core.ts\|export"` — apelurile din `api/atribuiri/*` pasează `auth.user.id` (string) → compatibil.
Run: `cd apps/admin && npx tsc --noEmit 2>&1 | head -20` → fără erori noi.
Run: `cd apps/admin && npm test` → verde (testele existente + saptamana).

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/lib/atribuiri/core.ts
git commit -m "feat(lde): core atribuiri — invariant mașină⇒șofer, atribuieMulti, listSaptamana, audit admin"
```

---

### Task 4: API `/api/atribuiri/atribuie-multi` (mini app)

**Files:**
- Create: `apps/admin/src/app/api/atribuiri/atribuie-multi/route.ts`

**Interfaces:**
- Consumes: `atribuieMulti`, `uzinaOfRoute` (core), `authAtribuiri`, `canDirection` (auth).
- Produces: `POST {factoryRouteId, shiftNumber, dates[], vehicleId, driverId?, siInSablon?}` → `{ updated: number }`; erori 400/401/403/404/500 ca la `/atribuie`.

- [ ] **Step 1: Scrie ruta (pattern identic cu `atribuie/route.ts`)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { authAtribuiri, canDirection } from '@/lib/atribuiri/auth';
import { atribuieMulti, uzinaOfRoute, type AtribuieMultiParams } from '@/lib/atribuiri/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authAtribuiri(req.headers.get('x-telegram-init-data'));
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as Partial<AtribuieMultiParams> | null;
  if (!body?.factoryRouteId || !body.shiftNumber || !Array.isArray(body.dates) || !body.dates.length
      || body.dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return NextResponse.json({ error: 'parametri lipsă' }, { status: 400 });
  }

  const direction = await uzinaOfRoute(body.factoryRouteId);
  if (!direction) return NextResponse.json({ error: 'rută inexistentă' }, { status: 404 });
  if (!canDirection(auth, direction)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const res = await atribuieMulti(body as AtribuieMultiParams, auth.user.id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'eroare' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Compilare + commit**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | head -5` → curat.

```bash
git add apps/admin/src/app/api/atribuiri/atribuie-multi/route.ts
git commit -m "feat(lde): endpoint atribuie-multi — schimbări pe mai multe zile"
```

---

### Task 5: Pagina web `/lde/grafic-uzine`

**Files:**
- Create: `apps/admin/src/app/(dashboard)/lde/grafic-uzine/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/lde/grafic-uzine/actions.ts`
- Create: `apps/admin/src/app/(dashboard)/lde/grafic-uzine/GraficUzineClient.tsx`

**Interfaces:**
- Consumes: `verifySession` (`@/lib/auth`), core: `uzineCuSablon`, `listSaptamana`, `atribuieMulti`, `confirmaManual`, `vehiclesForPicker`, `soferiForPicker`, `titularForVehicle`, `chisinauToday`; `weekDates` (saptamana); tipul `AtribuireView` din core.
- Produces: pagina completă; nimic consumat de alte task-uri.

- [ ] **Step 1: `actions.ts`**

```ts
'use server';

import { verifySession, type Session } from '@/lib/auth';
import {
  uzineCuSablon, listSaptamana, atribuieMulti, confirmaManual,
  vehiclesForPicker, soferiForPicker, titularForVehicle, chisinauToday,
  type AtribuieMultiParams, type AtribuireView,
} from '@/lib/atribuiri/core';
import { weekDates } from '@/lib/atribuiri/saptamana';

// Server actions pentru grila săptămânală de uzine. Rolul UZINE (Alexei) e închis
// pe pagina asta din middleware; aici doar re-verificăm sesiunea + rolul.

async function requireUzineRole(): Promise<Session> {
  const s = await verifySession();
  if (!s || (s.role !== 'ADMIN' && s.role !== 'UZINE')) throw new Error('Neautorizat');
  return s;
}

export async function getUzineTabs() {
  await requireUzineRole();
  return uzineCuSablon(); // {id, label}[] — doar active + has_weekly_template (fără Trox)
}

export async function getSaptamana(uzinaId: string) {
  await requireUzineRole();
  const today = chisinauToday();
  const dates = weekDates(today);
  const rows = await listSaptamana(uzinaId, dates);
  return { today, dates, rows };
}

export async function getPickers(uzinaId: string) {
  await requireUzineRole();
  const [vehicles, soferi] = await Promise.all([vehiclesForPicker(uzinaId), soferiForPicker(uzinaId)]);
  return { vehicles, soferi };
}

export async function getTitularId(vehicleId: string, shiftNumber: number) {
  await requireUzineRole();
  return titularForVehicle(vehicleId, shiftNumber);
}

export async function salveazaMulti(p: AtribuieMultiParams) {
  const s = await requireUzineRole();
  return atribuieMulti(p, null, s.id);
}

export async function confirmaManualAdmin(rowId: string) {
  const s = await requireUzineRole();
  await confirmaManual(rowId, null, s.id);
}

export type { AtribuireView };
```

- [ ] **Step 2: `page.tsx`**

```tsx
export const dynamic = 'force-dynamic';

import { verifySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUzineTabs, getSaptamana } from './actions';
import GraficUzineClient from './GraficUzineClient';

export default async function GraficUzinePage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN' && session.role !== 'UZINE') redirect('/login');

  const uzine = await getUzineTabs();
  const first = uzine[0]?.id ?? null;
  const initial = first ? await getSaptamana(first) : null;

  return <GraficUzineClient uzine={uzine} initialUzina={first} initial={initial} />;
}
```

- [ ] **Step 3: `GraficUzineClient.tsx`** — grila + popup (conform mockup v2)

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSaptamana, getPickers, getTitularId, salveazaMulti, confirmaManualAdmin, type AtribuireView } from './actions';

// Grila săptămânală de uzine (mockup v2, 12.08.2026): o uzină pe ecran (tab-uri),
// rânduri = rută×schimb, coloane = L–D; popup cu căutare instant, zile multi-select,
// «și în șablon». Invariantul mașină⇒șofer e dublat pe server (core.atribuieMulti).

const ZI_LABEL = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const CELL: Record<string, { bg: string; fg: string }> = {
  planificat:         { bg: '#f4f4f5', fg: '#3f3f46' },
  modificat_proactiv: { bg: '#ffedd5', fg: '#9a3412' },
  modificat_reactiv:  { bg: '#ffedd5', fg: '#9a3412' },
  confirmat_auto:     { bg: '#dcfce7', fg: '#166534' },
  confirmat_manual:   { bg: '#dcfce7', fg: '#166534' },
  nepotrivire:        { bg: '#fee2e2', fg: '#b91c1c' },
  fara_date_gps:      { bg: '#fafafa', fg: '#8a7f86' },
};
const shortName = (full: string | null) => {
  if (!full) return '';
  const p = full.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
};
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;

type Week = { today: string; dates: string[]; rows: AtribuireView[] };
type Pickers = { vehicles: { id: string; plate: string; inDirection: boolean }[]; soferi: { id: string; name: string; inDirection: boolean }[] };

export default function GraficUzineClient({ uzine, initialUzina, initial }: {
  uzine: { id: string; label: string }[];
  initialUzina: string | null;
  initial: Week | null;
}) {
  const [uzina, setUzina] = useState(initialUzina);
  const [week, setWeek] = useState<Week | null>(initial);
  const [pickers, setPickers] = useState<Pickers | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // popup: celula clicată + starea formularului
  const [popup, setPopup] = useState<AtribuireView | null>(null);
  const [selVehicle, setSelVehicle] = useState<string | null>(null);
  const [selDriver, setSelDriver] = useState<string | null>(null);
  const [selDates, setSelDates] = useState<string[]>([]);
  const [inSablon, setInSablon] = useState(false);
  const [qVeh, setQVeh] = useState('');
  const [qSof, setQSof] = useState('');

  const load = useCallback(async (uz: string) => {
    setErr(null);
    try { setWeek(await getSaptamana(uz)); } catch { setErr('Eroare la încărcare — reîncearcă.'); }
  }, []);

  useEffect(() => {
    if (!uzina) return;
    setPickers(null);
    getPickers(uzina).then(setPickers).catch(() => setPickers({ vehicles: [], soferi: [] }));
  }, [uzina]);

  // grila: rânduri distincte (route_key) × coloane (dates)
  const grid = useMemo(() => {
    if (!week) return { keys: [] as { key: string; label: string; frId: string; shift: number }[], cell: new Map<string, AtribuireView>() };
    const keys = new Map<string, { key: string; label: string; frId: string; shift: number }>();
    const cell = new Map<string, AtribuireView>();
    for (const r of week.rows) {
      if (!keys.has(r.route_key)) keys.set(r.route_key, { key: r.route_key, label: r.route_label, frId: r.factory_route_id!, shift: r.shift_number! });
      cell.set(`${r.route_key}|${r.date}`, r);
    }
    return { keys: [...keys.values()].sort((a, b) => a.label.localeCompare(b.label)), cell };
  }, [week]);

  function openPopup(r: AtribuireView) {
    setPopup(r);
    setSelVehicle(r.vehicle_id);
    setSelDriver(r.driver_id);
    setSelDates([r.date]);
    setInSablon(false);
    setQVeh(''); setQSof('');
  }

  async function pickVehicle(vid: string | null) {
    setSelVehicle(vid);
    if (vid == null) { setSelDriver(null); return; }
    // titularul se completează automat (spec: mașina merge mereu cu șofer)
    const tit = await getTitularId(vid, popup!.shift_number!).catch(() => null);
    if (tit) setSelDriver(tit);
    else if (selVehicle !== vid) setSelDriver(null);
  }

  async function save() {
    if (!popup || busy) return;
    setBusy(true); setErr(null);
    try {
      await salveazaMulti({
        factoryRouteId: popup.factory_route_id!, shiftNumber: popup.shift_number!,
        dates: selDates, vehicleId: selVehicle, driverId: selDriver, siInSablon: inSablon,
      });
      setPopup(null);
      if (uzina) await load(uzina);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Eroare la salvare'); }
    setBusy(false);
  }

  async function confirmaManual() {
    if (!popup || busy) return;
    setBusy(true); setErr(null);
    try { await confirmaManualAdmin(popup.id); setPopup(null); if (uzina) await load(uzina); }
    catch { setErr('Eroare la confirmare'); }
    setBusy(false);
  }

  const vehList = useMemo(() => {
    if (!pickers) return [];
    const n = qVeh.trim().toUpperCase().replace(/\s+/g, '');
    return (n ? pickers.vehicles.filter((v) => v.plate.includes(n)) : pickers.vehicles).slice(0, 30);
  }, [pickers, qVeh]);
  const sofList = useMemo(() => {
    if (!pickers) return [];
    const n = qSof.trim().toLowerCase();
    return (n ? pickers.soferi.filter((s) => s.name.toLowerCase().includes(n)) : pickers.soferi).slice(0, 30);
  }, [pickers, qSof]);

  const canSave = selDates.length > 0 && (selVehicle == null || selDriver != null);
  const interval = week ? `Luni ${ddmm(week.dates[0])} – Duminică ${ddmm(week.dates[6])}` : '';

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Grafic uzine</h1>
        <div style={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}>{interval}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {uzine.map((u) => (
          <button key={u.id}
            onClick={() => { setUzina(u.id); setWeek(null); load(u.id); }}
            style={{
              padding: '9px 16px', borderRadius: 11, fontSize: 14, fontWeight: u.id === uzina ? 700 : 600,
              cursor: 'pointer', border: 'none',
              background: u.id === uzina ? '#18181b' : '#f4f4f5', color: u.id === uzina ? '#fff' : '#3f3f46',
            }}>{u.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#52525b', marginBottom: 12 }}>
        <span>▢ planificat</span><span style={{ color: '#9a3412' }}>▢ modificat</span>
        <span style={{ color: '#166534' }}>▢ confirmat GPS</span><span style={{ color: '#b91c1c' }}>▢ nepotrivire</span>
        <span style={{ color: '#a16207' }}>▢ fără mașină</span>
      </div>

      {err && <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div>}
      {!week && !err && <div style={{ color: '#8a7f86', padding: 20 }}>Se încarcă…</div>}

      {week && (
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 3, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ fontSize: 12, color: '#71717a' }}>
              <td style={{ width: 200 }} />
              {week.dates.map((d, i) => (
                <td key={d} style={{ textAlign: 'center', fontWeight: d === week.today ? 800 : 400, color: d === week.today ? '#2563eb' : undefined }}>
                  {ZI_LABEL[i]} {ddmm(d)}{d === week.today ? ' · azi' : ''}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.keys.map((k) => (
              <tr key={k.key} style={{ fontSize: 12 }}>
                <td style={{ fontWeight: 600, fontSize: 13, color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.label}>{k.label}</td>
                {week.dates.map((d) => {
                  const r = grid.cell.get(`${k.key}|${d}`);
                  if (!r) return <td key={d} style={{ background: '#fafafa', borderRadius: 7, textAlign: 'center', color: '#d4d4d8', fontSize: 11, padding: '6px 4px' }}>nu lucrează</td>;
                  const c = r.vehicle_id ? (CELL[r.status] ?? CELL.planificat) : { bg: '#fef3c7', fg: '#a16207' };
                  const isToday = d === week.today;
                  return (
                    <td key={d}
                      onClick={() => openPopup(r)}
                      title={r.verification_note ?? undefined}
                      style={{
                        background: c.bg, color: c.fg, borderRadius: 7, textAlign: 'center', padding: '6px 4px',
                        cursor: 'pointer', border: isToday ? '2px solid #2563eb' : '2px solid transparent',
                      }}>
                      <b style={{ fontFamily: 'ui-monospace, monospace' }}>{r.plate ?? '—'}</b>
                      <div style={{ opacity: 0.78, fontSize: 11 }}>{r.driver_name ? shortName(r.driver_name) : (r.vehicle_id ? '' : 'alege')}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {popup && (
        <div onClick={() => setPopup(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 20, width: 400, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{popup.route_label}</div>
            <div style={{ fontSize: 12, color: '#71717a', marginBottom: 12 }}>{ZI_LABEL[week!.dates.indexOf(popup.date)]} {ddmm(popup.date)}</div>

            {popup.status === 'nepotrivire' && (
              <div style={{ background: '#fee2e2', borderRadius: 9, padding: '9px 11px', fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>
                <b>Nepotrivire</b>{popup.verification_note ? ` · ${popup.verification_note}` : ''}
                <button onClick={confirmaManual} disabled={busy}
                  style={{ display: 'block', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  ✓ Confirmă manual
                </button>
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Mașina</div>
            <input placeholder="Caută numărul…" value={qVeh} onChange={(e) => setQVeh(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {selVehicle && (
                <button onClick={() => pickVehicle(null)}
                  style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, cursor: 'pointer', border: '1px solid #e4e4e7', background: '#f4f4f5', color: '#b91c1c' }}>✕ golește</button>
              )}
              {vehList.map((v) => {
                const isCur = v.id === selVehicle;
                const isTpl = v.id === popup.template_vehicle_id;
                return (
                  <button key={v.id} onClick={() => pickVehicle(v.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'ui-monospace, monospace',
                      border: isTpl && !isCur ? '1px dashed #a1a1aa' : '1px solid transparent',
                      background: isCur ? '#2563eb' : '#f4f4f5', color: isCur ? '#fff' : v.inDirection ? '#3f3f46' : '#a1a1aa',
                    }}>{v.plate}{isTpl ? ' · șablon' : ''}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 12 }}>Șoferul titular se completează automat la alegerea mașinii.</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Șoferul {selVehicle && <span style={{ color: '#b91c1c' }}>· obligatoriu</span>}
            </div>
            <input placeholder="Caută șoferul…" value={qSof} onChange={(e) => setQSof(e.target.value)} disabled={!selVehicle}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', boxSizing: 'border-box', marginBottom: 8, opacity: selVehicle ? 1 : 0.5 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, opacity: selVehicle ? 1 : 0.5 }}>
              {sofList.map((s) => {
                const isCur = s.id === selDriver;
                return (
                  <button key={s.id} onClick={() => selVehicle && setSelDriver(s.id)} disabled={!selVehicle}
                    style={{
                      padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: isCur ? '#2563eb' : '#f4f4f5', color: isCur ? '#fff' : s.inDirection ? '#3f3f46' : '#a1a1aa',
                    }}>{s.name}</button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Se aplică pe zilele</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {week!.dates.map((d, i) => {
                const exists = !!grid.cell.get(`${popup.route_key}|${d}`);
                const on = selDates.includes(d);
                return (
                  <button key={d} disabled={!exists}
                    onClick={() => setSelDates((s) => (on ? s.filter((x) => x !== d) : [...s, d]))}
                    style={{
                      width: 42, padding: '8px 0', borderRadius: 9, fontSize: 13, cursor: exists ? 'pointer' : 'default', border: 'none',
                      background: on ? '#2563eb' : exists ? '#f4f4f5' : '#fafafa',
                      color: on ? '#fff' : exists ? (d < week!.today ? '#a1a1aa' : '#3f3f46') : '#d4d4d8',
                      fontWeight: on ? 700 : 400,
                    }}>{ZI_LABEL[i]}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 12 }}>Zilele trecute se bifează doar pentru corecții.</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: selVehicle ? '#3f3f46' : '#a1a1aa', marginBottom: 16 }}>
              <input type="checkbox" checked={inSablon} disabled={!selVehicle} onChange={(e) => setInSablon(e.target.checked)} />
              Salvează și în șablon (permanent, doar mașina)
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={!canSave || busy}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none',
                  cursor: canSave && !busy ? 'pointer' : 'default',
                  background: canSave && !busy ? '#2563eb' : '#cbd5e1', color: '#fff',
                }}>{busy ? 'Se salvează…' : `Salvează · ${selDates.length} ${selDates.length === 1 ? 'zi' : 'zile'}`}</button>
              <button onClick={() => setPopup(null)}
                style={{ padding: '11px 16px', borderRadius: 10, fontSize: 14, border: 'none', background: '#f4f4f5', color: '#3f3f46', cursor: 'pointer' }}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Compilare + verificare vizuală**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | head -20` → curat.
Run: `cd apps/admin && npm run dev` (background) → login ca ADMIN → `/lde/grafic-uzine`: tab-urile apar, grila se încarcă (materializează săptămâna — verifică în DB: `select count(*) from lde_atribuiri_zilnice where date between '<luni>' and '<duminică>' and route_kind='uzina';` > 0), popup-ul se deschide, salvarea pe 2 zile funcționează. Oprește dev-serverul.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/lde/grafic-uzine"
git commit -m "feat(lde): pagina /lde/grafic-uzine — grilă săptămânală uzine cu editare multi-zi"
```

---

### Task 6: Mini App — «Aplică și pe alte zile?» + invariantul în UI

**Files:**
- Modify: `apps/admin/src/app/mini-app/atribuiri/[dir]/page.tsx` (funcțiile `pick`/`pickSofer`, prop `allowRemove`, panou multi-zi)

**Interfaces:**
- Consumes: endpoint `/api/atribuiri/atribuie-multi` (Task 4); `weekDates` NU — zilele se calculează local (`chisinauDay` există în `ui.ts`, dar aici trebuie săptămâna datei curent selectate — vezi Step 2).
- Produces: nimic pentru alte task-uri.

- [ ] **Step 1: `allowRemove` respectă invariantul**

În `[dir]/page.tsx` linia 155, înlocuiește:

```tsx
          allowRemove={soferPicker.route_kind === 'uzina' && !soferPicker.vehicle_id}
```

(pe cursele de uzină cu mașină atribuită șoferul se poate doar înlocui; serverul aruncă oricum — Task 3.)

- [ ] **Step 2: starea + panoul «Aplică și pe alte zile?»**

Adaugă starea (lângă `const [foaieErr...]`, linia 25):

```tsx
  const [multiZi, setMultiZi] = useState<{ row: AtribuireView; vehicleId: string | null; driverId?: string | null } | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
```

Adaugă helperul săptămânii (după `const date = ...`, linia 17):

```tsx
  // săptămâna ISO a zilei afișate — pentru «Aplică și pe alte zile?»
  const saptamana = (() => {
    const d = new Date(`${date}T12:00:00Z`);
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const luni = new Date(d); luni.setUTCDate(d.getUTCDate() - (wd - 1));
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(luni); x.setUTCDate(luni.getUTCDate() + i); return x.toISOString().slice(0, 10); });
  })();
  const ZI = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
```

În `pick()` (după `load()`, linia 46) și în `pickSofer()` (după `load()`, linia 56), doar pentru uzine:

```tsx
    if (row.route_kind === 'uzina') { setMultiZi({ row, vehicleId }); setMultiSel([]); }
```

respectiv în `pickSofer`:

```tsx
    if (row.route_kind === 'uzina') { setMultiZi({ row, vehicleId: row.vehicle_id, driverId }); setMultiSel([]); }
```

și funcția de aplicare (după `saveFoaie()`):

```tsx
  async function aplicaMultiZi() {
    if (!multiZi || !multiSel.length) return;
    const resp = await api('/atribuie-multi', {
      method: 'POST',
      body: JSON.stringify({
        factoryRouteId: multiZi.row.factory_route_id, shiftNumber: multiZi.row.shift_number,
        dates: multiSel, vehicleId: multiZi.vehicleId, driverId: multiZi.driverId,
      }),
    }).catch(() => null);
    setMultiZi(null);
    if (resp?.ok) load();
  }
```

- [ ] **Step 3: randarea panoului**

În interiorul map-ului de carduri, imediat după `</div>` care închide chip-urile (înainte de închiderea cardului, după linia 137), adaugă:

```tsx
            {multiZi?.row.id === r.id && (
              <div style={{ flexBasis: '100%', background: '#eff6ff', borderRadius: 9, padding: 8, marginTop: 6 }}>
                <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600, marginBottom: 6 }}>Aplică și pe alte zile?</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {saptamana.filter((d) => d !== date).map((d) => {
                    const on = multiSel.includes(d);
                    return (
                      <button key={d}
                        onClick={() => setMultiSel((s) => (on ? s.filter((x) => x !== d) : [...s, d]))}
                        style={{
                          width: 30, padding: '5px 0', borderRadius: 7, fontSize: 11, border: 'none', cursor: 'pointer',
                          background: on ? '#2563eb' : '#dbeafe', color: on ? '#fff' : '#1d4ed8', fontWeight: on ? 700 : 400,
                        }}>{ZI[saptamana.indexOf(d)]}</button>
                    );
                  })}
                  <button onClick={aplicaMultiZi} disabled={!multiSel.length}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, border: 'none',
                      cursor: multiSel.length ? 'pointer' : 'default',
                      background: multiSel.length ? '#2563eb' : '#dbeafe', color: multiSel.length ? '#fff' : '#93b3ed',
                    }}>Aplică</button>
                  <button onClick={() => setMultiZi(null)}
                    style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11, border: 'none', background: 'transparent', color: '#1d4ed8', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            )}
```

iar pe containerul cardului (linia 88-92) adaugă `flexWrap: 'wrap'` la style, ca panoul (flexBasis 100%) să cadă pe rândul următor.

- [ ] **Step 4: Compilare + verificare + commit**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | head -5` → curat.

```bash
git add "apps/admin/src/app/mini-app/atribuiri/[dir]/page.tsx"
git commit -m "feat(lde): mini app — aplică pe mai multe zile + șofer obligatoriu la mașină atribuită"
```

---

### Task 7: Contul lui Alexei + verificare E2E

**Files:** niciunul (operațiuni DB + verificare manuală).

- [ ] **Step 1: Generează parola și hash-ul**

```bash
cd apps/admin && node -e "
const b = require('bcryptjs');
const pw = require('crypto').randomBytes(9).toString('base64url');
console.log('PAROLA:', pw);
console.log('HASH:', b.hashSync(pw, 10));
"
```

- [ ] **Step 2: Creează contul (SQL pe Supabase, proiect zqkzqpfdymddsywxjxow)**

```sql
insert into admin_accounts (email, password_hash, role)
values ('alexei@translux.md', '<HASH>', 'UZINE')
returning id, email, role;
```

(Dacă tabela are coloana `active`, default-ul o lasă activă — nu o seta explicit.)

- [ ] **Step 3: E2E pe producție (după deploy)**

1. Login cu `alexei@translux.md` → redirect/acces DOAR la `/lde/grafic-uzine` (orice alt URL → redirect înapoi).
2. Grila: schimbă mașina pe o cursă pe 2 zile → celulele devin portocalii; deschide mini app-ul pe una din zile → aceeași mașină+șofer.
3. Bifează «și în șablon» pe o schimbare → `select * from lde_weekly_template where factory_route_id='<id>' and weekday=<wd>;` arată noua mașină.
4. Mini app: schimbă o mașină → apare «Aplică și pe alte zile?» → bifează o zi → verifică în grilă.
5. Încearcă să scoți șoferul pe un rând cu mașină (mini app) → butonul «scoate șoferul» nu mai apare.
6. Raportează parola lui Ion în chat (el i-o transmite lui Alexei).

- [ ] **Step 4: Agenții obligatorii (regulă globală)**

Rulează în paralel `architecture-guardian` + `performance-reviewer` pe întregul diff al feature-ului. Critical/High → raportează lui Ion înainte de «gata».
