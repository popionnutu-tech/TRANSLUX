'use client';

import type { EmptyTripRow } from './sales-actions';

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa', 'Du'];

function loadColor(pct: number | null): string {
  if (pct === null) return '#f5f5f5';
  if (pct >= 80) return 'rgba(5, 150, 105, 0.25)';
  if (pct >= 50) return 'rgba(217, 119, 6, 0.2)';
  return 'rgba(220, 38, 38, 0.2)';
}

function loadTextColor(pct: number | null): string {
  if (pct === null) return '#ccc';
  if (pct >= 80) return '#065f46';
  if (pct >= 50) return '#92400e';
  return '#991b1b';
}

interface Props {
  data: EmptyTripRow[];
}

export default function EmptyTripsTab({ data }: Props) {
  // Summary
  const total = data.length;
  const withLoad = data.filter(d => d.load_pct !== null);
  const emptyRoutes = withLoad.filter(d => d.load_pct! < 50).length;
  const avgLoad = withLoad.length > 0 ? Math.round(withLoad.reduce((s, d) => s + d.load_pct!, 0) / withLoad.length) : null;

  // Rain impact
  const withRain = data.filter(d => d.rain_sessions > 0 && d.rain_avg_passengers !== null);
  const rainDrop = withRain.length > 0
    ? Math.round(withRain.reduce((s, d) => {
        const normalAvg = d.avg_passengers;
        const diff = normalAvg > 0 ? ((d.rain_avg_passengers! - normalAvg) / normalAvg) * 100 : 0;
        return s + diff;
      }, 0) / withRain.length)
    : null;

  // Heatmap: find max day_avg for color scaling
  const maxDayAvg = Math.max(...data.flatMap(d => d.day_avg), 1);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#9B1B30' }}>{total}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Rute analizate</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: emptyRoutes > 0 ? '#dc2626' : '#059669' }}>{emptyRoutes}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Rute goale (&lt;50%)</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: avgLoad !== null && avgLoad >= 80 ? '#059669' : '#d97706' }}>
            {avgLoad !== null ? `${avgLoad}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Incarcarea medie</div>
        </div>
        {rainDrop !== null && (
          <div className="card" style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{rainDrop}%</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Impactul ploii</div>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#999' }}>
          Nu sunt date pentru perioada selectata.
        </div>
      ) : (
        <>
          {/* Heatmap table */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#333' }}>Pasageri×opriri pe zi (proxy încărcare)</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px 0' }}>
              Suma pasagerilor prezenți la fiecare oprire — indicator de cât de plin e autobuzul de-a lungul traseului. Nu reprezintă pasageri unici.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                    {DAY_LABELS.map(d => (
                      <th key={d} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 11, color: '#888', borderBottom: '1px solid #eee', minWidth: 40 }}>{d}</th>
                    ))}
                    <th style={{ textAlign: 'center', padding: '8px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Med.</th>
                    <th style={{ textAlign: 'center', padding: '8px 8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.crm_route_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '8px 10px', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {row.route_name}
                        <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{row.time_chisinau?.split(' - ')[0]}</span>
                      </td>
                      {row.day_avg.map((val, di) => {
                        const intensity = maxDayAvg > 0 ? val / maxDayAvg : 0;
                        const bg = val > 0 ? `rgba(37, 99, 235, ${(0.05 + intensity * 0.5).toFixed(2)})` : 'transparent';
                        return (
                          <td key={di} style={{
                            textAlign: 'center', padding: '8px 4px', fontSize: 13, fontWeight: val > 0 ? 600 : 400,
                            color: val > 0 ? '#1e3a5f' : '#ccc', background: bg, borderRadius: 3,
                          }}>
                            {val > 0 ? val : '—'}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', padding: '8px 8px', fontSize: 14, fontWeight: 600 }}>
                        {row.avg_passengers}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          color: loadTextColor(row.load_pct), background: loadColor(row.load_pct),
                        }}>
                          {row.load_pct !== null ? `${row.load_pct}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real passengers table */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: '#333' }}>Pasageri reali (medie pe cursă)</h3>
            <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px 0' }}>
              Număr de pasageri unici (au urcat și au coborât). Include cei lungi și cei scurți.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas. reali</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas.×km</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Lungime (km)</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Încărcare %</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Venit/km</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <tr key={`real-${row.crm_route_id}`} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '8px 10px', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {row.route_name}
                        <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{row.time_chisinau?.split(' - ')[0]}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, fontWeight: 600, color: '#1e3a5f' }}>
                        {row.unique_passengers_avg}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#555' }}>
                        {row.passenger_km_avg.toLocaleString('ro-RO')}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#555' }}>
                        {row.route_length_km !== null ? row.route_length_km : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                          color: row.load_factor_pct === null ? '#888' :
                                 row.load_factor_pct >= 65 ? '#065f46' :
                                 row.load_factor_pct >= 40 ? '#92400e' : '#991b1b',
                          background: row.load_factor_pct === null ? '#f5f5f5' :
                                      row.load_factor_pct >= 65 ? 'rgba(5,150,105,0.18)' :
                                      row.load_factor_pct >= 40 ? 'rgba(217,119,6,0.18)' : 'rgba(220,38,38,0.18)',
                        }}>
                          {row.load_factor_pct !== null ? `${row.load_factor_pct.toFixed(0)}%` : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, fontWeight: 600, color: '#9B1B30' }}>
                        {row.revenue_per_km !== null ? `${row.revenue_per_km.toFixed(1)} lei` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details table */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#333' }}>Detalii</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ruta</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Curse</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas.×opriri</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas. reali</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Etalon</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Goale</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Ploaie</th>
                    <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Med. ploaie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <tr key={row.crm_route_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '8px 10px', fontSize: 13 }}>
                        {row.route_name}
                        <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>{row.time_chisinau?.split(' - ')[0]}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 14 }}>{row.sessions_count}</td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#888' }}>{row.avg_passengers}</td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, fontWeight: 600 }}>{row.unique_passengers_avg}</td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#888' }}>
                        {row.baseline !== null ? row.baseline : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, color: row.empty_sessions > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                        {row.empty_sessions}/{row.sessions_count}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#2563eb' }}>
                        {row.rain_sessions > 0 ? row.rain_sessions : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', fontSize: 13, color: '#555' }}>
                        {row.rain_avg_passengers !== null ? row.rain_avg_passengers : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
