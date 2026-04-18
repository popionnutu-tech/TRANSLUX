'use client';

import type { DemandSupplyRow } from './sales-actions';

interface Props {
  data: DemandSupplyRow[];
  days: number;
}

export default function DemandGapTab({ data, days }: Props) {
  if (data.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: '#999' }}>
        Nu sunt date pentru perioada selectata.
      </div>
    );
  }

  const maxSearch = Math.max(...data.map(d => d.search_count), 1);
  const totalSearches = data.reduce((s, d) => s + d.search_count, 0);
  const totalCalls = data.reduce((s, d) => s + d.call_count, 0);
  const overallConversion = totalSearches > 0 ? Math.round((totalCalls / totalSearches) * 100) : 0;

  return (
    <div>
      {/* Funnel summary */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>Pâlnia de conversie ({days}z)</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{totalSearches.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Cautari</div>
          </div>
          <div style={{ fontSize: 20, color: '#ccc' }}>→</div>
          <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{totalCalls.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Apeluri</div>
          </div>
          <div style={{ fontSize: 20, color: '#ccc' }}>→</div>
          <div style={{ textAlign: 'center', flex: '1 1 120px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{overallConversion}%</div>
            <div style={{ fontSize: 12, color: '#888' }}>Conversie</div>
          </div>
        </div>
      </div>

      {/* Demand vs Supply bars */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>Cerere (cautari) vs Oferta (pasageri)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.filter(d => d.search_count >= 3).map(row => {
            const searchWidth = (row.search_count / maxSearch) * 100;
            const paxWidth = row.avg_actual_passengers !== null
              ? Math.min((row.avg_actual_passengers / maxSearch) * 100 * (days / 30), 100)
              : 0;
            const hasGap = row.gap_score !== null && row.gap_score > 1;

            return (
              <div key={row.route}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>
                    {row.route}
                    {hasGap && <span style={{ color: '#dc2626', marginLeft: 6, fontSize: 11, fontWeight: 700 }}>GAP</span>}
                  </span>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    {row.search_count} caut. / {row.call_count} apel.
                    {row.avg_actual_passengers !== null && ` / ~${row.avg_actual_passengers} pas.`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#888', width: 50, textAlign: 'right' }}>Cerere</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f0f0f0' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${searchWidth}%`, background: '#2563eb' }} />
                    </div>
                  </div>
                  {row.avg_actual_passengers !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#888', width: 50, textAlign: 'right' }}>Oferta</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f0f0f0' }}>
                        <div style={{ height: '100%', borderRadius: 4, width: `${paxWidth}%`, background: '#059669' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details table */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#333' }}>Detalii pe rute</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Destinatie</th>
                <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Cautari</th>
                <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Apeluri</th>
                <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Conversie</th>
                <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Pas. med.</th>
                <th style={{ textAlign: 'center', padding: '8px', fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.route} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '8px 10px', fontSize: 13 }}>{row.route}</td>
                  <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, fontWeight: 600, color: '#2563eb' }}>{row.search_count}</td>
                  <td style={{ textAlign: 'center', padding: '8px', fontSize: 14, fontWeight: 600, color: '#059669' }}>{row.call_count}</td>
                  <td style={{ textAlign: 'center', padding: '8px', fontSize: 13 }}>{row.conversion_rate}%</td>
                  <td style={{ textAlign: 'center', padding: '8px', fontSize: 13 }}>
                    {row.avg_actual_passengers !== null ? row.avg_actual_passengers : '—'}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px', fontSize: 13 }}>
                    {row.gap_score !== null ? (
                      <span style={{
                        fontWeight: 600,
                        color: row.gap_score > 2 ? '#dc2626' : row.gap_score > 1 ? '#d97706' : '#059669',
                      }}>
                        {row.gap_score.toFixed(1)}x
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
