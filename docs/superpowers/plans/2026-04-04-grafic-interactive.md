# Interactive Grafic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate Programare and Grafic pages with a single interactive page where dispatchers assign drivers directly on the schedule template image, with WYSIWYG download via html2canvas.

**Architecture:** PNG template as CSS background-image. Driver phone/name overlaid as absolutely-positioned HTML text. Click on row → popup with driver/vehicle selects → save to `daily_assignments`. Download via `html2canvas` captures exactly what's on screen.

**Tech Stack:** Next.js 15 App Router, React, Supabase, html2canvas, CSS absolute positioning

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/app/(dashboard)/grafic/GraficClient.tsx` | Rewrite | Main interactive component |
| `apps/web/src/app/(dashboard)/grafic/actions.ts` | Rewrite | Combined server actions (schedule data + assignment CRUD) |
| `apps/web/src/app/(dashboard)/grafic/page.tsx` | Modify | Pass drivers/vehicles as server props |
| `apps/web/src/components/Sidebar.tsx` | Modify | Remove Programare link |
| `apps/web/package.json` | Modify | Add html2canvas dependency |

---

### Task 1: Install html2canvas

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install dependency**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npm install html2canvas --workspace=apps/web
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('html2canvas'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "feat: add html2canvas for client-side schedule image capture"
```

---

### Task 2: Rewrite grafic/actions.ts — combined server actions

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/grafic/actions.ts`

This file merges data-fetching from the old grafic/actions.ts with CRUD operations from assignments/actions.ts. It provides everything the new GraficClient needs.

- [ ] **Step 1: Write the new actions.ts**

```typescript
'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

/* ── Types ── */

export interface DriverOption {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface VehicleOption {
  id: string;
  plate_number: string;
}

export interface GraficRow {
  crm_route_id: number;
  seq: number;                    // 1-based position in sorted list
  assignment_id: string | null;
  driver_id: string | null;
  driver_phone: string | null;    // local format "069..."
  driver_name: string | null;     // first name only
  vehicle_id: string | null;
  vehicle_plate: string | null;
  vehicle_id_retur: string | null;
  vehicle_plate_retur: string | null;
}

/* ── Helpers ── */

function parseFirstTime(display: string): number {
  const match = display.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function toLocalPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('373') && digits.length >= 11) {
    return '0' + digits.slice(3);
  }
  return digits.startsWith('0') ? digits : '0' + digits;
}

function extractFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

/* ── Data loading ── */

export async function getGraficData(date: string): Promise<{
  page1: GraficRow[];
  page2: GraficRow[];
}> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const db = getSupabase();

  const [routesRes, assignmentsRes, driversRes, vehiclesRes] = await Promise.all([
    db.from('crm_routes').select('id, time_nord').eq('active', true),
    db.from('daily_assignments')
      .select('id, crm_route_id, driver_id, vehicle_id, vehicle_id_retur')
      .eq('assignment_date', date),
    db.from('drivers').select('id, full_name, phone').eq('active', true),
    db.from('vehicles').select('id, plate_number').eq('active', true),
  ]);

  const routes = (routesRes.data || []) as any[];
  const assignments = (assignmentsRes.data || []) as any[];
  const drivers = (driversRes.data || []) as any[];
  const vehicles = (vehiclesRes.data || []) as any[];

  const assignmentMap = new Map(assignments.map((a: any) => [a.crm_route_id, a]));
  const driverMap = new Map(drivers.map((d: any) => [d.id, d]));
  const vehicleMap = new Map(vehicles.map((v: any) => [v.id, v]));

  const rows = routes.map((r: any) => {
    const a = assignmentMap.get(r.id);
    const driver = a?.driver_id ? driverMap.get(a.driver_id) : null;
    const vTur = a?.vehicle_id ? vehicleMap.get(a.vehicle_id) : null;
    const vRet = a?.vehicle_id_retur ? vehicleMap.get(a.vehicle_id_retur) : null;

    return {
      _sortKey: parseFirstTime(r.time_nord || ''),
      crm_route_id: r.id,
      assignment_id: a?.id || null,
      driver_id: a?.driver_id || null,
      driver_phone: toLocalPhone(driver?.phone || null),
      driver_name: driver?.full_name ? extractFirstName(driver.full_name) : null,
      vehicle_id: a?.vehicle_id || null,
      vehicle_plate: vTur?.plate_number || null,
      vehicle_id_retur: a?.vehicle_id_retur || null,
      vehicle_plate_retur: vRet?.plate_number || null,
    };
  });

  rows.sort((a, b) => a._sortKey - b._sortKey);

  const numbered: GraficRow[] = rows.slice(0, 28).map((r, i) => ({
    seq: i + 1,
    crm_route_id: r.crm_route_id,
    assignment_id: r.assignment_id,
    driver_id: r.driver_id,
    driver_phone: r.driver_phone,
    driver_name: r.driver_name,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicle_plate,
    vehicle_id_retur: r.vehicle_id_retur,
    vehicle_plate_retur: r.vehicle_plate_retur,
  }));

  return {
    page1: numbered.slice(0, 14),
    page2: numbered.slice(14, 28),
  };
}

/* ── Assignment CRUD ── */

export async function upsertAssignment(
  crmRouteId: number,
  date: string,
  driverId: string,
  vehicleId: string | null,
  vehicleIdRetur: string | null
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const db = getSupabase();
  const { error } = await db.from('daily_assignments').upsert(
    {
      crm_route_id: crmRouteId,
      assignment_date: date,
      driver_id: driverId,
      vehicle_id: vehicleId,
      vehicle_id_retur: vehicleIdRetur,
    },
    { onConflict: 'crm_route_id,assignment_date' }
  );

  if (error) return { error: error.message };
  return {};
}

export async function deleteAssignment(assignmentId: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const db = getSupabase();
  const { error } = await db.from('daily_assignments').delete().eq('id', assignmentId);
  if (error) return { error: error.message };
  return {};
}

export async function copyAssignments(
  sourceDate: string,
  targetDate: string
): Promise<{ error?: string; count?: number }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };

  const db = getSupabase();

  const { data: existing } = await db
    .from('daily_assignments')
    .select('id')
    .eq('assignment_date', targetDate)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'Există deja programări pentru această dată' };
  }

  const { data: source, error: fetchErr } = await db
    .from('daily_assignments')
    .select('crm_route_id, driver_id, vehicle_id, vehicle_id_retur')
    .eq('assignment_date', sourceDate);

  if (fetchErr) return { error: fetchErr.message };
  if (!source || source.length === 0) return { error: 'Nu există programări de copiat' };

  const rows = source.map((s: any) => ({
    crm_route_id: s.crm_route_id,
    assignment_date: targetDate,
    driver_id: s.driver_id,
    vehicle_id: s.vehicle_id,
    vehicle_id_retur: s.vehicle_id_retur,
  }));

  const { error: insertErr } = await db.from('daily_assignments').insert(rows);
  if (insertErr) return { error: insertErr.message };
  return { count: rows.length };
}

/* ── Static data loaders (called from page.tsx) ── */

export async function getActiveDrivers(): Promise<DriverOption[]> {
  const db = getSupabase();
  const { data } = await db
    .from('drivers')
    .select('id, full_name, phone')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}

export async function getActiveVehicles(): Promise<VehicleOption[]> {
  const db = getSupabase();
  const { data } = await db
    .from('vehicles')
    .select('id, plate_number')
    .eq('active', true)
    .order('plate_number');
  return (data || []) as VehicleOption[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: no errors related to grafic/actions.ts

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/grafic/actions.ts
git commit -m "feat: rewrite grafic actions with combined schedule data + assignment CRUD"
```

---

### Task 3: Update grafic/page.tsx — pass drivers and vehicles as props

**Files:**
- Modify: `apps/web/src/app/(dashboard)/grafic/page.tsx`

- [ ] **Step 1: Update page.tsx**

```typescript
export const dynamic = 'force-dynamic';

import { verifySession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getActiveDrivers, getActiveVehicles } from './actions';
import GraficClient from './GraficClient';

export default async function GraficPage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN' && session.role !== 'GRAFIC') redirect('/login');

  const [drivers, vehicles] = await Promise.all([
    getActiveDrivers(),
    getActiveVehicles(),
  ]);

  return <GraficClient drivers={drivers} vehicles={vehicles} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/grafic/page.tsx
git commit -m "feat: pass drivers and vehicles as server props to GraficClient"
```

---

### Task 4: Rewrite GraficClient.tsx — interactive schedule on template

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/grafic/GraficClient.tsx`

This is the core of the feature. The component renders:
1. Date picker + action buttons (copy, download)
2. Page tabs (1-14 / 15-28)
3. Template PNG as background with absolutely positioned driver data
4. Click-to-assign popup

**Layout constants** (from the existing schedule-image.ts, adapted to CSS):
- Template: 896×1200px
- Date position: top: 60px, left: 500px
- Driver column center: ~805px from left
- First row top: ~265px
- Row height: ~67px
- Name offset below phone: ~22px

- [ ] **Step 1: Write GraficClient.tsx**

```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getGraficData,
  upsertAssignment,
  deleteAssignment,
  copyAssignments,
  type GraficRow,
  type DriverOption,
  type VehicleOption,
} from './actions';

/* ── Layout constants matching template (896×1200) ── */
const CANVAS_W = 896;
const CANVAS_H = 1200;
const DATE_TOP = 55;
const DATE_LEFT = 500;
const DRIVER_CENTER_X = 805;
const TABLE_TOP = 270;
const ROW_H = 67;
const NAME_OFFSET = 22;

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

function yesterdayOf(date: string): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

interface PopupState {
  rowIndex: number;
  row: GraficRow;
}

export default function GraficClient({
  drivers,
  vehicles,
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
}) {
  const [date, setDate] = useState(todayChisinau);
  const [page, setPage] = useState<1 | 2>(1);
  const [rows, setRows] = useState<GraficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  // Popup form state
  const [popDriverId, setPopDriverId] = useState('');
  const [popVehicleId, setPopVehicleId] = useState('');
  const [popVehicleRetId, setPopVehicleRetId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGraficData(date);
      setRows(page === 1 ? data.page1 : data.page2);
    } catch (err: any) {
      setError(err.message || 'Eroare');
    } finally {
      setLoading(false);
    }
  }, [date, page]);

  useEffect(() => { loadData(); }, [loadData]);

  function openPopup(i: number, row: GraficRow) {
    setPopDriverId(row.driver_id || '');
    setPopVehicleId(row.vehicle_id || '');
    setPopVehicleRetId(row.vehicle_id_retur || '');
    setPopup({ rowIndex: i, row });
  }

  async function handleSave() {
    if (!popup || !popDriverId) return;
    setSaving(true);
    const res = await upsertAssignment(
      popup.row.crm_route_id,
      date,
      popDriverId,
      popVehicleId || null,
      popVehicleRetId || null
    );
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setPopup(null);
    loadData();
  }

  async function handleDelete() {
    if (!popup?.row.assignment_id) return;
    setSaving(true);
    const res = await deleteAssignment(popup.row.assignment_id);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setPopup(null);
    loadData();
  }

  async function handleCopy() {
    setCopying(true);
    setError('');
    const res = await copyAssignments(yesterdayOf(date), date);
    setCopying(false);
    if (res.error) { setError(res.error); return; }
    loadData();
  }

  async function handleDownload() {
    const el = canvasRef.current;
    if (!el) return;
    // Dynamically import html2canvas to avoid SSR issues
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, {
      width: CANVAS_W,
      height: CANVAS_H,
      scale: 1,
      useCORS: true,
      backgroundColor: null,
    });
    const link = document.createElement('a');
    link.download = `grafic-${formatDate(date)}-p${page}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const templateUrl = `/templates/schedule-p${page}.png`;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1>Grafic Zilnic</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-outline" onClick={handleCopy} disabled={copying}>
            {copying ? 'Se copiază...' : 'Copiază de ieri'}
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            Descarcă PNG
          </button>
        </div>
      </div>

      {/* ── Page tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {([1, 2] as const).map((p) => (
          <button
            key={p}
            className={`btn ${page === p ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setPage(p)}
          >
            Pagina {p} ({p === 1 ? '1-14' : '15-28'})
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: '#c00', marginBottom: 8, fontSize: 14 }}>{error}</div>
      )}

      {/* ── Schedule canvas ── */}
      <div style={{ overflow: 'auto' }}>
        <div
          ref={canvasRef}
          style={{
            position: 'relative',
            width: CANVAS_W,
            height: CANVAS_H,
            backgroundImage: `url(${templateUrl})`,
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            fontFamily: "'Open Sans', sans-serif",
          }}
        >
          {/* Date overlay */}
          <div
            style={{
              position: 'absolute',
              top: DATE_TOP,
              left: DATE_LEFT,
              fontSize: 38,
              fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
              fontStyle: 'italic',
              fontWeight: 500,
              color: '#4a2028',
              pointerEvents: 'none',
            }}
          >
            {formatDate(date)}
          </div>

          {/* Driver cells */}
          {rows.map((row, i) => {
            const top = TABLE_TOP + i * ROW_H;
            return (
              <div
                key={row.crm_route_id}
                onClick={() => openPopup(i, row)}
                title={row.vehicle_plate ? `Auto: ${row.vehicle_plate}` : 'Click pentru programare'}
                style={{
                  position: 'absolute',
                  top,
                  left: DRIVER_CENTER_X - 80,
                  width: 160,
                  height: ROW_H - 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 4,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(155,27,48,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {row.driver_phone && (
                  <span style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#4a2028',
                    lineHeight: 1.1,
                  }}>
                    {row.driver_phone}
                  </span>
                )}
                {row.driver_name && (
                  <span style={{
                    fontSize: 16,
                    color: '#4a2028',
                    lineHeight: 1.2,
                  }}>
                    {row.driver_name}
                  </span>
                )}
                {!row.driver_phone && (
                  <span style={{ fontSize: 12, color: '#aaa' }}>+</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Assignment popup ── */}
      {popup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setPopup(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 320,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>
              Ruta #{popup.row.seq}
            </h3>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Șofer</span>
              <select
                value={popDriverId}
                onChange={(e) => setPopDriverId(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="">— Selectează —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Auto (tur)</span>
              <select
                value={popVehicleId}
                onChange={(e) => setPopVehicleId(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="">— Fără —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate_number}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#666' }}>Auto (retur)</span>
              <select
                value={popVehicleRetId}
                onChange={(e) => setPopVehicleRetId(e.target.value)}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              >
                <option value="">— Același —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate_number}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !popDriverId}
              >
                {saving ? '...' : 'Salvează'}
              </button>
              {popup.row.assignment_id && (
                <button
                  className="btn btn-outline"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{ color: '#c00', borderColor: '#c00' }}
                >
                  Șterge
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setPopup(null)}>
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.6)',
          pointerEvents: 'none',
        }}>
          Se încarcă...
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/grafic/GraficClient.tsx
git commit -m "feat: interactive grafic with template background and click-to-assign"
```

---

### Task 5: Update Sidebar — remove Programare link

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Remove the /assignments nav entry**

In `apps/web/src/components/Sidebar.tsx`, remove the line:
```typescript
  { href: '/assignments',  label: 'Programare',    adminOnly: false, icon: '...' },
```

- [ ] **Step 2: Update /assignments redirect**

The old `/assignments` page should redirect to `/grafic` so any bookmarks still work. Keep the page file but make it redirect:

In `apps/web/src/app/(dashboard)/assignments/page.tsx`, replace contents with:
```typescript
import { redirect } from 'next/navigation';

export default function AssignmentsPage() {
  redirect('/grafic');
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/app/\(dashboard\)/assignments/page.tsx
git commit -m "feat: remove Programare from sidebar, redirect /assignments to /grafic"
```

---

### Task 6: Manual testing and coordinate calibration

- [ ] **Step 1: Start dev server**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npm run dev --workspace=apps/web
```

- [ ] **Step 2: Open /grafic in browser**

Navigate to `http://localhost:3000/grafic`. Verify:
- Template image displays as background
- Date appears after "Grafic din:"
- Existing assignments show phone + name in correct row positions
- Page tabs switch between page 1 and page 2

- [ ] **Step 3: Test assignment flow**

1. Click on an empty row → popup appears
2. Select a driver → phone appears in the select
3. Select vehicle tur
4. Click "Salvează" → row updates with phone + name
5. Click on a filled row → popup shows current values
6. Click "Șterge" → row clears

- [ ] **Step 4: Calibrate positions**

Compare the HTML overlay positions with the correct example image (`/Users/ionpop/Downloads/hf_20260403_202927_b409a4df-0525-41b4-bb14-debe695a4e1f.png`).

Adjust constants in GraficClient.tsx if needed:
- `DATE_TOP`, `DATE_LEFT` — date position
- `TABLE_TOP` — first row Y position
- `ROW_H` — row spacing
- `DRIVER_CENTER_X` — horizontal center of driver column

- [ ] **Step 5: Test download**

1. Click "Descarcă PNG"
2. Open downloaded file
3. Compare with the correct example — positions should match exactly since html2canvas captures the screen

- [ ] **Step 6: Test copy from yesterday**

Click "Copiază de ieri" → verify assignments copied

- [ ] **Step 7: Commit calibration changes (if any)**

```bash
git add -A
git commit -m "fix: calibrate layout constants for template alignment"
```

---

### Task 7: Deploy to production

- [ ] **Step 1: Deploy**

```bash
cd /Users/ionpop/Desktop/TRANSLUX && npx vercel --prod
```

- [ ] **Step 2: Verify on production**

Open `https://translux-web.vercel.app/grafic` and verify all functionality works.

---

## Notes

- The `html2canvas` library needs the Cormorant Garamond font loaded via CSS `@font-face` for the date to render in italic serif during capture. If the font doesn't load, the date will fall back to Times New Roman serif italic, which is acceptable.
- The popup is hidden from the captured image because it uses `position: fixed` which html2canvas typically does not capture.
- The hover highlight (`rgba(155,27,48,0.06)`) will not appear in downloads since the mouse won't be hovering during capture.
- If coordinate calibration shows the CSS positions don't match the template, adjust the constants at the top of GraficClient.tsx. This is much simpler than the old Sharp/SVG approach because changes are visible instantly in the browser.
