'use client';

import { useState } from 'react';
import type { OverviewKPI, RouteScorecardRow, DriverScorecardRow, RouteQuadrant } from './sales-actions';

interface Props {
  kpi: OverviewKPI;
  routes: RouteScorecardRow[];
  drivers: DriverScorecardRow[];
  onRouteClick?: (crmRouteId: number) => void;
  onDriverClick?: (driverId: string) => void;
}

const QUADRANT_META: Record<RouteQuadrant, { label: string; color: string; bg: string; emoji: string }> = {
  star: { label: 'Stele', color: '#059669', bg: 'rgba(5,150,105,0.09)', emoji: '⭐' },
  efficient_small: { label: 'Mici eficiente', color: '#2563eb', bg: 'rgba(37,99,235,0.07)', emoji: '💎' },
  underperform_large: { label: 'De optimizat', color: '#d97706', bg: 'rgba(217,119,6,0.09)', emoji: '⚠️' },
  candidate_to_close: { label: 'De închis', color: '#dc2626', bg: 'rgba(220,38,38,0.07)', emoji: '❌' },
};

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span style={{ fontSize: 12, color: '#888' }}>—</span>;
  if (Math.abs(value) < 0.5) return <span style={{ fontSize: 12, color: '#888' }}>— stabil</span>;
  const up = value > 0;
  return (
    <span style={{ fontSize: 12, color: up ? '#059669' : '#dc2626' }}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'k';
  return n.toLocaleString('ro-RO');
}

function loadColor(pct: number | null): string {
  if (pct === null) return '#888';
  if (pct >= 65) return '#059669';
  if (pct >= 40) return '#d97706';
  return '#dc2626';
}

function pctVsNormColor(pct: number | null): { color: string; bg: string } {
  if (pct === null) return { color: '#888', bg: 'rgba(156,163,175,0.15)' };
  if (pct >= 10) return { color: '#065f46', bg: 'rgba(5,150,105,0.18)' };
  if (pct >= 0) return { color: '#065f46', bg: 'rgba(5,150,105,0.10)' };
  if (pct >= -10) return { color: '#92400e', bg: 'rgba(217,119,6,0.18)' };
  return { color: '#991b1b', bg: 'rgba(220,38,38,0.22)' };
}

function rpkColor(rpk: number | null, median: number): string {
  if (rpk === null) return '#888';
  if (rpk >= median * 1.1) return '#059669';
  if (rpk >= median * 0.9) return '#333';
  return '#dc2626';
}

// --- Short route name helper for labels ---
// Accepts already-parsed "HH:MM" strings (departure_time_chisinau, return_time_nord)
// from getRouteScorecard, which handles the daily_assignments.retur_route_id swap.
function shortRouteName(fullName: string, departureTimeChisinau: string, returnTimeNord: string): string {
  const stripped = fullName
    .replace(/^Chișinău\s*[-–]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dep = departureTimeChisinau?.trim() || '';
  const ret = returnTimeNord?.trim() || '';
  if (dep && ret) return `${stripped} ${dep} (${ret})`;
  if (dep) return `${stripped} ${dep}`;
  return stripped;
}

function fmtLei(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

// --- 2D matrix: numbered points + side legend ---
function RouteMatrix({
  routes,
  onRouteClick,
  hoveredId,
  setHoveredId,
}: {
  routes: RouteScorecardRow[];
  onRouteClick?: (id: number) => void;
  hoveredId: number | null;
  setHoveredId: (id: number | null) => void;
}) {
  if (routes.length === 0) return <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>;

  // X-axis: stretch to actual data range (not 0..max) so left side isn't wasted
  const revenues = routes.map(r => r.avg_revenue_per_session);
  const maxAvgRev = Math.max(...revenues);
  const minAvgRev = Math.min(...revenues);
  // Symmetric padding around the data range so points don't touch edges
  const span = Math.max(maxAvgRev - minAvgRev, 1);
  const pad = Math.max(span * 0.08, 200);
  const axisMin = Math.max(0, Math.floor((minAvgRev - pad) / 500) * 500);
  const axisMax = Math.ceil((maxAvgRev + pad) / 500) * 500;
  const axisRange = axisMax - axisMin || 1;

  // Median revenue = where the vertical split line sits
  const sortedRev = [...revenues].sort((a, b) => a - b);
  const medianRev = sortedRev[Math.floor(sortedRev.length / 2)] ?? axisMin;
  const medianXPct = ((medianRev - axisMin) / axisRange) * 100;

  // Y-axis: stretch to actual load-factor data range too
  const loads = routes.map(r => r.avg_load_factor_pct ?? 0).filter(v => v > 0);
  const maxLoad = loads.length > 0 ? Math.max(...loads) : 100;
  const minLoad = loads.length > 0 ? Math.min(...loads) : 0;
  const loadSpan = Math.max(maxLoad - minLoad, 1);
  const loadPad = Math.max(loadSpan * 0.10, 3);
  const yAxisMin = Math.max(0, Math.floor((minLoad - loadPad) / 5) * 5);
  const yAxisMax = Math.min(100, Math.ceil((maxLoad + loadPad) / 5) * 5);
  const yAxisRange = yAxisMax - yAxisMin || 1;
  // Horizontal quadrant split stays at 50% load (semantic boundary, not geometric)
  const loadSplit = 50;
  const loadSplitYPct = ((loadSplit - yAxisMin) / yAxisRange) * 100;

  // X tick positions — 5 evenly spaced values from axisMin to axisMax
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((axisMin + f * axisRange) / 100) * 100);
  // Y ticks — 5 evenly spaced values
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(yAxisMin + f * yAxisRange));

  // Routes sorted by revenue descending — numbering
  const numbered = routes.map((r, i) => ({ ...r, num: i + 1 }));

  // Position helpers
  const xPosPct = (val: number) => ((val - axisMin) / axisRange) * 100;
  const yPosPct = (val: number) => ((val - yAxisMin) / yAxisRange) * 100;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
      {/* Chart */}
      <div style={{ position: 'relative', height: 460, display: 'grid', gridTemplateColumns: '44px 1fr', gridTemplateRows: '1fr 44px', gap: 0 }}>
        {/* Y-axis label */}
        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          Încărcare medie
        </div>

        {/* Plot area */}
        <div style={{ position: 'relative', borderLeft: '1.5px solid #333', borderBottom: '1.5px solid #333' }}>
          {/* Gridlines (horizontal) */}
          {yTicks.map((t, i) => {
            const pct = (i / (yTicks.length - 1)) * 100;
            return (
              <div key={`gy-${i}`} style={{
                position: 'absolute', left: 0, right: 0, bottom: `${pct}%`,
                borderTop: i === 0 ? 'none' : '1px dashed #eee',
              }} />
            );
          })}
          {/* Load 50% split line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: `${loadSplitYPct}%`,
            borderTop: '1px dashed #bbb',
          }} />
          {/* Gridlines (vertical, at x-ticks) */}
          {xTicks.map((val, i) => {
            const pct = xPosPct(val);
            return (
              <div key={`gx-${i}`} style={{
                position: 'absolute', top: 0, bottom: 0, left: `${pct}%`,
                borderLeft: i === 0 ? 'none' : '1px dashed #eee',
              }} />
            );
          })}
          {/* Median split line (vertical) */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: `${medianXPct}%`,
            borderLeft: '1px dashed #bbb',
          }} />

          {/* Quadrant backgrounds (split at median X and 50% Y load) */}
          {/* Note: Y uses bottom-origin. loadSplitYPct% from bottom = (100 - loadSplitYPct)% from top */}
          <div style={{ position: 'absolute', left: 0, top: 0, width: `${medianXPct}%`, height: `${100 - loadSplitYPct}%`, background: QUADRANT_META.efficient_small.bg }} />
          <div style={{ position: 'absolute', left: `${medianXPct}%`, top: 0, right: 0, height: `${100 - loadSplitYPct}%`, background: QUADRANT_META.star.bg }} />
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: `${medianXPct}%`, height: `${loadSplitYPct}%`, background: QUADRANT_META.candidate_to_close.bg }} />
          <div style={{ position: 'absolute', left: `${medianXPct}%`, bottom: 0, right: 0, height: `${loadSplitYPct}%`, background: QUADRANT_META.underperform_large.bg }} />

          {/* Quadrant labels (corners) */}
          <div style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, color: QUADRANT_META.efficient_small.color, fontWeight: 700, letterSpacing: 0.3 }}>
            {QUADRANT_META.efficient_small.emoji} MICI EFICIENTE
          </div>
          <div style={{ position: 'absolute', right: 8, top: 8, fontSize: 10, color: QUADRANT_META.star.color, fontWeight: 700, letterSpacing: 0.3, textAlign: 'right' }}>
            STELE {QUADRANT_META.star.emoji}
          </div>
          <div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10, color: QUADRANT_META.candidate_to_close.color, fontWeight: 700, letterSpacing: 0.3 }}>
            {QUADRANT_META.candidate_to_close.emoji} DE ÎNCHIS
          </div>
          <div style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 10, color: QUADRANT_META.underperform_large.color, fontWeight: 700, letterSpacing: 0.3, textAlign: 'right' }}>
            DE OPTIMIZAT {QUADRANT_META.underperform_large.emoji}
          </div>

          {/* Y-axis tick labels */}
          {yTicks.map((t, i) => {
            const pct = (i / (yTicks.length - 1)) * 100;
            return (
              <div key={`ty-${i}`} style={{
                position: 'absolute', left: -38, bottom: `${pct}%`,
                transform: 'translateY(50%)',
                fontSize: 10, color: '#888', width: 32, textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {t}%
              </div>
            );
          })}

          {/* Points */}
          {numbered.map(r => {
            const load = r.avg_load_factor_pct ?? 0;
            const xPct = xPosPct(r.avg_revenue_per_session);
            const yPct = Math.max(0, Math.min(yPosPct(load), 100));
            const meta = QUADRANT_META[r.quadrant];
            const isHovered = hoveredId === r.crm_route_id;
            const size = isHovered ? 26 : 22;
            return (
              <div key={r.crm_route_id}
                onClick={() => onRouteClick?.(r.crm_route_id)}
                onMouseEnter={() => setHoveredId(r.crm_route_id)}
                onMouseLeave={() => setHoveredId(null)}
                title={`${r.route_name} ${r.time_chisinau?.split(' - ')[0] || ''}\nVenit/zi: ${r.avg_revenue_per_session.toLocaleString('ro-RO')} lei\nÎncărcare: ${load.toFixed(0)}%\nCurse: ${r.sessions_count}`}
                style={{
                  position: 'absolute',
                  left: `${Math.min(xPct, 99)}%`,
                  bottom: `${yPct}%`,
                  transform: 'translate(-50%, 50%)',
                  width: size, height: size,
                  background: meta.color,
                  border: isHovered ? '3px solid #fff' : '2px solid #fff',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  boxShadow: isHovered ? `0 0 0 3px ${meta.color}, 0 4px 12px rgba(0,0,0,0.25)` : '0 2px 6px rgba(0,0,0,0.2)',
                  zIndex: isHovered ? 10 : 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  transition: 'all 0.12s ease',
                }}
              >
                {r.num}
              </div>
            );
          })}
        </div>

        {/* Spacer bottom-left */}
        <div />

        {/* X-axis with tick labels */}
        <div style={{ position: 'relative', paddingTop: 6 }}>
          {xTicks.map((val, i) => {
            const pct = xPosPct(val);
            return (
              <div key={`tx-${i}`} style={{
                position: 'absolute', left: `${pct}%`, top: 6,
                transform: i === 0 ? 'translateX(0)' : i === xTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                fontSize: 10, color: '#888', fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtLei(val)}
              </div>
            );
          })}
          {/* Median tick marker */}
          <div style={{
            position: 'absolute', left: `${medianXPct}%`, top: 6,
            transform: 'translateX(-50%)',
            fontSize: 9, color: '#9B1B30', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}>
            ↑ mediană {fmtLei(medianRev)}
          </div>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 28,
            textAlign: 'center', fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase',
          }}>
            Venit mediu pe cursă — tur+retur (lei)
          </div>
        </div>
      </div>

      {/* Legend (side table) */}
      <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
            <tr>
              <th style={{ padding: '8px 6px', textAlign: 'center', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee', width: 28 }}>#</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee' }}>Rută</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee', fontVariantNumeric: 'tabular-nums' }}>lei/zi</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee', fontVariantNumeric: 'tabular-nums' }}>lei/km</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', color: '#888', fontWeight: 600, borderBottom: '1px solid #eee', fontVariantNumeric: 'tabular-nums' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {numbered.map(r => {
              const meta = QUADRANT_META[r.quadrant];
              const isHovered = hoveredId === r.crm_route_id;
              return (
                <tr key={r.crm_route_id}
                  onClick={() => onRouteClick?.(r.crm_route_id)}
                  onMouseEnter={() => setHoveredId(r.crm_route_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    cursor: 'pointer',
                    background: isHovered ? 'rgba(155,27,48,0.05)' : 'transparent',
                    transition: 'background 0.1s',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                >
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, borderRadius: '50%',
                      background: meta.color, color: '#fff', fontSize: 11, fontWeight: 700,
                      boxShadow: isHovered ? `0 0 0 2px ${meta.color}33` : 'none',
                    }}>
                      {r.num}
                    </div>
                  </td>
                  <td style={{ padding: '6px', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                    {shortRouteName(r.route_name, r.departure_time_chisinau, r.return_time_nord)}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#555', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    {r.avg_revenue_per_session.toLocaleString('ro-RO')}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', color: '#9B1B30', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {r.avg_revenue_per_km !== null ? r.avg_revenue_per_km.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: r.avg_load_factor_pct === null ? '#888' :
                           r.avg_load_factor_pct >= 65 ? '#065f46' :
                           r.avg_load_factor_pct >= 40 ? '#92400e' : '#991b1b',
                  }}>
                    {r.avg_load_factor_pct !== null ? `${r.avg_load_factor_pct.toFixed(0)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OverviewTab({ kpi, routes, drivers, onRouteClick, onDriverClick }: Props) {
  const [sortBy, setSortBy] = useState<'quality' | 'money'>('quality');
  const [hoveredRouteId, setHoveredRouteId] = useState<number | null>(null);

  // Route legend (quadrant breakdown)
  const byQuadrant = routes.reduce((acc, r) => {
    acc[r.quadrant] = (acc[r.quadrant] || 0) + 1;
    return acc;
  }, {} as Record<RouteQuadrant, number>);

  // Driver sorted view
  const sortedDrivers = [...drivers].sort((a, b) => {
    if (sortBy === 'quality') {
      if (a.pct_vs_route_norm === null && b.pct_vs_route_norm === null) return 0;
      if (a.pct_vs_route_norm === null) return 1;
      if (b.pct_vs_route_norm === null) return -1;
      return b.pct_vs_route_norm - a.pct_vs_route_norm;
    } else {
      if (a.avg_revenue_per_km === null && b.avg_revenue_per_km === null) return 0;
      if (a.avg_revenue_per_km === null) return 1;
      if (b.avg_revenue_per_km === null) return -1;
      return b.avg_revenue_per_km - a.avg_revenue_per_km;
    }
  });

  // Median revenue/km across drivers for color coding
  const rpkValues = drivers.filter(d => d.avg_revenue_per_km !== null).map(d => d.avg_revenue_per_km as number).sort((a, b) => a - b);
  const medianRpk = rpkValues.length > 0 ? rpkValues[Math.floor(rpkValues.length / 2)] : 0;

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pasageri reali</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#333' }}>{kpi.total_unique_passengers.toLocaleString('ro-RO')}</div>
          <div style={{ marginTop: 4 }}><Delta value={kpi.delta_passengers_pct} /></div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pasageri×km</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#333' }}>{fmtNum(kpi.total_passenger_km)}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>—</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Venit total</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#9B1B30' }}>
            {kpi.total_revenue.toLocaleString('ro-RO')} <span style={{ fontSize: 14, color: '#888' }}>lei</span>
          </div>
          <div style={{ marginTop: 4 }}><Delta value={kpi.delta_revenue_pct} /></div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Încărcare medie</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: loadColor(kpi.avg_load_factor_pct) }}>
            {kpi.avg_load_factor_pct !== null ? `${kpi.avg_load_factor_pct.toFixed(0)}%` : '—'}
          </div>
          <div style={{ marginTop: 4 }}><Delta value={kpi.delta_load_factor_pct} /></div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Curse efectuate</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#333' }}>{kpi.sessions_count}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>—</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Venit/km</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#333' }}>
            {kpi.avg_revenue_per_km !== null ? kpi.avg_revenue_per_km.toFixed(1) : '—'} <span style={{ fontSize: 14, color: '#888' }}>lei</span>
          </div>
          <div style={{ marginTop: 4 }}><Delta value={kpi.delta_revenue_per_km_pct} /></div>
        </div>
      </div>

      {/* Matrix */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#333', margin: 0 }}>Rute: valoare vs încărcare</h2>
          <div style={{ fontSize: 12, color: '#888' }}>
            {Object.entries(byQuadrant).map(([q, count]) => {
              const meta = QUADRANT_META[q as RouteQuadrant];
              return (
                <span key={q} style={{ marginLeft: 12 }}>
                  <span style={{ color: meta.color }}>{meta.emoji}</span> {count}
                </span>
              );
            })}
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px 0' }}>
          Fiecare rută e poziționată pe două axe: <strong>venit mediu pe zi (tur+retur)</strong> orizontal × <strong>încărcare medie</strong> vertical. Click pe punct pentru detalii.
        </p>
        <RouteMatrix routes={routes} onRouteClick={onRouteClick} hoveredId={hoveredRouteId} setHoveredId={setHoveredRouteId} />
      </div>

      {/* Drivers Table */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#333', margin: 0 }}>Șoferi — evaluare</h2>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              Două metrici principale: calitate (% vs normă) + bani/km. Ambele trebuie să fie verzi pentru un șofer bun.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          <button
            className={`btn ${sortBy === 'quality' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSortBy('quality')}
            style={{ fontSize: 13 }}
          >
            Ordonat după calitate
          </button>
          <button
            className={`btn ${sortBy === 'money' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSortBy('money')}
            style={{ fontSize: 13 }}
          >
            Ordonat după bani/km
          </button>
        </div>

        {sortedDrivers.length === 0 ? (
          <p style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: 32 }}>
            Nu sunt șoferi cu cel puțin 5 curse în perioada selectată.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>ȘOFER</th>
                  <th style={{ textAlign: 'center', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>% FAȚĂ DE NORMĂ</th>
                  <th style={{ textAlign: 'center', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>VENIT/KM</th>
                  <th style={{ textAlign: 'right', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>KM CONDUȘI</th>
                  <th style={{ textAlign: 'right', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>CURSE</th>
                  <th style={{ textAlign: 'right', padding: 10, fontSize: 12, color: '#888', borderBottom: '2px solid #eee', fontWeight: 600 }}>VENIT TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {sortedDrivers.map(d => {
                  const pct = pctVsNormColor(d.pct_vs_route_norm);
                  const rpkCol = rpkColor(d.avg_revenue_per_km, medianRpk);
                  return (
                    <tr key={d.driver_id}
                      onClick={() => onDriverClick?.(d.driver_id)}
                      style={{ cursor: onDriverClick ? 'pointer' : 'default' }}
                      className="driver-row">
                      <td style={{ padding: '12px 10px', fontSize: 14, fontWeight: 600, borderBottom: '1px solid #f5f5f5' }}>
                        {d.driver_name}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', borderBottom: '1px solid #f5f5f5' }}>
                        {d.pct_vs_route_norm !== null ? (
                          <span style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: 10,
                            fontSize: 12, fontWeight: 700,
                            color: pct.color, background: pct.bg,
                          }}>
                            {d.pct_vs_route_norm > 0 ? '+' : ''}{d.pct_vs_route_norm}%
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: 14, fontWeight: 600, color: rpkCol, borderBottom: '1px solid #f5f5f5' }}>
                        {d.avg_revenue_per_km !== null ? `${d.avg_revenue_per_km.toFixed(1)} lei` : '—'}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: 13, color: '#666', borderBottom: '1px solid #f5f5f5' }}>
                        {d.total_km_driven.toLocaleString('ro-RO')}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: 13, color: '#666', borderBottom: '1px solid #f5f5f5' }}>
                        {d.sessions_count}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: 14, color: '#333', fontWeight: 600, borderBottom: '1px solid #f5f5f5' }}>
                        {d.total_revenue.toLocaleString('ro-RO')} lei
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ fontSize: 12, color: '#888', marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee' }}>
          💡 <strong>Cum citești:</strong> &quot;% față de normă&quot; = cât mai mulți pasageri vs media altor șoferi pe aceleași rute. &quot;Venit/km&quot; = câți lei aduce fiecare km. Doar șoferii cu ≥5 curse în perioadă.
        </div>
      </div>

      <style jsx>{`
        .driver-row:hover { background: rgba(155, 27, 48, 0.04); }
      `}</style>
    </div>
  );
}
