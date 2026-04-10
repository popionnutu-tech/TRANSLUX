'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DailyCount, RouteCount, DeviceCount, CountryCount } from './actions';
import {
  getPageViewsPerDay,
  getSearchesPerDay,
  getTopSearchedRoutes,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTotalStats,
} from './actions';

interface Props {
  initialPageViews: DailyCount[];
  initialSearches: DailyCount[];
  initialTopRoutes: RouteCount[];
  initialDevices: DeviceCount[];
  initialCountries: CountryCount[];
  initialTotals: { totalViews: number; totalSearches: number };
  initialDays: number;
}

// --- Line Chart (SVG, same pattern as PassengersChart) ---

function LineChart({ data, color = '#9B1B30', label }: { data: DailyCount[]; color?: string; label: string }) {
  if (data.length === 0) return <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>;

  const W = 700;
  const H = 180;
  const P = { t: 15, r: 20, b: 40, l: 50 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const vals = data.map(d => d.count);
  const maxRaw = Math.max(...vals, 1);
  const niceMax = Math.ceil((maxRaw * 1.15) / 10) * 10 || 10;

  const n = data.length;
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const toX = (i: number) => P.l + (n > 1 ? i * xStep : plotW / 2);
  const toY = (v: number) => P.t + plotH - (v / niceMax) * plotH;

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.count).toFixed(1)}`).join(' ');
  const areaPath = n > 1
    ? path + ` L${toX(n - 1).toFixed(1)},${(P.t + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(P.t + plotH).toFixed(1)} Z`
    : '';

  const yTicks = 5;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round((niceMax / yTicks) * i);
    return { val, y: toY(val) };
  });

  const showEvery = Math.max(1, Math.ceil(n / 12));

  function fmtDate(d: string) {
    const [, m, day] = d.split('-');
    return `${day}.${m}`;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 16, height: 3, background: color, borderRadius: 2, display: 'inline-block' }} />
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id={`area-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map(({ val, y }) => (
          <g key={val}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eee" strokeWidth="1" />
            <text x={P.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#aaa">{val}</text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill={`url(#area-${label})`} />}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.count)} r="3" fill={color} />
        ))}

        {data.map((d, i) => {
          if (n > 1 && i % showEvery !== 0 && i !== n - 1) return null;
          return (
            <text key={`x${i}`} x={toX(i)} y={H - P.b + 16} textAnchor="middle" fontSize="10" fill="#aaa">
              {fmtDate(d.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// --- Device labels ---
const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
  unknown: 'Necunoscut',
};

// --- Country flag emoji ---
function countryFlag(code: string): string {
  if (!code || code === '??' || code.length !== 2) return '';
  const offset = 0x1F1E6 - 65;
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

// --- Main component ---

export default function AnalyticsClient({
  initialPageViews,
  initialSearches,
  initialTopRoutes,
  initialDevices,
  initialCountries,
  initialTotals,
  initialDays,
}: Props) {
  const [days, setDays] = useState(initialDays);
  const [pageViews, setPageViews] = useState(initialPageViews);
  const [searches, setSearches] = useState(initialSearches);
  const [topRoutes, setTopRoutes] = useState(initialTopRoutes);
  const [devices, setDevices] = useState(initialDevices);
  const [countries, setCountries] = useState(initialCountries);
  const [totals, setTotals] = useState(initialTotals);
  const [isPending, startTransition] = useTransition();

  function handlePeriodChange(newDays: number) {
    setDays(newDays);
    startTransition(async () => {
      const [pv, sr, tr, dv, ct, tt] = await Promise.all([
        getPageViewsPerDay(newDays),
        getSearchesPerDay(newDays),
        getTopSearchedRoutes(newDays),
        getDeviceBreakdown(newDays),
        getCountryBreakdown(newDays),
        getTotalStats(newDays),
      ]);
      setPageViews(pv);
      setSearches(sr);
      setTopRoutes(tr);
      setDevices(dv);
      setCountries(ct);
      setTotals(tt);
    });
  }

  const totalDevices = devices.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1>Analitică Site</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              className={`btn ${days === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handlePeriodChange(d)}
              disabled={isPending}
              style={{ fontSize: 13, padding: '6px 14px' }}
            >
              {d}z
            </button>
          ))}
        </div>
      </div>

      {isPending && <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>Se incarca...</div>}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#9B1B30' }}>{totals.totalViews.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Vizite ({days}z)</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#2563eb' }}>{totals.totalSearches.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Cautari ({days}z)</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#059669' }}>
            {pageViews.length > 0 ? Math.round(totals.totalViews / pageViews.length) : 0}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Medie/zi</div>
        </div>
      </div>

      {/* Page views chart */}
      <div className="card mb-4" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Vizite pe zi</h3>
        <LineChart data={pageViews} color="#9B1B30" label="Vizite" />
      </div>

      {/* Searches chart */}
      <div className="card mb-4" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Cautari pe zi</h3>
        <LineChart data={searches} color="#2563eb" label="Cautari" />
      </div>

      {/* Bottom grid: routes, devices, countries */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>

        {/* Top routes */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Top rute cautate</h3>
          {topRoutes.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Cautari</th>
                </tr>
              </thead>
              <tbody>
                {topRoutes.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', fontSize: 14, borderBottom: '1px solid #f5f5f5' }}>
                      {r.from_locality} &rarr; {r.to_locality}
                    </td>
                    <td style={{ padding: '8px', fontSize: 14, textAlign: 'right', fontWeight: 600, color: '#2563eb', borderBottom: '1px solid #f5f5f5' }}>
                      {r.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Devices */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Dispozitive</h3>
          {devices.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {devices.map(d => {
                const pct = Math.round((d.count / totalDevices) * 100);
                return (
                  <div key={d.device}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{DEVICE_LABELS[d.device] || d.device}</span>
                      <span style={{ fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0' }}>
                      <div style={{
                        height: '100%',
                        borderRadius: 3,
                        width: `${pct}%`,
                        background: d.device === 'mobile' ? '#9B1B30' : d.device === 'desktop' ? '#2563eb' : '#059669',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Countries */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Tari</h3>
          {countries.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {countries.map(c => (
                <div key={c.country} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                  <span>{countryFlag(c.country)} {c.country}</span>
                  <span style={{ fontWeight: 600, color: '#555' }}>{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
