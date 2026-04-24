'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { DailyCount, DetailedRoutesResult, DeviceCount, CountryCount } from './actions';
import type { OverviewKPI, RouteScorecardRow, DriverScorecardRow, RouteLoadRow, RouteTypeFilter } from './sales-actions';
import {
  getPageViewsPerDay,
  getSearchesPerDay,
  getTopSearchedRoutesDetailed,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTotalStats,
} from './actions';
import { getOverviewKPI, getRouteScorecard, getDriverScorecard, getRouteLoadHeatmap } from './sales-actions';
import OverviewTab from './OverviewTab';

interface Props {
  initialPageViews: DailyCount[];
  initialSearches: DailyCount[];
  initialDetailedRoutes: DetailedRoutesResult;
  initialDevices: DeviceCount[];
  initialCountries: CountryCount[];
  initialTotals: { totalViews: number; totalSearches: number; totalCalls: number };
  initialDays: number;
  initialOverviewKPI: OverviewKPI;
  initialRouteScorecard: RouteScorecardRow[];
  initialDriverScorecard: DriverScorecardRow[];
  initialRouteLoad: RouteLoadRow[];
}

type Tab = 'overview' | 'site';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'site', label: 'Site' },
];

// --- Multi-Line Chart (SVG) ---

interface Series {
  data: DailyCount[];
  color: string;
  label: string;
}

function MultiLineChart({ series }: { series: Series[] }) {
  const nonEmpty = series.filter(s => s.data.length > 0);
  if (nonEmpty.length === 0) return <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>;

  const W = 700;
  const H = 200;
  const P = { t: 15, r: 20, b: 40, l: 50 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const allVals = nonEmpty.flatMap(s => s.data.map(d => d.count));
  const maxRaw = Math.max(...allVals, 1);
  const niceMax = Math.ceil((maxRaw * 1.15) / 10) * 10 || 10;

  const n = Math.max(...nonEmpty.map(s => s.data.length));
  const xStep = n > 1 ? plotW / (n - 1) : 0;
  const toX = (i: number) => P.l + (n > 1 ? i * xStep : plotW / 2);
  const toY = (v: number) => P.t + plotH - (v / niceMax) * plotH;

  const yTicks = 5;
  const grid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round((niceMax / yTicks) * i);
    return { val, y: toY(val) };
  });

  const showEvery = Math.max(1, Math.ceil(n / 12));
  const xLabels = nonEmpty[0].data;

  function fmtDate(d: string) {
    const [, m, day] = d.split('-');
    return `${day}.${m}`;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16 }}>
        {nonEmpty.map(s => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 3, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          {nonEmpty.map(s => (
            <linearGradient key={s.label} id={`area-${s.label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {grid.map(({ val, y }) => (
          <g key={val}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eee" strokeWidth="1" />
            <text x={P.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#aaa">{val}</text>
          </g>
        ))}

        {nonEmpty.map(s => {
          const sn = s.data.length;
          const path = s.data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(d.count).toFixed(1)}`).join(' ');
          const areaPath = sn > 1
            ? path + ` L${toX(sn - 1).toFixed(1)},${(P.t + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(P.t + plotH).toFixed(1)} Z`
            : '';
          return (
            <g key={s.label}>
              {areaPath && <path d={areaPath} fill={`url(#area-${s.label})`} />}
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.data.map((d, i) => (
                <circle key={i} cx={toX(i)} cy={toY(d.count)} r="3" fill={s.color} />
              ))}
            </g>
          );
        })}

        {xLabels.map((d, i) => {
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

// --- Day-of-week heatmap helpers ---
const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

function heatBg(value: number, max: number): string {
  if (max === 0 || value === 0) return 'transparent';
  const intensity = value / max;
  return `rgba(37, 99, 235, ${(0.08 + intensity * 0.55).toFixed(2)})`;
}

// --- Main component ---

export default function AnalyticsClient({
  initialPageViews,
  initialSearches,
  initialDetailedRoutes,
  initialDevices,
  initialCountries,
  initialTotals,
  initialDays,
  initialOverviewKPI,
  initialRouteScorecard,
  initialDriverScorecard,
  initialRouteLoad,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState(initialDays);
  const [pageViews, setPageViews] = useState(initialPageViews);
  const [searches, setSearches] = useState(initialSearches);
  const [detailedRoutes, setDetailedRoutes] = useState<DetailedRoutesResult>(initialDetailedRoutes);
  const [devices, setDevices] = useState(initialDevices);
  const [countries, setCountries] = useState(initialCountries);
  const [totals, setTotals] = useState(initialTotals);
  const [overviewKPI, setOverviewKPI] = useState(initialOverviewKPI);
  const [routeScorecard, setRouteScorecard] = useState(initialRouteScorecard);
  const [driverScorecard, setDriverScorecard] = useState(initialDriverScorecard);
  const [routeLoad, setRouteLoad] = useState(initialRouteLoad);
  const [routeType, setRouteType] = useState<RouteTypeFilter>('interurban');
  const [isPending, startTransition] = useTransition();

  function refresh(newDays: number, newRouteType: RouteTypeFilter) {
    setDays(newDays);
    setRouteType(newRouteType);
    const dateFrom = new Date(Date.now() - newDays * 86400000).toISOString().slice(0, 10);
    const dateTo = new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      const [pv, sr, dr, dv, ct, tt, kpi, rs, ds, rl] = await Promise.all([
        getPageViewsPerDay(newDays),
        getSearchesPerDay(newDays),
        getTopSearchedRoutesDetailed(newDays),
        getDeviceBreakdown(newDays),
        getCountryBreakdown(newDays),
        getTotalStats(newDays),
        getOverviewKPI(dateFrom, dateTo, newRouteType),
        getRouteScorecard(dateFrom, dateTo, newRouteType),
        getDriverScorecard(dateFrom, dateTo, newRouteType),
        getRouteLoadHeatmap(dateFrom, dateTo, newRouteType),
      ]);
      setPageViews(pv);
      setSearches(sr);
      setDetailedRoutes(dr);
      setDevices(dv);
      setCountries(ct);
      setTotals(tt);
      setOverviewKPI(kpi);
      setRouteScorecard(rs);
      setDriverScorecard(ds);
      setRouteLoad(rl);
    });
  }

  const handlePeriodChange = (newDays: number) => refresh(newDays, routeType);
  const handleRouteTypeChange = (newRouteType: RouteTypeFilter) => refresh(days, newRouteType);

  const totalDevices = devices.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1>Analitică</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/analytics/moneyball"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(79, 70, 229, 0.25)',
            }}
          >
            ⚾ Moneyball
          </Link>
          <div style={{ display: 'flex', gap: 6 }}>
            {[3, 7, 30, 90].map(d => (
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
      </div>

      {/* Tabs */}
      <div className="mode-toggle" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending && <div style={{ color: '#999', fontSize: 13, marginBottom: 12 }}>Se incarca...</div>}

      {/* Tab: Overview (KPI + matrix + drivers) */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {([
              { id: 'interurban', label: 'Interurban' },
              { id: 'suburban', label: 'Suburban' },
            ] as const).map(rt => (
              <button
                key={rt.id}
                className={`btn ${routeType === rt.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleRouteTypeChange(rt.id)}
                disabled={isPending}
                style={{ fontSize: 13, padding: '6px 14px' }}
              >
                {rt.label}
              </button>
            ))}
          </div>
          <OverviewTab
            kpi={overviewKPI}
            routes={routeScorecard}
            drivers={driverScorecard}
            routeLoad={routeLoad}
          />
        </>
      )}

      {/* Tab: Site (original analytics) */}
      {tab === 'site' && (
        <>
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
              <div style={{ fontSize: 32, fontWeight: 700, color: '#059669' }}>{totals.totalCalls.toLocaleString()}</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Apeluri ({days}z)</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#d97706' }}>
                {totals.totalSearches > 0 ? Math.round((totals.totalCalls / totals.totalSearches) * 100) : 0}%
              </div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Conversie</div>
            </div>
          </div>

          {/* Combined vizite + cautari chart */}
          <div className="card mb-4" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#333' }}>Vizite si cautari pe zi</h3>
            <MultiLineChart
              series={[
                { data: pageViews, color: '#9B1B30', label: 'Vizite' },
                { data: searches, color: '#2563eb', label: 'Cautari' },
              ]}
            />
          </div>

          {/* Bottom grid: routes, devices, countries */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
            {/* Top routes */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#333', margin: 0, marginBottom: 12 }}>Top rute cautate (medie pe zi)</h3>
              {detailedRoutes.routes.length > 0 && (() => {
                const totalSearches = totals.totalSearches;
                const totalCalls = totals.totalCalls;
                const totalConv = totalSearches > 0 ? Math.round((totalCalls / totalSearches) * 100) : 0;
                return (
                  <div style={{ display: 'flex', gap: 24, marginBottom: 14, padding: '10px 12px', background: '#f8f8f8', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#888' }}>Total cautari: </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{totalSearches}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#888' }}>Total apeluri: </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{totalCalls}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: '#888' }}>Conversie: </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>{totalConv}%</span>
                    </div>
                  </div>
                );
              })()}
              {detailedRoutes.routes.length === 0 ? (
                <p style={{ color: '#999', fontSize: 14 }}>Nu sunt date.</p>
              ) : (() => {
                const maxDay = Math.max(...detailedRoutes.routes.flatMap(r => r.day_counts));
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                          {DAY_LABELS.map(d => (
                            <th key={d} style={{ textAlign: 'center', padding: '6px 4px', fontSize: 11, color: '#888', borderBottom: '1px solid #eee', minWidth: 34 }}>{d}</th>
                          ))}
                          <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Total</th>
                        </tr>
                        <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                          <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, color: '#555' }}>Total</td>
                          {detailedRoutes.dayTotals.map((dayTotal, di) => (
                            <td key={di} style={{
                              textAlign: 'center', padding: '6px 3px', fontSize: 12, fontWeight: 700,
                              color: dayTotal > 0 ? '#2563eb' : '#ccc',
                            }}>
                              {dayTotal > 0 ? dayTotal : '\u2014'}
                            </td>
                          ))}
                          <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                            {detailedRoutes.total}
                          </td>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedRoutes.routes.map((r, i) => (
                          <tr key={i}>
                            <td style={{ padding: '6px 8px', fontSize: 13, borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' }}>
                              {r.from_locality} &rarr; {r.to_locality}
                            </td>
                            {r.day_counts.map((val, di) => (
                              <td key={di} style={{
                                textAlign: 'center', padding: '6px 3px', fontSize: 12,
                                fontWeight: val > 0 ? 600 : 400, color: val > 0 ? '#1e3a5f' : '#ccc',
                                background: heatBg(val, maxDay), borderBottom: '1px solid #f5f5f5', borderRadius: 3,
                              }}>
                                {val > 0 ? val : '\u2014'}
                              </td>
                            ))}
                            <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#2563eb', borderBottom: '1px solid #f5f5f5' }}>
                              {r.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
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
                            height: '100%', borderRadius: 3, width: `${pct}%`,
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
        </>
      )}

    </div>
  );
}
