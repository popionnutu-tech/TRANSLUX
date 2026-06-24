# Numarare Passenger Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Numărare" tab to the `/reports` page showing passenger counts per interurban route from Chișinău heading north, with daily (single date) and weekly (average per day of week over a period) modes.

**Architecture:** Two new server actions fetch data from `counting_entries` → `counting_sessions` → `crm_routes` with fixed filters (direction=retur, stop_order=1, completed sessions, interurban routes). A new client component renders daily/weekly views. The existing `page.tsx` dispatches to the new component when `reportType=numarare`.

**Tech Stack:** Next.js (App Router, server actions), Supabase JS client, TypeScript, existing CSS classes from the admin app.

---

## File Structure

```
apps/admin/src/app/(dashboard)/reports/
├── numarare-report-actions.ts    (CREATE — server actions: getNumarareDaily, getNumarareWeekly)
├── NumarareReportsClient.tsx     (CREATE — client component: daily + weekly views)
├── page.tsx                      (MODIFY — add reportType=numarare branch)
├── ReportsClient.tsx             (MODIFY — add Numărare button to mode toggle)
├── SmmReportsClient.tsx          (MODIFY — add Numărare button to mode toggle)
```

---

### Task 1: Backend — Server Actions

**Files:**
- Create: `apps/admin/src/app/(dashboard)/reports/numarare-report-actions.ts`

- [ ] **Step 1: Create `numarare-report-actions.ts` with types and `getNumarareDaily`**

```ts
// apps/admin/src/app/(dashboard)/reports/numarare-report-actions.ts
'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

export interface NumarareDailyRow {
  crm_route_id: number;
  dest_to_ro: string;
  time_nord: string;
  passengers: number | null;
}

export interface NumarareWeeklyRow {
  crm_route_id: number;
  dest_to_ro: string;
  time_nord: string;
  dayOfWeek: number; // ISO: 1=Mon, 7=Sun
  avgPassengers: number;
}

function parseTimeNord(t: string): number {
  const m = t?.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export async function getNumarareDaily(date: string): Promise<NumarareDailyRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const sb = getSupabase();

  // 1. All active interurban routes
  const { data: routes } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord')
    .eq('active', true)
    .eq('route_type', 'interurban');

  if (!routes || routes.length === 0) return [];

  // 2. Completed sessions for this date
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('id, crm_route_id')
    .eq('assignment_date', date)
    .eq('status', 'completed');

  const sessionMap = new Map<number, string>();
  for (const s of (sessions || []) as any[]) {
    sessionMap.set(s.crm_route_id, s.id);
  }

  // 3. Get retur stop_order=1 entries for those sessions
  const sessionIds = Array.from(sessionMap.values());
  let entryMap = new Map<string, number>();

  if (sessionIds.length > 0) {
    const { data: entries } = await sb
      .from('counting_entries')
      .select('session_id, total_passengers')
      .in('session_id', sessionIds)
      .eq('direction', 'retur')
      .eq('stop_order', 1);

    for (const e of (entries || []) as any[]) {
      entryMap.set(e.session_id, e.total_passengers ?? 0);
    }
  }

  // 4. Build result — all routes, passengers or null
  const result: NumarareDailyRow[] = (routes as any[]).map((r) => {
    const sessionId = sessionMap.get(r.id);
    const passengers = sessionId ? (entryMap.get(sessionId) ?? null) : null;
    return {
      crm_route_id: r.id,
      dest_to_ro: r.dest_to_ro,
      time_nord: r.time_nord,
      passengers,
    };
  });

  result.sort((a, b) => parseTimeNord(a.time_nord) - parseTimeNord(b.time_nord));
  return result;
}
```

- [ ] **Step 2: Add `getNumarareWeekly` to the same file**

Append after `getNumarareDaily`:

```ts
export async function getNumarareWeekly(
  dateFrom: string,
  dateTo: string,
): Promise<NumarareWeeklyRow[]> {
  const session = await verifySession();
  if (!session) throw new Error('Neautorizat');

  const sb = getSupabase();

  // 1. All active interurban routes
  const { data: routes } = await sb
    .from('crm_routes')
    .select('id, dest_to_ro, time_nord')
    .eq('active', true)
    .eq('route_type', 'interurban');

  if (!routes || routes.length === 0) return [];

  // 2. Completed sessions in date range
  const { data: sessions } = await sb
    .from('counting_sessions')
    .select('id, crm_route_id, assignment_date')
    .gte('assignment_date', dateFrom)
    .lte('assignment_date', dateTo)
    .eq('status', 'completed');

  if (!sessions || sessions.length === 0) return [];

  const sessionIds = (sessions as any[]).map((s) => s.id);

  // 3. Get retur stop_order=1 entries
  const { data: entries } = await sb
    .from('counting_entries')
    .select('session_id, total_passengers')
    .in('session_id', sessionIds)
    .eq('direction', 'retur')
    .eq('stop_order', 1);

  const entryBySession = new Map<string, number>();
  for (const e of (entries || []) as any[]) {
    entryBySession.set(e.session_id, e.total_passengers ?? 0);
  }

  // 4. Build session → (route_id, dayOfWeek, passengers)
  const routeMap = new Map<number, any>();
  for (const r of routes as any[]) routeMap.set(r.id, r);

  // Aggregate: key = "routeId|dayOfWeek" → { sum, count }
  const agg = new Map<string, { sum: number; count: number }>();

  for (const s of sessions as any[]) {
    const passengers = entryBySession.get(s.id);
    if (passengers == null) continue;
    if (!routeMap.has(s.crm_route_id)) continue;

    const dt = new Date(s.assignment_date + 'T12:00:00');
    const jsDay = dt.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, 7=Sun

    const key = `${s.crm_route_id}|${isoDay}`;
    const existing = agg.get(key);
    if (existing) {
      existing.sum += passengers;
      existing.count += 1;
    } else {
      agg.set(key, { sum: passengers, count: 1 });
    }
  }

  // 5. Build result
  const result: NumarareWeeklyRow[] = [];
  for (const [key, { sum, count }] of agg) {
    const [routeIdStr, dayStr] = key.split('|');
    const routeId = parseInt(routeIdStr, 10);
    const route = routeMap.get(routeId);
    if (!route) continue;
    result.push({
      crm_route_id: routeId,
      dest_to_ro: route.dest_to_ro,
      time_nord: route.time_nord,
      dayOfWeek: parseInt(dayStr, 10),
      avgPassengers: Math.round((sum / count) * 10) / 10,
    });
  }

  result.sort((a, b) => {
    const ta = parseTimeNord(a.time_nord);
    const tb = parseTimeNord(b.time_nord);
    if (ta !== tb) return ta - tb;
    return a.dayOfWeek - b.dayOfWeek;
  });

  return result;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/ionpop/Desktop/TRANSLUX && npx tsc --noEmit -p apps/admin/tsconfig.json 2>&1 | head -30`

Expected: No errors related to `numarare-report-actions.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/reports/numarare-report-actions.ts
git commit -m "feat(reports): add numarare passenger report server actions

getNumarareDaily returns passenger counts per interurban route for a single date.
getNumarareWeekly returns average passengers per route per day-of-week for a period."
```

---

### Task 2: Frontend — NumarareReportsClient Component

**Files:**
- Create: `apps/admin/src/app/(dashboard)/reports/NumarareReportsClient.tsx`

- [ ] **Step 1: Create `NumarareReportsClient.tsx`**

```tsx
// apps/admin/src/app/(dashboard)/reports/NumarareReportsClient.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { NumarareDailyRow, NumarareWeeklyRow } from './numarare-report-actions';

type ViewMode = 'daily' | 'weekly';

interface Props {
  dailyData: NumarareDailyRow[];
  weeklyData: NumarareWeeklyRow[];
  viewMode: ViewMode;
  date: string;
  dateFrom: string;
  dateTo: string;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

export default function NumarareReportsClient({
  dailyData,
  weeklyData,
  viewMode,
  date,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.push(`/reports?${params.toString()}`);
    },
    [router, searchParams],
  );

  // Daily: simple total
  const dailyTotal = useMemo(() => {
    let sum = 0;
    for (const r of dailyData) {
      if (r.passengers != null) sum += r.passengers;
    }
    return sum;
  }, [dailyData]);

  // Weekly: build pivot { routeKey → { dayOfWeek → avg } }
  const weeklyPivot = useMemo(() => {
    const routeKeys: { crm_route_id: number; dest_to_ro: string; time_nord: string; key: string }[] = [];
    const seen = new Set<string>();
    const cellMap = new Map<string, number>();

    for (const r of weeklyData) {
      const key = `${r.crm_route_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        routeKeys.push({
          crm_route_id: r.crm_route_id,
          dest_to_ro: r.dest_to_ro,
          time_nord: r.time_nord,
          key,
        });
      }
      cellMap.set(`${key}|${r.dayOfWeek}`, r.avgPassengers);
    }

    // Sort by time_nord
    const parseT = (t: string) => {
      const m = t?.match(/(\d{1,2}):(\d{2})/);
      if (!m) return 9999;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    routeKeys.sort((a, b) => parseT(a.time_nord) - parseT(b.time_nord));

    return { routeKeys, cellMap };
  }, [weeklyData]);

  // Weekly: column totals + row averages
  const weeklyColumnTotals = useMemo(() => {
    const totals: (number | null)[] = [];
    for (let d = 1; d <= 7; d++) {
      let sum = 0;
      let has = false;
      for (const rk of weeklyPivot.routeKeys) {
        const v = weeklyPivot.cellMap.get(`${rk.key}|${d}`);
        if (v != null) {
          sum += v;
          has = true;
        }
      }
      totals.push(has ? Math.round(sum * 10) / 10 : null);
    }
    return totals;
  }, [weeklyPivot]);

  const weeklyRowAverages = useMemo(() => {
    const avgs = new Map<string, number | null>();
    for (const rk of weeklyPivot.routeKeys) {
      let sum = 0;
      let count = 0;
      for (let d = 1; d <= 7; d++) {
        const v = weeklyPivot.cellMap.get(`${rk.key}|${d}`);
        if (v != null) {
          sum += v;
          count++;
        }
      }
      avgs.set(rk.key, count > 0 ? Math.round((sum / count) * 10) / 10 : null);
    }
    return avgs;
  }, [weeklyPivot]);

  function handleExportCSV() {
    if (viewMode === 'daily') {
      const header = 'Ruta,Ora,Pasageri';
      const lines = dailyData.map((r) =>
        `"${r.dest_to_ro}",${r.time_nord},${r.passengers ?? ''}`
      );
      const totalLine = `Total,,${dailyTotal}`;
      downloadCSV([header, ...lines, totalLine].join('\n'), `numarare-${date}.csv`);
    } else {
      const header = ['Ruta', 'Ora', ...DAY_NAMES, 'Media'].join(',');
      const lines = weeklyPivot.routeKeys.map((rk) => {
        const days = Array.from({ length: 7 }, (_, i) => {
          const v = weeklyPivot.cellMap.get(`${rk.key}|${i + 1}`);
          return v != null ? v.toFixed(1) : '';
        });
        const avg = weeklyRowAverages.get(rk.key);
        return [`"${rk.dest_to_ro}"`, rk.time_nord, ...days, avg != null ? avg.toFixed(1) : ''].join(',');
      });
      const totalLine = ['Total', '', ...weeklyColumnTotals.map((t) => t != null ? t.toFixed(1) : ''), ''].join(',');
      downloadCSV([header, ...lines, totalLine].join('\n'), `numarare-${dateFrom}_${dateTo}.csv`);
    }
  }

  function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1>Raport numărare pasageri</h1>
        <button onClick={handleExportCSV} className="btn btn-outline">
          Exportă CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'smm' })}
            >
              SMM
            </button>
            <button className="mode-btn mode-btn-active">Numărare</button>
          </div>
          <div className="mode-toggle" style={{ marginLeft: 8 }}>
            <button
              className={`mode-btn${viewMode === 'daily' ? ' mode-btn-active' : ''}`}
              onClick={() => {
                const today = toDateStr(new Date());
                updateParams({ view: 'daily', date: today });
              }}
            >
              Zilnic
            </button>
            <button
              className={`mode-btn${viewMode === 'weekly' ? ' mode-btn-active' : ''}`}
              onClick={() => {
                updateParams({ view: 'weekly' });
              }}
            >
              Săptămânal
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
          {viewMode === 'daily' ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => updateParams({ date: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>De la</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateParams({ dateFrom: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Până la</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => updateParams({ dateTo: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      {viewMode === 'daily' && (
        <div className="grid-3 mb-4">
          <div className="card summary-card">
            <div className="value">{dailyTotal}</div>
            <div className="label">Total pasageri</div>
          </div>
          <div className="card summary-card">
            <div className="value">{dailyData.filter((r) => r.passengers != null).length}</div>
            <div className="label">Rute cu date</div>
          </div>
          <div className="card summary-card">
            <div className="value">
              {(() => {
                const withData = dailyData.filter((r) => r.passengers != null);
                return withData.length > 0 ? Math.round((dailyTotal / withData.length) * 10) / 10 : 0;
              })()}
            </div>
            <div className="label">Media / rută</div>
          </div>
        </div>
      )}

      {/* Table */}
      {viewMode === 'daily' ? (
        <div className="card pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky pivot-sticky-time">Ruta</th>
                <th className="pivot-date-col">Ora</th>
                <th className="pivot-date-col">Pasageri</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((r) => (
                <tr key={r.crm_route_id}>
                  <td className="pivot-time pivot-sticky pivot-sticky-time">{r.dest_to_ro}</td>
                  <td className="pivot-cell">{r.time_nord}</td>
                  <td className={`pivot-cell${r.passengers == null ? ' pivot-empty' : ''}`}>
                    {r.passengers != null ? r.passengers : '—'}
                  </td>
                </tr>
              ))}
              {dailyData.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted" style={{ padding: 24 }}>
                    Nu există rute interurbane active.
                  </td>
                </tr>
              )}
            </tbody>
            {dailyData.length > 0 && (
              <tfoot>
                <tr className="pivot-total-row">
                  <td className="pivot-sticky pivot-total-label">Total</td>
                  <td className="pivot-cell pivot-total-cell" />
                  <td className="pivot-cell pivot-total-cell">{dailyTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="card pivot-wrap">
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky pivot-sticky-time">Ruta</th>
                <th className="pivot-date-col">Ora</th>
                {DAY_NAMES.map((d) => (
                  <th key={d} className="pivot-date-col">{d}</th>
                ))}
                <th className="pivot-date-col">Media</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPivot.routeKeys.map((rk) => (
                <tr key={rk.crm_route_id}>
                  <td className="pivot-time pivot-sticky pivot-sticky-time">{rk.dest_to_ro}</td>
                  <td className="pivot-cell">{rk.time_nord}</td>
                  {Array.from({ length: 7 }, (_, i) => {
                    const v = weeklyPivot.cellMap.get(`${rk.key}|${i + 1}`);
                    return (
                      <td key={i} className={`pivot-cell${v == null ? ' pivot-empty' : ''}`}>
                        {v != null ? v.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className={`pivot-cell${weeklyRowAverages.get(rk.key) == null ? ' pivot-empty' : ''}`}>
                    {weeklyRowAverages.get(rk.key) != null
                      ? weeklyRowAverages.get(rk.key)!.toFixed(1)
                      : '—'}
                  </td>
                </tr>
              ))}
              {weeklyPivot.routeKeys.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-muted" style={{ padding: 24 }}>
                    Nu există date pentru perioada selectată.
                  </td>
                </tr>
              )}
            </tbody>
            {weeklyPivot.routeKeys.length > 0 && (
              <tfoot>
                <tr className="pivot-total-row">
                  <td className="pivot-sticky pivot-total-label">Total</td>
                  <td className="pivot-cell pivot-total-cell" />
                  {weeklyColumnTotals.map((t, i) => (
                    <td key={i} className="pivot-cell pivot-total-cell">
                      {t != null ? t.toFixed(1) : '—'}
                    </td>
                  ))}
                  <td className="pivot-cell pivot-total-cell" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/ionpop/Desktop/TRANSLUX && npx tsc --noEmit -p apps/admin/tsconfig.json 2>&1 | head -30`

Expected: No errors related to `NumarareReportsClient.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/reports/NumarareReportsClient.tsx
git commit -m "feat(reports): add NumarareReportsClient component

Daily mode: single date, table with route/time/passengers.
Weekly mode: period, pivot table with avg passengers per day of week."
```

---

### Task 3: Integration — Wire into page.tsx and add toggle buttons

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/reports/page.tsx`
- Modify: `apps/admin/src/app/(dashboard)/reports/ReportsClient.tsx`
- Modify: `apps/admin/src/app/(dashboard)/reports/SmmReportsClient.tsx`

- [ ] **Step 1: Update `page.tsx` to handle `reportType=numarare`**

In `apps/admin/src/app/(dashboard)/reports/page.tsx`, add the import at the top (after existing imports):

```ts
import { getNumarareDaily, getNumarareWeekly } from './numarare-report-actions';
import NumarareReportsClient from './NumarareReportsClient';
```

Change the `reportType` type on line 64 from:

```ts
  const reportType = (params.reportType as 'transport' | 'smm') || 'transport';
```

to:

```ts
  const reportType = (params.reportType as 'transport' | 'smm' | 'numarare') || 'transport';
```

Add a new branch after the `if (reportType === 'smm')` block (after line 75) and before the Transport pivot data fetch:

```ts
  if (reportType === 'numarare') {
    const numarareView = (params.view as 'daily' | 'weekly') || 'daily';
    const numarareDate = params.date || toDateStr(new Date());
    const [numarareDaily, numarareWeekly] = await Promise.all([
      numarareView === 'daily' ? getNumarareDaily(numarareDate) : Promise.resolve([]),
      numarareView === 'weekly' ? getNumarareWeekly(dateFrom, dateTo) : Promise.resolve([]),
    ]);
    return (
      <NumarareReportsClient
        dailyData={numarareDaily}
        weeklyData={numarareWeekly}
        viewMode={numarareView}
        date={numarareDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    );
  }
```

- [ ] **Step 2: Add Numărare button in `ReportsClient.tsx`**

In `apps/admin/src/app/(dashboard)/reports/ReportsClient.tsx`, find the mode-toggle div (around line 424):

```tsx
          <div className="mode-toggle">
            <button className="mode-btn mode-btn-active">Transport</button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'smm' })}
            >
              SMM
            </button>
          </div>
```

Replace with:

```tsx
          <div className="mode-toggle">
            <button className="mode-btn mode-btn-active">Transport</button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'smm' })}
            >
              SMM
            </button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'numarare' })}
            >
              Numărare
            </button>
          </div>
```

- [ ] **Step 3: Add Numărare button in `SmmReportsClient.tsx`**

In `apps/admin/src/app/(dashboard)/reports/SmmReportsClient.tsx`, find the mode-toggle div (around line 284):

```tsx
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button className="mode-btn mode-btn-active">SMM</button>
          </div>
```

Replace with:

```tsx
          <div className="mode-toggle">
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: '' })}
            >
              Transport
            </button>
            <button className="mode-btn mode-btn-active">SMM</button>
            <button
              className="mode-btn"
              onClick={() => updateParams({ reportType: 'numarare' })}
            >
              Numărare
            </button>
          </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/ionpop/Desktop/TRANSLUX && npx tsc --noEmit -p apps/admin/tsconfig.json 2>&1 | head -30`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/reports/page.tsx apps/admin/src/app/\(dashboard\)/reports/ReportsClient.tsx apps/admin/src/app/\(dashboard\)/reports/SmmReportsClient.tsx
git commit -m "feat(reports): integrate Numărare tab into reports page

Add reportType=numarare routing in page.tsx.
Add Numărare button to Transport and SMM toggle bars."
```

---

### Task 4: Manual Testing and Verification

- [ ] **Step 1: Start dev server**

Run: `cd /Users/ionpop/Desktop/TRANSLUX/apps/admin && npm run dev`

- [ ] **Step 2: Test daily mode**

Navigate to: `/reports?reportType=numarare&view=daily&date=2026-05-17`
(Use a date that has completed counting sessions.)

Verify:
- Mode toggle shows Transport / SMM / **Numărare** (Numărare active)
- View toggle shows **Zilnic** / Săptămânal (Zilnic active)
- Date picker shows selected date
- Table shows interurban routes with passengers or "—"
- Total row sums correctly
- Summary cards display

- [ ] **Step 3: Test weekly mode**

Navigate to: `/reports?reportType=numarare&view=weekly&dateFrom=2026-05-01&dateTo=2026-05-18`

Verify:
- View toggle shows Zilnic / **Săptămânal** (Săptămânal active)
- Period pickers show from/to dates
- Table shows routes × days of week (Lun–Dum) with averages
- Media column shows per-route average
- Total row shows column totals

- [ ] **Step 4: Test navigation between tabs**

Click Transport → verify Transport report loads.
Click SMM → verify SMM report loads.
Click Numărare → verify Numărare report loads.

- [ ] **Step 5: Test CSV export**

Click "Exportă CSV" in both daily and weekly modes. Verify downloaded files contain correct data.

- [ ] **Step 6: Test empty state**

Navigate to a date with no data (e.g., a future date). Verify "—" shows for all routes in daily mode, and empty-state message in weekly mode.
