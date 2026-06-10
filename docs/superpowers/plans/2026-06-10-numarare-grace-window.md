# Numărare Grace Window (10 min) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operatorul care a numărat poate corecta o sesiune finalizată timp de 10 minute fixe de la prima finalizare; serverul impune regula, nu doar interfața.

**Architecture:** O coloană nouă `counting_sessions.completed_at` (setată o singură dată, la prima finalizare) + un helper pur `isWithinGrace` folosit identic pe server (gardă în 5 acțiuni) și în UI (buton + cronometru). Admin (ADMIN/ADMIN_CAMERE) păstrează acces nelimitat; audit neatins.

**Tech Stack:** Next.js server actions, Supabase (Postgres, MCP apply_migration), vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-numarare-grace-window-design.md`

---

### Task 1: Migrație — coloana `completed_at`

**Files:**
- Create: `packages/db/migrations/096_counting_sessions_completed_at.sql`

- [ ] **Step 1: Scrie fișierul de migrație**

```sql
-- Fereastră de corectare 10 min pentru operator (spec 2026-06-10).
-- completed_at = momentul PRIMEI finalizări a sesiunii de numărare.
-- Se setează o singură dată (nu se resetează la re-salvări în fereastră).
-- NULL la sesiunile finalizate înainte de această migrație => fereastră expirată.
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
```

- [ ] **Step 2: Aplică migrația pe Supabase TRANSLUX**

Via MCP `apply_migration` pe proiectul `zqkzqpfdymddsywxjxow`, name `counting_sessions_completed_at`, cu SQL-ul de mai sus.

- [ ] **Step 3: Verifică coloana**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'counting_sessions' AND column_name = 'completed_at';
```
Expected: 1 rând, `timestamp with time zone`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/096_counting_sessions_completed_at.sql
git commit -m "feat(numarare): coloana completed_at pentru fereastra de corectare"
```

---

### Task 2: Helper pur `isWithinGrace` (TDD)

**Files:**
- Test: `apps/admin/src/app/(dashboard)/numarare/calculation.test.ts` (nou)
- Modify: `apps/admin/src/app/(dashboard)/numarare/calculation.ts`

- [ ] **Step 1: Scrie testul (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { isWithinGrace, GRACE_MINUTES } from './calculation';

describe('isWithinGrace', () => {
  const now = new Date('2026-06-10T10:00:00.000Z');

  it('NULL completed_at => expirat (sesiuni vechi)', () => {
    expect(isWithinGrace(null, now)).toBe(false);
  });

  it('în fereastră la 9 min 59 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:50:01.000Z', now)).toBe(true);
  });

  it('expirat la exact 10:00 după finalizare (limită strictă)', () => {
    expect(isWithinGrace('2026-06-10T09:50:00.000Z', now)).toBe(false);
  });

  it('expirat la 10 min 1 s după finalizare', () => {
    expect(isWithinGrace('2026-06-10T09:49:59.000Z', now)).toBe(false);
  });

  it('imediat după finalizare => în fereastră', () => {
    expect(isWithinGrace(now.toISOString(), now)).toBe(true);
  });

  it('timestamp invalid => expirat', () => {
    expect(isWithinGrace('not-a-date', now)).toBe(false);
  });

  it('GRACE_MINUTES este 10', () => {
    expect(GRACE_MINUTES).toBe(10);
  });
});
```

- [ ] **Step 2: Rulează testul — trebuie să pice**

Run: `npx vitest run --root apps/admin calculation`
Expected: FAIL — `isWithinGrace` nu este exportat.

- [ ] **Step 3: Implementează în `calculation.ts` (la finalul fișierului)**

```ts
/**
 * Fereastra de corectare a operatorului după finalizarea unei sesiuni de numărare.
 * Limita e strictă: la exact GRACE_MINUTES fereastra e EXPIRATĂ; NULL sau timestamp
 * invalid => expirată (sesiunile finalizate înainte de coloana completed_at rămân blocate).
 */
export const GRACE_MINUTES = 10;

export function isWithinGrace(completedAt: string | null, now: Date): boolean {
  if (!completedAt) return false;
  const completedMs = Date.parse(completedAt);
  if (Number.isNaN(completedMs)) return false;
  return now.getTime() - completedMs < GRACE_MINUTES * 60_000;
}
```

- [ ] **Step 4: Rulează testul — trebuie să treacă**

Run: `npx vitest run --root apps/admin calculation`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/numarare/calculation.ts" "apps/admin/src/app/(dashboard)/numarare/calculation.test.ts"
git commit -m "feat(numarare): isWithinGrace + GRACE_MINUTES (fereastra de corectare)"
```

---

### Task 3: Garda pe server în `actions.ts`

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/numarare/actions.ts`

- [ ] **Step 1: Import + helper de gardă**

Lângă importul existent `import { suburbanFareCeil } from './calculation';` extinde la:

```ts
import { suburbanFareCeil, isWithinGrace } from './calculation';
```

Sub `const NUMARARE_ROLES = ...` adaugă:

```ts
const NUMARARE_ADMIN_ROLES = ['ADMIN', 'ADMIN_CAMERE'] as const;

/**
 * Poate utilizatorul curent să editeze sesiunea dată?
 * Sesiune ne-finalizată => da (regulile existente de lock se aplică separat).
 * Sesiune `completed`: admin => oricând; operatorul sesiunii => doar în
 * fereastra de corectare (GRACE_MINUTES de la prima finalizare); alții => nu.
 */
function canEditCompletedSession(
  user: { id: string; role: string },
  sess: { status: string | null; operator_id: string | null; completed_at: string | null },
): boolean {
  if (sess.status !== 'completed') return true;
  if ((NUMARARE_ADMIN_ROLES as readonly string[]).includes(user.role)) return true;
  return sess.operator_id === user.id && isWithinGrace(sess.completed_at, new Date());
}
```

- [ ] **Step 2: `lockRoute` — respectă fereastra**

În select-ul sesiunii existente, adaugă `completed_at`:

```ts
    .select('id, operator_id, locked_by, locked_at, status, completed_at')
```

După verificarea `locked_by` (blocat de altul) și ÎNAINTE de update-ul de lock, adaugă:

```ts
    // Sesiune finalizată: operatorul sesiunii are fereastra de corectare
    // (GRACE_MINUTES de la prima finalizare); după expirare => doar vizualizare.
    if (!canEditCompletedSession(session, existing as any)) {
      return { sessionId: existing.id, readOnly: true };
    }
```

- [ ] **Step 3: `saveDirection` — gardă + setare `completed_at`**

Schimbă began-ul funcției ca să păstreze sesiunea utilizatorului:

```ts
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();

  // Gardă server: un formular rămas deschis nu poate scrie după expirarea ferestrei.
  const { data: sessRow } = await sb
    .from('counting_sessions')
    .select('status, operator_id, completed_at')
    .eq('id', sessionId)
    .single();
  if (!sessRow) return { error: 'Sesiunea nu există' };
  if (!canEditCompletedSession(session, sessRow as any)) {
    return { error: 'Fereastra de corectare a expirat — doar admin poate modifica.' };
  }
```

(restul funcției rămâne; `const sb = getSupabase();` existent se elimină ca duplicat)

La construirea `updateFields` (după blocul if/else tur/retur), adaugă:

```ts
  if (updateFields.status === 'completed' && !(sessRow as any).completed_at) {
    updateFields.completed_at = new Date().toISOString(); // prima finalizare — o singură dată
  }
```

- [ ] **Step 4: `saveSuburbanCycle` — gardă la început + `completed_at`**

Schimbă began-ul ca să păstreze sesiunea și să mute fetch-ul de sesiune SUS (înaintea delete-ului de entries), extinzând select-ul:

```ts
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }
  const sb = getSupabase();

  const { data: sessionRow } = await sb
    .from('counting_sessions')
    .select('assignment_date, crm_route_id, status, operator_id, completed_at')
    .eq('id', sessionId)
    .single();
  if (!sessionRow) return { error: 'Sesiunea nu există' };
  if (!canEditCompletedSession(session, sessionRow as any)) {
    return { error: 'Fereastra de corectare a expirat — doar admin poate modifica.' };
  }
```

Șterge fetch-ul duplicat de `sessionRow` din mijlocul funcției (cel cu
`select('assignment_date, crm_route_id')`) — restul codului folosește variabila de sus.

La update-ul final al sesiunii:

```ts
  await sb.from('counting_sessions').update({
    status: newStatus,
    tur_total_lei: sessionTotal,
    retur_total_lei: 0,
    locked_by: null,
    locked_at: null,
    ...(newStatus === 'completed' && !(sessionRow as any).completed_at
      ? { completed_at: new Date().toISOString() }
      : {}),
  }).eq('id', sessionId);
```

- [ ] **Step 5: `finalizeSuburbanSession` — gardă + `completed_at`**

Același pattern: păstrează `session` din `requireRole`, extinde select-ul existent la
`'assignment_date, status, operator_id, completed_at'`, adaugă garda după fetch:

```ts
  if (!sessionRow) return { error: 'Sesiunea nu există' };
  if (!canEditCompletedSession(session, sessionRow as any)) {
    return { error: 'Fereastra de corectare a expirat — doar admin poate modifica.' };
  }
```

și în update adaugă:

```ts
      ...(!(sessionRow as any).completed_at ? { completed_at: new Date().toISOString() } : {}),
```

- [ ] **Step 6: `updateSessionDriverVehicle` — aceeași gardă**

```ts
  let session;
  try { session = requireRole(await verifySession(), ...NUMARARE_ROLES); } catch { return { error: 'Acces interzis' }; }

  const sb = getSupabase();
  const { data: sessRow } = await sb
    .from('counting_sessions')
    .select('status, operator_id, completed_at')
    .eq('id', sessionId)
    .single();
  if (!sessRow) return { error: 'Sesiunea nu există' };
  if (!canEditCompletedSession(session, sessRow as any)) {
    return { error: 'Fereastra de corectare a expirat — doar admin poate modifica.' };
  }
```

- [ ] **Step 7: `getRoutesForDate` — expune `completed_at`**

În interfața `RouteForCounting` adaugă:

```ts
  completed_at: string | null;
```

În select-ul de sesiuni (query-ul `counting_sessions` din `getRoutesForDate`), adaugă
`completed_at` pe lista de coloane (lângă `audit_locked_by`):

```ts
      audit_locked_by, completed_at,
```

În obiectul returnat (map-ul rutelor), lângă `route_type`:

```ts
      completed_at: s?.completed_at ?? null,
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p apps/admin/tsconfig.json`
Expected: fără erori noi în fișierele numarare.

- [ ] **Step 9: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/numarare/actions.ts"
git commit -m "feat(numarare): garda server pentru fereastra de corectare 10 min"
```

---

### Task 4: UI — buton, cronometru, prop

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/numarare/NumarareClient.tsx`

- [ ] **Step 1: Import + tick de 30s + helper**

Adaugă importul:

```ts
import { isWithinGrace, GRACE_MINUTES } from './calculation';
```

În component, sub state-urile existente:

```ts
  // Re-randare ușoară la 30s ca cronometrul ferestrei de corectare să expire vizual.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const inGraceFor = useCallback((route: RouteForCounting) =>
    route.session_status === 'completed'
    && route.operator_id === currentUserId
    && isWithinGrace(route.completed_at, new Date(nowTick)),
  [currentUserId, nowTick]);

  function graceMinutesLeft(route: RouteForCounting): number {
    if (!route.completed_at) return 0;
    const left = Date.parse(route.completed_at) + GRACE_MINUTES * 60_000 - nowTick;
    return Math.max(0, Math.ceil(left / 60_000));
  }
```

- [ ] **Step 2: Rândul din tabel — buton + selectoare + cronometru**

În map-ul `filteredRoutes.map(route => { ... })`, sub `const completed = ...`:

```ts
              const inGrace = inGraceFor(route);
```

Butonul «Deschide»: `disabled={completed && !canAudit && !inGrace}`.
Selectoarele șofer și mașină din rând: `disabled={completed && !canAudit && !inGrace}`.
Celula de status devine:

```tsx
                  <td>
                    {statusBadge(route)}
                    {inGrace && (
                      <div style={{ fontSize: 11, color: 'var(--primary)' }}>
                        ✏️ corectare: încă {graceMinutesLeft(route)} min
                      </div>
                    )}
                  </td>
```

- [ ] **Step 3: Header-ul rutei deschise + prop-ul formularului**

Selectoarele șofer/mașină din header (ruta deschisă):

```ts
disabled={viewOnly || (openRoute.session_status === 'completed' && !canAudit && !inGraceFor(openRoute))}
```

La `<CountingForm ...>`:

```ts
canEditCompleted={canAudit || inGraceFor(openRoute)}
```

(`SuburbanCountingForm` nu se atinge — `viewOnly` vine deja din decizia serverului `lockRoute`.)

- [ ] **Step 4: Typecheck + teste**

Run: `npx tsc --noEmit -p apps/admin/tsconfig.json` → fără erori noi.
Run: `npx vitest run --root apps/admin` → toate trec.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/numarare/NumarareClient.tsx"
git commit -m "feat(numarare): UI fereastra de corectare — buton activ + cronometru"
```

---

### Task 5: Review obligatoriu + deploy

- [ ] **Step 1: Rulează în paralel architecture-guardian + performance-reviewer** pe modificările din Tasks 1–4 (obligatoriu per CLAUDE.md). Critical/High => oprește-te și raportează utilizatorului.

- [ ] **Step 2: Push + deploy Vercel** (`git push origin main`, apoi `bash .claude/scripts/deploy-vercel.sh` via agent). Railway (botul) nu e afectat — admin-only.

- [ ] **Step 3: Verificare post-deploy în DB** — după ce un operator finalizează o rută, `completed_at` se populează:

```sql
SELECT id, status, completed_at FROM counting_sessions
WHERE status = 'completed' AND completed_at IS NOT NULL
ORDER BY completed_at DESC LIMIT 3;
```

(imediat după deploy va fi gol — se umple la prima finalizare reală; de comunicat utilizatorului scenariile de test manual din spec.)
