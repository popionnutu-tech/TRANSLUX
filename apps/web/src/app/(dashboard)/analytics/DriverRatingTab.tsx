'use client';

import { useState, useTransition } from 'react';
import type { DriverPerformanceRow, RouteEtalon, RouteOption } from './sales-actions';
import { getDriverPerformance, recalculateBaselines } from './sales-actions';

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

function perfBadge(pct: number | null, isStable: boolean): { color: string; bg: string; border: string } {
  if (pct === null) return { color: '#888', bg: '#f5f5f5', border: '#ddd' };
  if (pct >= 110) return { color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' };
  if (pct >= 90) return { color: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
  // Red — extra emphasis for stable driver
  if (isStable) return { color: '#fff', bg: '#dc2626', border: '#dc2626' };
  return { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
}

interface Props {
  initialData: DriverPerformanceRow[];
  initialEtalons: RouteEtalon[];
  routes: RouteOption[];
  dateFrom: string;
  dateTo: string;
}

export default function DriverRatingTab({ initialData, initialEtalons, routes, dateFrom, dateTo }: Props) {
  const [data, setData] = useState(initialData);
  const [etalons] = useState(initialEtalons);
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const [routeId, setRouteId] = useState<number | undefined>();
  const [isPending, startTransition] = useTransition();
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);

  function reload() {
    startTransition(async () => {
      const d = await getDriverPerformance(from, to, routeId);
      setData(d);
    });
  }

  function handleRecalculate() {
    setRecalcMsg(null);
    startTransition(async () => {
      const r = await recalculateBaselines();
      setRecalcMsg(`Meteo: ${r.weatherDays} zile, etaloane: ${r.baselinesCount}`);
      const d = await getDriverPerformance(from, to, routeId);
      setData(d);
    });
  }

  // Summary stats
  const withPct = data.filter(d => d.performance_pct !== null);
  const avgPct = withPct.length > 0 ? Math.round(withPct.reduce((s, d) => s + d.performance_pct!, 0) / withPct.length) : null;
  const best = withPct.length > 0 ? withPct.reduce((a, b) => (a.performance_pct! > b.performance_pct! ? a : b)) : null;
  const totalSessions = data.reduce((s, d) => s + d.sessions_count, 0);

  // Selected route etalon card
  const selectedEtalon = routeId ? etalons.find(e => e.crm_route_id === routeId) : null;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>De la</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Pana la</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Ruta</label>
          <select value={routeId || ''} onChange={e => setRouteId(e.target.value ? Number(e.target.value) : undefined)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}>
            <option value="">Toate rutele</option>
            {routes.map(r => (
              <option key={r.id} value={r.id}>{r.dest_to_ro} ({r.time_chisinau?.split(' - ')[0]})</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={reload} disabled={isPending}
          style={{ fontSize: 13, padding: '7px 16px' }}>
          Filtreaza
        </button>
        <button className="btn btn-outline" onClick={handleRecalculate} disabled={isPending}
          style={{ fontSize: 13, padding: '7px 16px' }}>
          Recalculare etalon
        </button>
      </div>

      {recalcMsg && <div style={{ fontSize: 13, color: '#059669', marginBottom: 12 }}>{recalcMsg}</div>}
      {isPending && <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>Se incarca...</div>}

      {/* Etalon card for selected route */}
      {selectedEtalon && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#333' }}>
            Etalon: {selectedEtalon.route_name}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: '#888', padding: '4px 8px', textAlign: 'left' }}></th>
                  {DAY_LABELS.map(d => (
                    <th key={d} style={{ fontSize: 11, color: '#888', padding: '4px 6px', textAlign: 'center' }}>{d}</th>
                  ))}
                  <th style={{ fontSize: 11, color: '#888', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontSize: 13, padding: '4px 8px', color: '#555' }}>Pasageri</td>
                  {selectedEtalon.day_etalons.map((v, i) => (
                    <td key={i} style={{ fontSize: 14, fontWeight: 600, textAlign: 'center', padding: '4px 6px', color: v !== null ? '#333' : '#ccc' }}>
                      {v !== null ? v : '—'}
                    </td>
                  ))}
                  <td style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '4px 8px', color: '#9B1B30' }}>
                    {selectedEtalon.total_etalon !== null ? selectedEtalon.total_etalon : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {selectedEtalon.stable_driver_name && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Sofer stabil: <strong>{selectedEtalon.stable_driver_name}</strong> ({selectedEtalon.stable_driver_sessions} curse)
            </div>
          )}
          {selectedEtalon.total_sample < 10 && (
            <div style={{ fontSize: 12, color: '#d97706', marginTop: 4 }}>
              ⚠ Etalon bazat pe doar {selectedEtalon.total_sample} curse
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#9B1B30' }}>{totalSessions}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Total curse</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: avgPct !== null && avgPct >= 100 ? '#059669' : '#d97706' }}>
            {avgPct !== null ? `${avgPct}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Media % etalon</div>
        </div>
        {best && (
          <div className="card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{best.driver_name}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Cel mai bun ({best.performance_pct}%)</div>
          </div>
        )}
      </div>

      {/* Main table */}
      {data.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#999' }}>
          Nu sunt date pentru perioada selectata.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Sofer</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Tip</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Curse</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas. med.</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Etalon</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>%</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Venit (lei)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const badge = perfBadge(row.performance_pct, row.is_stable);
                  return (
                    <tr key={`${row.driver_id}-${row.crm_route_id}`} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 500 }}>{row.driver_name}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 12 }}>
                        {row.is_stable
                          ? <span style={{ color: '#9B1B30', fontWeight: 700 }}>★ stabil</span>
                          : <span style={{ color: '#aaa' }}>schimb.</span>
                        }
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 13, color: '#555' }}>{row.route_name}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 14 }}>{row.sessions_count}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 14, fontWeight: 600 }}>{row.avg_passengers}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontSize: 13, color: '#888' }}>
                        {row.baseline_passengers !== null ? row.baseline_passengers : '—'}
                        {row.sample_count > 0 && row.sample_count < 5 && (
                          <span title={`Bazat pe ${row.sample_count} curse`} style={{ color: '#d97706', marginLeft: 4 }}>⚠</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 700,
                          color: badge.color,
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                        }}>
                          {row.performance_pct !== null ? `${row.performance_pct}%` : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: 14, fontWeight: 500 }}>
                        {row.total_revenue.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
