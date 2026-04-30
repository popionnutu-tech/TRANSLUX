# Validare obligatorie grafic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forțează dispecerul/adminul să marcheze fiecare rută din grafic ca "Anulată" sau să o completeze (Șofer + Auto + Foaie de parcurs) înainte de a putea schimba ziua.

**Architecture:** Logica de validare e o funcție pură într-un modul nou (testabil unitar). `UnifiedGraficList.tsx` o folosește pentru a colora rânduri invalide cu roșu și a afișa mesaje inline. `GraficClient.tsx` ridică numărul de rute invalide via callback și interceptează schimbarea datei + butonul "Copiază de ieri" cu un modal blocant.

**Tech Stack:** Next.js (App Router), React Client Components, vitest pentru testare unitară, CSS variables existente (`--danger`, `--danger-dim`).

**Spec:** [`docs/superpowers/specs/2026-04-30-grafic-validation-design.md`](../specs/2026-04-30-grafic-validation-design.md)

---

## File Structure

| Path | Action | Responsabilitate |
|------|--------|------------------|
| `apps/web/src/app/(dashboard)/grafic/validation.ts` | **Create** | Funcție pură `validateRow(row)` care întoarce status + listă câmpuri lipsă; helper `errorMessageRo(missing)` pentru mesajul în română |
| `apps/web/src/app/(dashboard)/grafic/validation.test.ts` | **Create** | Teste vitest pentru toate combinațiile (anulată, complet, lipsește unul, lipsește multiple) |
| `apps/web/src/app/(dashboard)/grafic/UnifiedGraficList.tsx` | **Modify** | Folosește `validateRow`; schimbă background rând invalid pe roșu; adaugă rând cu mesaj de eroare; raportează `invalidCount` la părinte via callback nou `onInvalidCountChange` |
| `apps/web/src/app/(dashboard)/grafic/GraficClient.tsx` | **Modify** | Stochează `invalidCount` din callback; interceptează `<input type="date">` și `handleCopy`; afișează modal blocant |

---

## Task 1: Pure validation module

**Files:**
- Create: `apps/web/src/app/(dashboard)/grafic/validation.ts`
- Test: `apps/web/src/app/(dashboard)/grafic/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/(dashboard)/grafic/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateRow, errorMessageRo, type ValidatableRow } from './validation';

const base: ValidatableRow = {
  cancelled: false,
  driver_id: null,
  vehicle_id: null,
  foaie_parcurs_nr: null,
};

describe('validateRow', () => {
  it('returns valid when row is cancelled (regardless of other fields)', () => {
    expect(validateRow({ ...base, cancelled: true })).toEqual({
      isValid: true,
      missing: [],
    });
    expect(validateRow({
      ...base,
      cancelled: true,
      driver_id: 'd1',
      vehicle_id: null,
      foaie_parcurs_nr: null,
    })).toEqual({ isValid: true, missing: [] });
  });

  it('returns valid when all three fields are filled', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: true, missing: [] });
  });

  it('reports lipsește auto when only auto missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: null,
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: false, missing: ['vehicle'] });
  });

  it('reports lipsește foaie when only foaie missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: null,
    })).toEqual({ isValid: false, missing: ['foaie'] });
  });

  it('reports lipsește șofer when only driver missing', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: null,
      vehicle_id: 'v1',
      foaie_parcurs_nr: '0945123',
    })).toEqual({ isValid: false, missing: ['driver'] });
  });

  it('reports multiple missing when two or more fields missing', () => {
    expect(validateRow(base)).toEqual({
      isValid: false,
      missing: ['driver', 'vehicle', 'foaie'],
    });
    expect(validateRow({ ...base, driver_id: 'd1' })).toEqual({
      isValid: false,
      missing: ['vehicle', 'foaie'],
    });
  });

  it('treats empty string as missing for foaie_parcurs_nr', () => {
    expect(validateRow({
      cancelled: false,
      driver_id: 'd1',
      vehicle_id: 'v1',
      foaie_parcurs_nr: '',
    })).toEqual({ isValid: false, missing: ['foaie'] });
  });
});

describe('errorMessageRo', () => {
  it('returns specific message for single missing field', () => {
    expect(errorMessageRo(['vehicle'])).toBe('Lipsește auto');
    expect(errorMessageRo(['foaie'])).toBe('Lipsește foaie de parcurs');
    expect(errorMessageRo(['driver'])).toBe('Lipsește șofer');
  });

  it('returns generic message for multiple missing', () => {
    expect(errorMessageRo(['driver', 'vehicle'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
    expect(errorMessageRo(['vehicle', 'foaie'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
    expect(errorMessageRo(['driver', 'vehicle', 'foaie'])).toBe(
      "Bifează 'Anulată' sau completează șofer + auto + foaie",
    );
  });

  it('returns empty string when nothing missing', () => {
    expect(errorMessageRo([])).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/app/\(dashboard\)/grafic/validation.test.ts`
Expected: FAIL with module not found `./validation`.

- [ ] **Step 3: Implement validation module**

Create `apps/web/src/app/(dashboard)/grafic/validation.ts`:

```typescript
export type ValidatableRow = {
  cancelled: boolean;
  driver_id: string | null;
  vehicle_id: string | null;
  foaie_parcurs_nr: string | null;
};

export type MissingField = 'driver' | 'vehicle' | 'foaie';

export type ValidationResult = {
  isValid: boolean;
  missing: MissingField[];
};

export function validateRow(row: ValidatableRow): ValidationResult {
  if (row.cancelled) {
    return { isValid: true, missing: [] };
  }
  const missing: MissingField[] = [];
  if (!row.driver_id) missing.push('driver');
  if (!row.vehicle_id) missing.push('vehicle');
  if (!row.foaie_parcurs_nr) missing.push('foaie');
  return { isValid: missing.length === 0, missing };
}

export function errorMessageRo(missing: MissingField[]): string {
  if (missing.length === 0) return '';
  if (missing.length === 1) {
    switch (missing[0]) {
      case 'driver': return 'Lipsește șofer';
      case 'vehicle': return 'Lipsește auto';
      case 'foaie': return 'Lipsește foaie de parcurs';
    }
  }
  return "Bifează 'Anulată' sau completează șofer + auto + foaie";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/app/\(dashboard\)/grafic/validation.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/\(dashboard\)/grafic/validation.ts apps/web/src/app/\(dashboard\)/grafic/validation.test.ts
git commit -m "feat(grafic): add pure validation module for route rows [deploy-fix]"
```

---

## Task 2: Wire validation into UnifiedGraficList — counter + row background

**Files:**
- Modify: `apps/web/src/app/(dashboard)/grafic/UnifiedGraficList.tsx`

- [ ] **Step 1: Add import and replace `neprocesate` logic**

Open `apps/web/src/app/(dashboard)/grafic/UnifiedGraficList.tsx`.

Add at the top of the file, with other imports:

```typescript
import { validateRow, errorMessageRo } from './validation';
```

Find this block (around line 178):

```typescript
  // Counter: rute care n-au nici foaie nici cancel
  const neprocesate = rows.filter(r => !r.cancelled && !r.foaie_parcurs_nr).length;
  const anulate = rows.filter(r => r.cancelled).length;
  const cuFoaie = rows.filter(r => !!r.foaie_parcurs_nr && !r.cancelled).length;
```

Replace with:

```typescript
  // Validate each row: must be cancelled OR have driver+vehicle+foaie
  const validations = rows.map(r => validateRow(r));
  const neprocesate = validations.filter(v => !v.isValid).length;
  const anulate = rows.filter(r => r.cancelled).length;
  const completate = rows.length - neprocesate - anulate;
```

- [ ] **Step 2: Update counter colors and labels**

Find the status summary block (around line 187, starts with `{canSeeReceipt && (`). Replace the `cuFoaie` reference and warning colors.

The block currently uses `var(--warning)` / `var(--warning-dim)`. Change to `var(--danger)` / `var(--danger-dim)` when `neprocesate > 0`.

Replace the entire block:

```tsx
      {canSeeReceipt && (
        <div style={{
          display: 'flex',
          gap: 16,
          padding: '10px 14px',
          marginBottom: 12,
          background: neprocesate > 0 ? 'var(--danger-dim)' : 'var(--success-dim)',
          borderLeft: `4px solid ${neprocesate > 0 ? 'var(--danger)' : 'var(--success)'}`,
          borderRadius: 'var(--radius-xs)',
          fontSize: 13,
          flexWrap: 'wrap',
        }}>
          <span>
            <strong style={{ color: completate > 0 ? 'var(--success)' : 'inherit' }}>✓ {completate}</strong> complete
          </span>
          <span>
            <strong style={{ color: anulate > 0 ? 'var(--text-muted)' : 'inherit' }}>⊘ {anulate}</strong> anulate
          </span>
          <span>
            <strong style={{ color: neprocesate > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {neprocesate > 0 ? '⚠' : '✓'} {neprocesate}
            </strong> neprocesate
          </span>
          {neprocesate > 0 && (
            <span className="text-muted">
              Completează șofer + auto + foaie de parcurs sau bifează "Anulată" pentru fiecare.
            </span>
          )}
        </div>
      )}
```

- [ ] **Step 3: Update row background — red for invalid rows**

Find the `<tr key={row.key}` element (around line 256). Replace its `style` block:

```tsx
                  <tr key={row.key} style={{
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                    background: row.cancelled
                      ? 'rgba(0,0,0,0.03)'
                      : (canSeeReceipt && !validations[i].isValid)
                        ? 'var(--danger-dim)'
                        : undefined,
                    opacity: row.cancelled ? 0.55 : 1,
                  }}>
```

- [ ] **Step 4: Type check + run all tests**

Run: `cd apps/web && npx tsc --noEmit && npm test -- --run`
Expected: PASS — TypeScript clean, all tests green.

- [ ] **Step 5: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/\(dashboard\)/grafic/UnifiedGraficList.tsx
git commit -m "feat(grafic): red highlight for invalid rows + counter [deploy-fix]"
```

---

## Task 3: Inline error message row under invalid rows

**Files:**
- Modify: `apps/web/src/app/(dashboard)/grafic/UnifiedGraficList.tsx`

- [ ] **Step 1: Add error row after each invalid row**

Find the `</tr>` closing tag of the main row (around line 337, just before `</>`). It currently looks like:

```tsx
                    {canSeeReceipt && (
                      <td style={{ textAlign: 'center' }}>
                        ...
                      </td>
                    )}
                  </tr>
                </>
```

Add an error row right after that `</tr>`:

```tsx
                    {canSeeReceipt && (
                      <td style={{ textAlign: 'center' }}>
                        ...
                      </td>
                    )}
                  </tr>
                  {canSeeReceipt && !validations[i].isValid && (
                    <tr key={`${row.key}-err`}>
                      <td colSpan={8} style={{
                        padding: '4px 12px 8px 12px',
                        background: 'var(--danger-dim)',
                        color: 'var(--danger)',
                        fontSize: 12,
                        fontWeight: 500,
                        borderTop: 'none',
                      }}>
                        ⚠ {errorMessageRo(validations[i].missing)}
                      </td>
                    </tr>
                  )}
                </>
```

Note: the `td` inside has `borderTop: 'none'` so it visually attaches to the row above. The `colSpan={8}` covers all columns when `canSeeReceipt`; if you want it to also work without receipt visible, use `colSpan={canSeeReceipt ? 8 : 6}`. Since the error only shows when `canSeeReceipt`, hard-coded 8 is fine.

- [ ] **Step 2: Type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual smoke test (dev server)**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npm run dev
```

Open the app, log in as DISPATCHER, go to `/grafic`. Verify:
- A row with no driver/auto/foaie shows red background + error "Bifează 'Anulată' sau completează…".
- After selecting only a driver, error becomes "Bifează 'Anulată' sau completează…" (still 2 missing).
- After selecting driver + auto, error becomes "Lipsește foaie de parcurs".
- After typing foaie nr, row becomes white/normal — no error.
- Bifând "Anulată" — row turns gray + opacity 0.55, no error shown.

Stop dev server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/\(dashboard\)/grafic/UnifiedGraficList.tsx
git commit -m "feat(grafic): inline error message under invalid rows [deploy-fix]"
```

---

## Task 4: Block date change + "Copiază de ieri" in GraficClient

**Files:**
- Modify: `apps/web/src/app/(dashboard)/grafic/UnifiedGraficList.tsx` (add callback prop)
- Modify: `apps/web/src/app/(dashboard)/grafic/GraficClient.tsx` (state + intercept + modal)

- [ ] **Step 1: Add `onInvalidCountChange` callback to UnifiedGraficList**

Open `UnifiedGraficList.tsx`. Add to the props type:

```typescript
export default function UnifiedGraficList({
  date,
  drivers,
  vehicles,
  role,
  readOnly = false,
  onInvalidCountChange,
}: {
  date: string;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  role: AdminRole;
  readOnly?: boolean;
  onInvalidCountChange?: (count: number) => void;
}) {
```

After computing `neprocesate` (right after the `validations` line), report it to parent via effect:

```typescript
  const validations = rows.map(r => validateRow(r));
  const neprocesate = validations.filter(v => !v.isValid).length;
  const anulate = rows.filter(r => r.cancelled).length;
  const completate = rows.length - neprocesate - anulate;

  useEffect(() => {
    onInvalidCountChange?.(neprocesate);
  }, [neprocesate, onInvalidCountChange]);
```

(The `useEffect` import already exists at the top of the file.)

- [ ] **Step 2: Wire callback + intercept date change in GraficClient**

Open `GraficClient.tsx`. Add a state near the other states (around line 79):

```typescript
  const [invalidCount, setInvalidCount] = useState(0);
  const [blockedModal, setBlockedModal] = useState<string | null>(null);
```

Find the `<input type="date">` in the header (around line 234):

```tsx
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
```

Replace with:

```tsx
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              if (!showLegacy && invalidCount > 0) {
                setBlockedModal(
                  `Mai sunt ${invalidCount} rute neprocesate pentru ${formatDate(date)}. ` +
                  `Completează șofer + auto + foaie de parcurs sau bifează 'Anulată' pentru fiecare.`,
                );
                return;
              }
              setDate(next);
            }}
          />
```

Find the "Copiază de ieri" button (around line 236):

```tsx
            <button className="btn btn-outline" onClick={handleCopy} disabled={copying}>
              {copying ? 'Se copiază...' : 'Copiază de ieri'}
            </button>
```

Wrap `handleCopy` with the same check. Replace the button:

```tsx
            <button
              className="btn btn-outline"
              onClick={() => {
                if (!showLegacy && invalidCount > 0) {
                  setBlockedModal(
                    `Mai sunt ${invalidCount} rute neprocesate pentru ${formatDate(date)}. ` +
                    `Completează șofer + auto + foaie de parcurs sau bifează 'Anulată' pentru fiecare.`,
                  );
                  return;
                }
                handleCopy();
              }}
              disabled={copying}
            >
              {copying ? 'Se copiază...' : 'Copiază de ieri'}
            </button>
```

- [ ] **Step 3: Pass `onInvalidCountChange` prop into UnifiedGraficList**

Find the `<UnifiedGraficList` usage (around line 263):

```tsx
        <UnifiedGraficList
          date={date}
          drivers={drivers}
          vehicles={vehicles}
          role={role}
          readOnly={readOnly}
        />
```

Add the prop:

```tsx
        <UnifiedGraficList
          date={date}
          drivers={drivers}
          vehicles={vehicles}
          role={role}
          readOnly={readOnly}
          onInvalidCountChange={setInvalidCount}
        />
```

- [ ] **Step 4: Add the modal at the end of the component**

Find the final closing `</div>` of the page (just before `);` at the end of the return statement, around line 588). Add the modal just before it:

```tsx
      {/* ── Validation block modal ── */}
      {blockedModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          onClick={() => setBlockedModal(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 360, maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--danger)' }}>
              Nu poți schimba ziua
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#333', lineHeight: 1.5 }}>
              {blockedModal}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setBlockedModal(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type check + run all tests**

Run: `cd apps/web && npx tsc --noEmit && npm test -- --run`
Expected: PASS — TypeScript clean, all tests green.

- [ ] **Step 6: Manual smoke test**

```bash
cd /Users/ionpop/Desktop/TRANSLUX/apps/web && npm run dev
```

As DISPATCHER, go to `/grafic`:
- Leave at least one route "neprocesat" (no driver/auto/foaie, no Anulată).
- Try to change the date via the date input → modal "Nu poți schimba ziua" appears, date does not change.
- Try to click "Copiază de ieri" → same modal.
- Click OK → modal closes, date stays the same.
- Bifează "Anulată" pentru toate rutele invalide (sau completează-le) → contor "0 neprocesate".
- Try to change date again → date changes successfully.

As ADMIN with showLegacy=true (PNG mode) → date should change freely (validation only when unified list is shown).

Stop dev server.

- [ ] **Step 7: Commit**

```bash
cd /Users/ionpop/Desktop/TRANSLUX
git add apps/web/src/app/\(dashboard\)/grafic/UnifiedGraficList.tsx apps/web/src/app/\(dashboard\)/grafic/GraficClient.tsx
git commit -m "feat(grafic): block date change while invalid rows exist"
```

(No `[deploy-fix]` tag here — this is the final commit, triggers auto-deploy.)

---

## Done

After Task 4, push to main and let auto-deploy ship to Vercel.
