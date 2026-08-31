# /lde/camioane — dispecerat + analitică · plan de implementare

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development sau superpowers:executing-plans. Pașii au checkbox (`- [ ]`).

**Goal:** o singură pagină `/lde/camioane` cu patru file — Dispecerat (kanban + hartă live), Planificare (grilă camioane × zile), Puncte (nomenclator geo) și Analitică (doar ADMIN) — care ține planificarea zilnică a camioanelor și măsoară livrările/traseele din GPS.

**Architecture:** Next.js server components + server actions, exact tiparul `/lde/parc` și `/lde/grafic-uzine` (page.tsx server → actions.ts `'use server'` → XClient.tsx). Datele în Supabase, tabele noi cu RLS deny-all. Calculele GPS rulează noaptea pe VPS-ul `lde-geo-worker` și se scriu în `lde_truck_trip_metrics`; admin-ul doar citește. Pozițiile live se citesc din Wialon printr-un endpoint propriu, doar cât fila Dispecerat e deschisă.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role), vitest (doar funcții pure, `.test.ts`), leaflet + react-leaflet (nou), Node .mjs pentru worker.

**Spec:** `docs/superpowers/specs/2026-08-31-lde-camioane-dispecerat-design.md`

## Global Constraints

- Migrațiile pornesc de la **300** (max curent 299); fișier în `packages/db/migrations/NNN_nume.sql`, aplicat pe proiectul Supabase `zqkzqpfdymddsywxjxow` prin MCP `apply_migration`, **migrația se aplică ÎNAINTE de codul care o folosește**.
- **Fiecare tabel nou: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` fără nicio politică** (tiparul întregii scheme; backend-urile merg pe service-role).
- Antet-comentariu obligatoriu în migrație, în română, care explică DE CE (tiparul 236/241).
- Discriminatorul flotei rămâne `vehicles.directions @> ARRAY['camioane']` — de el depinde `lde-geo-worker/wialon-worker.mjs:52`. **Nu se modifică tabela `vehicles`.**
- „Camionul are șofer" = rând în `lde_active_assignments` cu `valid_to IS NULL`.
- Acțiunile de scriere expuse rolului DISPECER întorc `{ error: string }`, NU aruncă (Next maschează mesajele aruncate în producție). Acțiunile ADMIN-only pot arunca via `requireRole`.
- Fiecare server action își reverifică singură sesiunea, chiar dacă middleware-ul a filtrat deja; plus scope-check pe date (camionul trimis trebuie să fie camion).
- Citirile care pot depăși 1000 de rânduri se pagineaz cu `.order(...)` stabil + `.range(offset, offset+999)`.
- Testele: doar `.test.ts` colocate în `src/lib/**`, funcții pure, fixtures inline. Fără test-DB, fără teste de componente.
- Stilizare: clase din `globals.css` (`card`, `btn-primary`, `pivot-table`, `badge`…) + inline styles; fără design system nou. Erorile se afișează ca `<div className="card">` cu `borderLeft: '3px solid var(--danger)'`.
- Rulare verificări: `cd apps/admin && npx tsc --noEmit && npx vitest run`.
- Rol nou `DISPECER` = valoare nouă în CHECK-ul `admin_accounts.role` + `AdminRole` în `packages/db/src/types.ts:40` + middleware + Sidebar.
- **Valhalla nu există în cod.** „km ideali" se cer unui furnizor de rutare prin `ROUTING_URL` (API Valhalla `/route`). Lipsește variabila sau răspunsul → `km_ideal = NULL` și analitica afișează «traseu ideal indisponibil». Nicio estimare inventată.

---

## Etapa 1 — planificarea (migrație, nomenclator, curse, grilă)

### Task 1: Migrația 300 — schema completă + rolul DISPECER

**Files:**
- Create: `packages/db/migrations/300_lde_camioane_dispecerat.sql`
- Modify: `packages/db/src/types.ts:40` (adaugă `'DISPECER'` în `AdminRole`)

**Interfaces:**
- Produces: tabelele `lde_truck_profile`, `lde_dispatch_points`, `lde_truck_trips`, `lde_truck_day_states`, `lde_truck_trip_metrics`; rolul `DISPECER`.

- [ ] **Step 1: Scrie migrația**

```sql
-- ============================================================================
-- LDE — dispecerat camioane (Ion, 31.08.2026)
-- Dispecerul planifică din memorie și greșește logistic (camionul din Bălți
-- trimis la Constanța, cel din Chișinău la Berdichev). Aici intră cursa ca
-- unitate de planificare, nomenclatorul punctelor cu coordonate, stările de zi
-- (reparație/odihnă) și metricile calculate noaptea din GPS.
-- Flota rămâne discriminată de vehicles.directions @> {camioane} (de el depinde
-- lde-geo-worker/wialon-worker.mjs) — tabela vehicles NU se atinge.
-- ============================================================================
BEGIN;

-- Rol nou pentru dispecer (tiparul 251_grafic_uzine.sql)
ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check CHECK (role IN (
  'ADMIN','DISPATCHER','GRAFIC','OPERATOR_CAMERE','ADMIN_CAMERE','EVALUATOR_INCASARI',
  'CONTABIL','DEPOZITAR','VINZATOR','MANAGER','GESTIONAR','UZINE','DISPECER'
));
COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'DISPECER (31.08.2026): planifică cursele camioanelor în /lde/camioane; analitica rămâne la ADMIN.';

-- Tipul camionului. Tabel separat, nu coloană pe vehicles: vehicles e partajată
-- cu autobuzele și cu workerul GPS.
CREATE TABLE IF NOT EXISTS lde_truck_profile (
  vehicle_id uuid PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  fleet_type text NOT NULL CHECK (fleet_type IN ('cisterna','zernovoz')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
COMMENT ON TABLE lde_truck_profile IS 'Tipul camionului (cisternă/zernovoz). «Fără șofer» NU e tip — se derivă din lipsa unui rând activ în lde_active_assignments.';

-- Nomenclatorul punctelor de încărcare/descărcare.
CREATE TABLE IF NOT EXISTS lde_dispatch_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  lat double precision,
  lng double precision,
  radius_m integer NOT NULL DEFAULT 500,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
COMMENT ON TABLE lde_dispatch_points IS 'Puncte de încărcare/descărcare. Fără lat/lng punctul e valid, dar cursele lui nu primesc metrici GPS (insignă «fără coordonate»).';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_dispatch_points_name ON lde_dispatch_points (lower(name)) WHERE active;

-- Cursa: unitatea de planificare, poate ține mai multe zile.
CREATE TABLE IF NOT EXISTS lde_truck_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  cargo text,
  client text,
  load_point_id uuid REFERENCES lde_dispatch_points(id) ON DELETE RESTRICT,
  load_planned_at timestamptz NOT NULL,
  unload_point_id uuid REFERENCES lde_dispatch_points(id) ON DELETE RESTRICT,
  unload_planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planificata' CHECK (status IN
    ('planificata','spre_incarcare','la_incarcare','spre_descarcare','la_descarcare','incheiata','anulata')),
  cancel_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CHECK (unload_planned_at >= load_planned_at),
  CHECK (status <> 'anulata' OR cancel_reason IS NOT NULL)
);
COMMENT ON TABLE lde_truck_trips IS 'Cursa camionului: încărcare → descărcare, multi-zi. Stările le mută MANUAL dispecerul (decizia Ion 31.08); GPS-ul verifică post-factum. Cursele nu se șterg — se anulează cu motiv.';
CREATE INDEX IF NOT EXISTS idx_lde_truck_trips_vehicle_time ON lde_truck_trips (vehicle_id, load_planned_at);
CREATE INDEX IF NOT EXISTS idx_lde_truck_trips_window ON lde_truck_trips (load_planned_at, unload_planned_at) WHERE status <> 'anulata';

-- Stările de zi în afara curselor.
CREATE TABLE IF NOT EXISTS lde_truck_day_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date date NOT NULL,
  state text NOT NULL CHECK (state IN ('reparatie','odihna')),
  reason text,
  expected_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
COMMENT ON TABLE lde_truck_day_states IS 'Reparație / odihnă șofer pe zi. Alte stări NU există (decizia Ion 31.08).';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_truck_day_states ON lde_truck_day_states (vehicle_id, date);

-- Metricile scrise de workerul nocturn.
CREATE TABLE IF NOT EXISTS lde_truck_trip_metrics (
  trip_id uuid PRIMARY KEY REFERENCES lde_truck_trips(id) ON DELETE CASCADE,
  km_real double precision,
  km_ideal double precision,
  km_deviation double precision,
  stops_over_30min integer,
  stops_detail jsonb,
  load_actual_at timestamptz,
  unload_actual_at timestamptz,
  load_delay_min integer,
  unload_delay_min integer,
  empty_km double precision,
  computed_at timestamptz NOT NULL DEFAULT now(),
  note text
);
COMMENT ON TABLE lde_truck_trip_metrics IS 'Adevărul GPS post-factum, o linie per cursă. km_ideal NULL = furnizor de rutare indisponibil (ROUTING_URL) — analitica scrie «traseu ideal indisponibil», nu inventează.';

ALTER TABLE lde_truck_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_dispatch_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_day_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_truck_trip_metrics ENABLE ROW LEVEL SECURITY;

COMMIT;
```

- [ ] **Step 2: Aplică migrația pe prod** prin MCP `apply_migration` (project_id `zqkzqpfdymddsywxjxow`, name `lde_camioane_dispecerat`), apoi verifică cu `execute_sql`: `select count(*) from lde_truck_trips;` → 0 rânduri, fără eroare.

- [ ] **Step 3: Adaugă `'DISPECER'` în `AdminRole`** (`packages/db/src/types.ts:40`), la finalul listei.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/300_lde_camioane_dispecerat.sql packages/db/src/types.ts
git commit -m "feat(lde): migrația 300 — schema dispecerat camioane + rol DISPECER"
```

---

### Task 2: Logica pură — suprapunere de curse, distanțe, kanban

**Files:**
- Create: `apps/admin/src/lib/lde/camioane.ts`
- Test: `apps/admin/src/lib/lde/camioane.test.ts`

**Interfaces:**
- Produces:
  - `type TripWindow = { id: string; vehicleId: string; loadAt: string; unloadAt: string; status: string }`
  - `seSuprapune(nou: { vehicleId: string; loadAt: string; unloadAt: string; id?: string }, existente: TripWindow[]): TripWindow | null`
  - `haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number`
  - `camioaneMaiAproape(target: {lat,lng}, ales: {vehicleId,lat,lng} | null, candidate: { vehicleId: string; plate: string; lat: number; lng: number }[], maxRezultate?: number): { vehicleId: string; plate: string; km: number; economieKm: number }[]`
  - `type KanbanColumn = 'liber' | 'in_cursa' | 'reparatie' | 'odihna' | 'fara_sofer'`
  - `coloanaKanban(input: { areSofer: boolean; kmAzi: number; stareZi: 'reparatie'|'odihna'|null; cursaActiva: boolean }, pragKmFaraSofer?: number): KanbanColumn | null`

- [ ] **Step 1: Scrie testele care pică**

```ts
import { describe, it, expect } from 'vitest';
import { seSuprapune, haversineKm, camioaneMaiAproape, coloanaKanban } from './camioane';

const cursa = (id: string, loadAt: string, unloadAt: string, vehicleId = 'v1') =>
  ({ id, vehicleId, loadAt, unloadAt, status: 'planificata' });

describe('seSuprapune', () => {
  it('prinde suprapunerea pe același camion', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    const gasit = seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente);
    expect(gasit?.id).toBe('a');
  });

  it('curse lipite cap la cap NU se suprapun', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-03T18:00:00Z', unloadAt: '2026-09-05T10:00:00Z' }, existente)).toBeNull();
  });

  it('alt camion nu contează', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z', 'v2')];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente)).toBeNull();
  });

  it('cursa editată nu se suprapune cu ea însăși', () => {
    const existente = [cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z')];
    expect(seSuprapune({ id: 'a', vehicleId: 'v1', loadAt: '2026-09-01T09:00:00Z', unloadAt: '2026-09-03T18:00:00Z' }, existente)).toBeNull();
  });

  it('cursele anulate nu blochează', () => {
    const existente = [{ ...cursa('a', '2026-09-01T08:00:00Z', '2026-09-03T18:00:00Z'), status: 'anulata' }];
    expect(seSuprapune({ vehicleId: 'v1', loadAt: '2026-09-02T06:00:00Z', unloadAt: '2026-09-04T10:00:00Z' }, existente)).toBeNull();
  });
});

describe('haversineKm', () => {
  it('Chișinău–Bălți ≈ 110 km în linie dreaptă', () => {
    const km = haversineKm({ lat: 47.0105, lng: 28.8638 }, { lat: 47.7615, lng: 27.9291 });
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(120);
  });
});

describe('camioaneMaiAproape', () => {
  const constanta = { lat: 44.1733, lng: 28.6383 };
  it('arată economia față de camionul ales (cazul Bălți→Constanța al lui Ion)', () => {
    const balti = { vehicleId: 'v-balti', plate: 'HMK139', lat: 47.7615, lng: 27.9291 };
    const chisinau = { vehicleId: 'v-chisinau', plate: '820GXP', lat: 47.0105, lng: 28.8638 };
    const r = camioaneMaiAproape(constanta, balti, [balti, chisinau]);
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe('820GXP');
    expect(r[0].economieKm).toBeGreaterThan(50);
  });

  it('camionul ales nu apare în propria listă', () => {
    const balti = { vehicleId: 'v-balti', plate: 'HMK139', lat: 47.7615, lng: 27.9291 };
    expect(camioaneMaiAproape(constanta, balti, [balti]).map(x => x.vehicleId)).not.toContain('v-balti');
  });

  it('fără camion ales întoarce cele mai apropiate, fără economie', () => {
    const balti = { vehicleId: 'v-balti', plate: 'HMK139', lat: 47.7615, lng: 27.9291 };
    const r = camioaneMaiAproape(constanta, null, [balti]);
    expect(r[0].economieKm).toBe(0);
  });
});

describe('coloanaKanban', () => {
  it('reparația și odihna bat cursa activă', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'reparatie', cursaActiva: true })).toBe('reparatie');
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: 'odihna', cursaActiva: false })).toBe('odihna');
  });

  it('fără șofer și fără km — ascuns din kanban', () => {
    expect(coloanaKanban({ areSofer: false, kmAzi: 2, stareZi: null, cursaActiva: false })).toBeNull();
  });

  it('fără șofer dar cu km substanțiali — cere atribuirea', () => {
    expect(coloanaKanban({ areSofer: false, kmAzi: 120, stareZi: null, cursaActiva: false })).toBe('fara_sofer');
  });

  it('cu șofer: în cursă sau liber', () => {
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: null, cursaActiva: true })).toBe('in_cursa');
    expect(coloanaKanban({ areSofer: true, kmAzi: 0, stareZi: null, cursaActiva: false })).toBe('liber');
  });
});
```

- [ ] **Step 2: Rulează testele** — `cd apps/admin && npx vitest run src/lib/lde/camioane.test.ts` → FAIL („Cannot find module './camioane'").

- [ ] **Step 3: Implementează `apps/admin/src/lib/lde/camioane.ts`**

```ts
// Logica pură a dispeceratului de camioane. Fără acces la BD — testabilă direct.
export type TripWindow = { id: string; vehicleId: string; loadAt: string; unloadAt: string; status: string };

/** Cursa nouă/editată se suprapune peste alta a ACELUIAȘI camion? Capetele lipite nu se suprapun. */
export function seSuprapune(
  nou: { vehicleId: string; loadAt: string; unloadAt: string; id?: string },
  existente: TripWindow[],
): TripWindow | null {
  const a1 = Date.parse(nou.loadAt);
  const a2 = Date.parse(nou.unloadAt);
  for (const t of existente) {
    if (t.vehicleId !== nou.vehicleId) continue;
    if (nou.id && t.id === nou.id) continue;
    if (t.status === 'anulata') continue;
    const b1 = Date.parse(t.loadAt);
    const b2 = Date.parse(t.unloadAt);
    if (a1 < b2 && b1 < a2) return t;
  }
  return null;
}

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

/** Avertizarea anti-greșeală: cine e mai aproape de punctul de încărcare decât camionul ales. */
export function camioaneMaiAproape(
  target: { lat: number; lng: number },
  ales: { vehicleId: string; lat: number; lng: number } | null,
  candidate: { vehicleId: string; plate: string; lat: number; lng: number }[],
  maxRezultate = 3,
): { vehicleId: string; plate: string; km: number; economieKm: number }[] {
  const kmAles = ales ? haversineKm(target, ales) : Infinity;
  return candidate
    .filter((c) => !ales || c.vehicleId !== ales.vehicleId)
    .map((c) => ({ vehicleId: c.vehicleId, plate: c.plate, km: haversineKm(target, c) }))
    .filter((c) => c.km < kmAles)
    .sort((x, y) => x.km - y.km)
    .slice(0, maxRezultate)
    .map((c) => ({ ...c, economieKm: Number.isFinite(kmAles) ? Math.round(kmAles - c.km) : 0 }));
}

export type KanbanColumn = 'liber' | 'in_cursa' | 'reparatie' | 'odihna' | 'fara_sofer';

/** null = camionul nu apare deloc în kanban (fără șofer, nu lucrează — decizia Ion 31.08). */
export function coloanaKanban(
  input: { areSofer: boolean; kmAzi: number; stareZi: 'reparatie' | 'odihna' | null; cursaActiva: boolean },
  pragKmFaraSofer = 5,
): KanbanColumn | null {
  if (input.stareZi) return input.stareZi;
  if (!input.areSofer) return input.kmAzi > pragKmFaraSofer ? 'fara_sofer' : null;
  return input.cursaActiva ? 'in_cursa' : 'liber';
}
```

- [ ] **Step 4: Rulează testele** → 12 PASS. Rulează și `npx tsc --noEmit` → curat.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/lde/camioane.ts apps/admin/src/lib/lde/camioane.test.ts
git commit -m "feat(lde): logica pură a dispeceratului — suprapuneri, distanțe, coloane kanban"
```

---

### Task 3: Ruta `/lde/camioane` cu file, rolul DISPECER în middleware și sidebar

**Files:**
- Create: `apps/admin/src/lib/lde/camioane-nav.ts`, `apps/admin/src/lib/lde/camioane-nav.test.ts`
- Create: `apps/admin/src/app/(dashboard)/lde/camioane/page.tsx`, `CamioaneNav.tsx`, `layout.tsx`
- Modify: `apps/admin/src/middleware.ts` (constantă `DISPECER_ALLOWED` + bloc de redirect), `apps/admin/src/components/Sidebar.tsx` (item nou + filtrare pentru DISPECER)

**Interfaces:**
- Consumes: `AdminRole` din Task 1.
- Produces: `camioaneTabsForRole(role: string): { href: string; label: string }[]` — filele vizibile; ADMIN vede 4, DISPECER 3 (fără Analitică), altcineva `[]`.

- [ ] **Step 1: Testul pentru nav**

```ts
import { describe, it, expect } from 'vitest';
import { camioaneTabsForRole } from './camioane-nav';

describe('camioaneTabsForRole', () => {
  it('ADMIN vede toate filele, inclusiv Analitica', () => {
    const t = camioaneTabsForRole('ADMIN').map((x) => x.href);
    expect(t).toEqual(['/lde/camioane', '/lde/camioane/planificare', '/lde/camioane/puncte', '/lde/camioane/analitica']);
  });
  it('DISPECER nu vede Analitica', () => {
    const t = camioaneTabsForRole('DISPECER').map((x) => x.href);
    expect(t).not.toContain('/lde/camioane/analitica');
    expect(t).toHaveLength(3);
  });
  it('alte roluri nu văd nimic', () => {
    expect(camioaneTabsForRole('UZINE')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rulează** → FAIL. **Step 3: Implementează**

```ts
// apps/admin/src/lib/lde/camioane-nav.ts
export type CamioaneTab = { href: string; label: string };

const TOATE: CamioaneTab[] = [
  { href: '/lde/camioane', label: 'Dispecerat' },
  { href: '/lde/camioane/planificare', label: 'Planificare' },
  { href: '/lde/camioane/puncte', label: 'Puncte' },
  { href: '/lde/camioane/analitica', label: 'Analitică' },
];

export function camioaneTabsForRole(role: string): CamioaneTab[] {
  if (role === 'ADMIN') return TOATE;
  if (role === 'DISPECER') return TOATE.filter((t) => t.href !== '/lde/camioane/analitica');
  return [];
}
```

- [ ] **Step 4: Rulează testele** → PASS.

- [ ] **Step 5: Layout + nav** — `layout.tsx` verifică sesiunea (`ADMIN` sau `DISPECER`, altfel `redirect('/login')`) și randează `<CamioaneNav role={session.role} />` peste `{children}`; `CamioaneNav.tsx` e client, folosește `usePathname()` și butoane `btn`/`btn-primary` ca în `MasiniTipuriClient.tsx`.

- [ ] **Step 6: Middleware** — adaugă lângă `UZINE_ALLOWED`:

```ts
const DISPECER_ALLOWED = ['/lde/camioane'];
```
și, în blocul de roluri, aceeași formă ca la UZINE: dacă rolul e `DISPECER` și calea nu începe cu una permisă → `NextResponse.redirect(new URL('/lde/camioane', request.url))`.

- [ ] **Step 7: Sidebar** — în `ldeChildren` adaugă `{ href: '/lde/camioane', label: 'Camioane' }` (fără `adminOnly`), iar în filtrarea pe rol tratează `DISPECER` la fel ca UZINE, dar cu lista `['/lde/camioane']`.

- [ ] **Step 8: Verifică** `npx tsc --noEmit && npx vitest run` → curat. **Step 9: Commit**

```bash
git add apps/admin/src/lib/lde/camioane-nav.ts apps/admin/src/lib/lde/camioane-nav.test.ts apps/admin/src/app/\(dashboard\)/lde/camioane apps/admin/src/middleware.ts apps/admin/src/components/Sidebar.tsx
git commit -m "feat(lde): ruta /lde/camioane cu file + rol DISPECER în middleware și sidebar"
```

---

### Task 4: Fila Puncte — nomenclatorul

**Files:**
- Create: `apps/admin/src/app/(dashboard)/lde/camioane/puncte/page.tsx`, `actions.ts`, `PuncteClient.tsx`

**Interfaces:**
- Produces: `getPuncte(): Promise<Punct[]>` cu `type Punct = { id: string; name: string; country: string | null; lat: number | null; lng: number | null; radius_m: number; active: boolean }`; `adaugaPunct(p)`, `editeazaPunct(p)`, `dezactiveazaPunct(id)` — toate întorc `{ ok: true; mesaj: string } | { error: string }`.

- [ ] **Step 1: `actions.ts`** — `'use server'`, gardă locală `requireCamioaneRole()` (ADMIN sau DISPECER, altfel `throw new Error('Neautorizat')` pentru citiri și `{ error: 'Neautorizat' }` pentru scrieri); citire cu `.order('name')`; la insert prinde 23505 → `{ error: 'Există deja un punct cu acest nume' }`; scrie `created_by: session.email`.
- [ ] **Step 2: `PuncteClient.tsx`** — tabel `pivot-table` (nume, țară, coordonate sau insigna «fără coordonate», raza, acțiuni) + card de adăugare; helper-ul `ruleaza()` din `ParcClient.tsx`.
- [ ] **Step 3: `page.tsx`** — server, `verifySession`, prefetch `getPuncte()`.
- [ ] **Step 4: Verifică** `npx tsc --noEmit` curat; deschide pagina local dacă e posibil.
- [ ] **Step 5: Commit** — `feat(lde): fila Puncte — nomenclatorul punctelor de încărcare/descărcare`.

---

### Task 5: Formularul cursei + fila Planificare (grila)

**Files:**
- Create: `apps/admin/src/app/(dashboard)/lde/camioane/planificare/page.tsx`, `actions.ts`, `PlanificareClient.tsx`, `TripForm.tsx`

**Interfaces:**
- Consumes: `seSuprapune` (Task 2), `getPuncte` (Task 4).
- Produces: `getPlanificare(from: string, to: string)` → `{ camioane, curse, stariZi, puncte, soferi }`; `salveazaCursa(input)`, `anuleazaCursa(id, motiv)`, `seteazaStareZi(vehicleId, date, state, reason?, expectedEnd?)`, `stergeStareZi(id)` — toate `{ ok } | { error }`.

- [ ] **Step 1: `actions.ts`** — camioanele: `vehicles` cu `active`, `is_lde`, `directions @> {camioane}`, embed `lde_truck_profile`; șoferul precompletat din `lde_active_assignments` (`valid_to is null`); la salvare **verifică server-side suprapunerea** cu `seSuprapune` peste cursele camionului din fereastra atinsă → `{ error: 'Camionul are deja cursa X în acest interval' }`; scrie `created_by`/`updated_by` din sesiune.
- [ ] **Step 2: `TripForm.tsx`** — câmpuri: camion (select), șofer (precompletat, editabil), marfă (text liber cu sugestii diesel/biodiesel), client (text), punct încărcare + dată/oră, punct descărcare + dată/oră, note. Selectul de puncte are opțiunea «+ Punct nou» care deschide inline câmpurile din Task 4 și cheamă `adaugaPunct`.
- [ ] **Step 3: `PlanificareClient.tsx`** — grilă `pivot-table`: rânduri = camioane grupate pe `fleet_type`, coloane = 14 zile de la data aleasă; cursa se desenează ca bară care se întinde peste zilele acoperite (culoare după marfă), reparația/odihna ca celulă hașurată; click pe celulă goală → `TripForm` precompletat cu camionul și ziua.
- [ ] **Step 4: `page.tsx`** — server, `searchParams` cu `from`, default: azi − 1 zi.
- [ ] **Step 5: Verifică** `npx tsc --noEmit && npx vitest run`. **Step 6: Commit** — `feat(lde): fila Planificare — grila camioane × zile și formularul cursei`.

---

### Task 6: Review Etapa 1 + deploy

- [ ] **Step 1:** rulează în paralel `architecture-guardian`, `performance-reviewer`, `business-logic-auditor` pe modificările Etapei 1; repară Critical/High.
- [ ] **Step 2:** rulează `security-reviewer`; repară Critical/High.
- [ ] **Step 3:** `git push origin main`; verifică deploy-ul `central-hub` READY.

---

## Etapa 2 — Dispecerat (kanban + hartă + avertizare)

### Task 7: Endpoint poziții live Wialon

**Files:**
- Create: `apps/admin/src/lib/wialon.ts`, `apps/admin/src/app/api/lde/camioane/pozitii/route.ts`

**Interfaces:**
- Produces: `GET /api/lde/camioane/pozitii` → `{ positions: { plate: string; lat: number; lng: number; speed: number; at: string }[] }`, doar pentru sesiuni ADMIN/DISPECER.
- `lib/wialon.ts`: `login(): Promise<string>`, `unitPositions(sid): Promise<...>`, port al clientului din `lde-geo-worker/wialon-api.mjs` (`core/search_items` cu flags de poziție), plus maparea plăcii prin regex-ul existent `/([A-Z]{3})\s?(\d{3})/`.

- [ ] **Step 1:** portează clientul; cheia din `process.env.WIALON_TOKEN` (de setat în Vercel), host `WIALON_HOST` cu default `https://hst-api.wialon.com`.
- [ ] **Step 2:** ruta verifică sesiunea, cachează sid-ul în memoria instanței 10 min, întoarce 503 cu `{ error }` dacă lipsește tokenul — pagina afișează harta goală cu mesaj, nu crapă.
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4:** Commit — `feat(lde): endpoint poziții live Wialon pentru dispecerat`.

### Task 8: Harta (leaflet) + fila Dispecerat

**Files:**
- Modify: `apps/admin/package.json` (+`leaflet`, `react-leaflet`, `@types/leaflet`)
- Create: `apps/admin/src/components/FleetMap.tsx`, `apps/admin/src/app/(dashboard)/lde/camioane/page.tsx` (Dispecerat), `actions.ts`, `DispeceratClient.tsx`

- [ ] **Step 1:** instalează dependențele; `FleetMap.tsx` = client, `dynamic(() => import(...), { ssr: false })`, tile-uri OSM standard, pin colorat după coloana kanban.
- [ ] **Step 2:** `actions.ts` — `getDispecerat()`: camioanele + șoferul activ + cursa curentă (status ∉ {incheiata, anulata} și fereastra acoperă acum) + starea zilei + `km` de azi din `lde_vehicle_gps_daily`; coloana se calculează cu `coloanaKanban` (Task 2).
- [ ] **Step 3:** `DispeceratClient.tsx` — cinci coloane kanban cu cartonașe; buton pe cartonaș pentru mutarea manuală a stării cursei (`schimbaStareaCursei(tripId, status)` cu validarea ordinii), butoane Reparație/Odihnă/Cursă nouă; harta în dreapta, refresh la 60s cât fila e vizibilă (`document.visibilityState`).
- [ ] **Step 4:** integrează avertizarea `camioaneMaiAproape` în `TripForm` folosind pozițiile live.
- [ ] **Step 5:** `npx tsc --noEmit && npx vitest run`. **Step 6:** Commit — `feat(lde): fila Dispecerat — kanban, hartă live, avertizare la atribuire`.

### Task 9: Review Etapa 2 + deploy — aceiași pași ca Task 6.

---

## Etapa 3 — worker nocturn + Analitică

### Task 10: Calculul pur al metricilor (worker)

**Files:**
- Create: `lde-geo-worker/trip-metrics.mjs`, `lde-geo-worker/trip-metrics.test.mjs`

**Interfaces:**
- Produces: `detectArrival(points, point, radiusM)` → prima intrare în rază (timestamp) sau null; `stopsOver(points, minMinutes, excludePoints)` → opriri lungi în afara punctelor; `tripKm(points)` → km reali (refolosește `computeDay` din `km-core.mjs`); `emptyKm(prevUnload, currentLoad, points)`.

- [ ] **Step 1:** teste `.mjs` în stilul `km-core.test.mjs` (fixtures inline de puncte GPS).
- [ ] **Step 2:** implementare; **Step 3:** `node --test lde-geo-worker/trip-metrics.test.mjs` (sau runner-ul folosit acolo) → PASS. **Step 4:** Commit.

### Task 11: Jobul nocturn + furnizorul de rutare

**Files:**
- Create: `lde-geo-worker/trip-worker.mjs`
- Modify: `lde-geo-worker/run-nightly.sh` (adaugă apelul)

- [ ] **Step 1:** ia cursele cu `status <> 'anulata'` care ating ziua de ieri; pentru fiecare: track Wialon pe fereastra cursei → `tripKm`, `detectArrival` pe punctele de încărcare/descărcare (dacă au coordonate), `stopsOver(30)`, `emptyKm`; `km_ideal` prin `ROUTING_URL` (Valhalla `/route`, `costing=truck`) — lipsă/eroare → `null` + `note='ruter indisponibil'`.
- [ ] **Step 2:** upsert în `lde_truck_trip_metrics` (`onConflict: 'trip_id'`).
- [ ] **Step 3:** semnalul fără-șofer: camioane fără atribuire activă cu `km > 5` în `lde_vehicle_gps_daily` pentru ieri → nimic de scris (kanbanul îl derivă singur din km); doar log.
- [ ] **Step 4:** copiază pe VPS cu `scp` și rulează manual o dată; verifică rândurile scrise. **Step 5:** Commit.

### Task 12: Fila Analitică (ADMIN)

**Files:**
- Create: `apps/admin/src/app/(dashboard)/lde/camioane/analitica/page.tsx`, `actions.ts`, `AnaliticaClient.tsx`
- Create: `apps/admin/src/lib/lde/camioane-analitica.ts` + `.test.ts` (agregările pure: utilizare pe camion, medii de întârziere, procent km goi)

- [ ] **Step 1:** teste pentru agregările pure (fixtures inline). **Step 2:** implementare. **Step 3:** `actions.ts` ADMIN-only cu `requireRole(session, 'ADMIN')`, citește curse + metrici pe perioadă. **Step 4:** `AnaliticaClient.tsx` cu patru blocuri (trasee, punctualitate, utilizare, km goi); acolo unde `km_ideal` e null scrie «traseu ideal indisponibil». **Step 5:** `npx tsc --noEmit && npx vitest run`. **Step 6:** Commit.

### Task 13: Review Etapa 3 + deploy — aceiași pași ca Task 6.

---

## Self-review

- **Acoperirea specului:** rol DISPECER (T1, T3) · tipuri cisternă/zernovoz (T1) · «fără șofer» derivat + semnal pe km (T2 `coloanaKanban`, T11) · cursa multi-zi (T1, T5) · stări reparație/odihnă (T1, T5, T8) · nomenclator puncte + adăugare inline (T4, T5) · kanban + hartă (T8) · grilă de planificare (T5) · avertizare «camion mai aproape» (T2, T8) · stări manuale (T8) · metrici GPS nocturne (T10, T11) · analitică cu patru blocuri (T12) · o singură pagină cu file (T3).
- **Fără placeholdere:** fiecare pas de cod are cod real; SQL-ul migrației e complet.
- **Consistență de tipuri:** `TripWindow`, `KanbanColumn`, `CamioaneTab`, semnăturile acțiunilor sunt aceleași în toate task-urile care le consumă.
- **Abateri conștiente față de spec, notate aici:** (1) tipul camionului stă în `lde_truck_profile`, nu ca o coloană pe `vehicles` — tabela e partajată cu autobuzele și cu workerul GPS; (2) „km ideali" depind de `ROUTING_URL`, care nu există încă în infrastructură — până atunci metrica e goală, nu estimată.
