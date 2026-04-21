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
function shortRouteName(fullName: string, time?: string): string {
  // Strip "Chișinău - " prefix and collapse whitespace
  const stripped = fullName
    .replace(/^Chișinău\s*[-–]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const time0 = time?.split(' - ')[0]?.trim() || '';
  return time0 ? `${stripped} ${time0}` : stripped;
}

// --- 2D matrix of routes: X=avg_revenue_per_session, Y=load_factor_pct ---
function RouteMatrix({ routes, onRouteClick }: { routes: RouteScorecardRow[]; onRouteClick?: (id: number) => void }) {
  if (routes.length === 0) return <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>;

  const maxAvgRev = Math.max(...routes.map(r => r.avg_revenue_per_session), 1);
  // Round to nice number for axis
  const axisMax = Math.ceil(maxAvgRev / 500) * 500;

  return (
    <div style={{ position: 'relative', height: 480, display: 'grid', gridTemplateColumns: '60px 1fr', gridTemplateRows: '1fr 40px', gap: 0 }}>
      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#888', fontWeight: 500 }}>
        Încărcare medie (%)
      </div>

      <div style={{ position: 'relative', borderLeft: '2px solid #333', borderBottom: '2px solid #333' }}>
        {/* Quadrants */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '50%', background: QUADRANT_META.efficient_small.bg, borderRight: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: 12 }}>
          <div style={{ fontSize: 11, color: QUADRANT_META.efficient_small.color, fontWeight: 700, textTransform: 'uppercase' }}>
            {QUADRANT_META.efficient_small.emoji} {QUADRANT_META.efficient_small.label}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Venit/zi mic, dar plin</div>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: '50%', height: '50%', background: QUADRANT_META.star.bg, borderBottom: '1px dashed #ccc', padding: 12 }}>
          <div style={{ fontSize: 11, color: QUADRANT_META.star.color, fontWeight: 700, textTransform: 'uppercase' }}>
            {QUADRANT_META.star.emoji} {QUADRANT_META.star.label}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Venit/zi mare + plin</div>
        </div>
        <div style={{ position: 'absolute', left: 0, top: '50%', width: '50%', height: '50%', background: QUADRANT_META.candidate_to_close.bg, borderRight: '1px dashed #ccc', padding: 12 }}>
          <div style={{ fontSize: 11, color: QUADRANT_META.candidate_to_close.color, fontWeight: 700, textTransform: 'uppercase' }}>
            {QUADRANT_META.candidate_to_close.emoji} {QUADRANT_META.candidate_to_close.label}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Venit/zi mic + gol</div>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '50%', height: '50%', background: QUADRANT_META.underperform_large.bg, padding: 12 }}>
          <div style={{ fontSize: 11, color: QUADRANT_META.underperform_large.color, fontWeight: 700, textTransform: 'uppercase' }}>
            {QUADRANT_META.underperform_large.emoji} {QUADRANT_META.underperform_large.label}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Venit/zi mare, dar gol</div>
        </div>

        {/* Points with labels */}
        {routes.map((r, idx) => {
          const load = r.avg_load_factor_pct ?? 0;
          const xPct = (r.avg_revenue_per_session / axisMax) * 100;
          const yPct = Math.min(load, 100);
          const meta = QUADRANT_META[r.quadrant];
          const size = 11;
          const label = shortRouteName(r.route_name, r.time_chisinau);
          // Alternate label placement above/below to reduce overlap
          const labelAbove = idx % 2 === 0;
          return (
            <div key={r.crm_route_id}
              onClick={() => onRouteClick?.(r.crm_route_id)}
              title={`${r.route_name} ${r.time_chisinau?.split(' - ')[0] || ''} — Venit/zi: ${r.avg_revenue_per_session.toLocaleString('ro-RO')} lei · Încărcare: ${load.toFixed(0)}% · Curse: ${r.sessions_count}`}
              style={{
                position: 'absolute',
                left: `${Math.min(xPct, 99)}%`,
                bottom: `${yPct}%`,
                transform: 'translate(-50%, 50%)',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <div style={{
                width: size, height: size,
                background: meta.color,
                border: '2px solid #fff',
                borderRadius: '50%',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }} />
              <div style={{
                position: 'absolute',
                left: '50%',
                [labelAbove ? 'bottom' : 'top']: size + 2,
                transform: 'translateX(-50%)',
                fontSize: 10,
                fontWeight: 600,
                color: meta.color,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
              }}>
                {label}
              </div>
            </div>
          );
        })}

        {/* Y ticks */}
        <div style={{ position: 'absolute', left: -30, top: 0, fontSize: 10, color: '#888' }}>100%</div>
        <div style={{ position: 'absolute', left: -30, top: '50%', fontSize: 10, color: '#888' }}>50%</div>
        <div style={{ position: 'absolute', left: -15, bottom: -5, fontSize: 10, color: '#888' }}>0</div>
      </div>

      <div />
      <div style={{ textAlign: 'center', paddingTop: 8, fontSize: 12, color: '#888', fontWeight: 500 }}>
        Venit mediu pe zi — tur+retur (lei) → max {axisMax.toLocaleString('ro-RO')}
      </div>
    </div>
  );
}

export default function OverviewTab({ kpi, routes, drivers, onRouteClick, onDriverClick }: Props) {
  const [sortBy, setSortBy] = useState<'quality' | 'money'>('quality');

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
        <RouteMatrix routes={routes} onRouteClick={onRouteClick} />
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
