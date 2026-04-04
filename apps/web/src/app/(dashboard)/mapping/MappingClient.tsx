'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MappingRow, CrmRouteOption } from './actions';
import { updateMapping } from './actions';

interface Props {
  mappings: MappingRow[];
  crmRoutes: CrmRouteOption[];
}

function fmtTime(t: string) {
  return t.slice(0, 5);
}

function fmtCrmTime(t: string | null) {
  if (!t) return '—';
  const m = t.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : t;
}

export default function MappingClient({ mappings, crmRoutes }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleChange(tripId: string, value: string) {
    setSaving(tripId);
    setError('');
    try {
      const crmId = value === '' ? null : parseInt(value, 10);
      await updateMapping(tripId, crmId);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const crmMap = new Map(crmRoutes.map(r => [r.id, r]));
  const usedCrmIds = new Set(mappings.map(m => m.crm_route_id).filter(Boolean));

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
        Mapping: Curse operator ↔ Rute site
      </h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Leagă fiecare cursă a operatorului Chișinău cu ruta corespunzătoare de pe site (grafic).
      </p>

      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: 8, borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>#</th>
            <th style={{ padding: '8px 12px' }}>Ora operator</th>
            <th style={{ padding: '8px 12px' }}>Rută site (crm_route)</th>
            <th style={{ padding: '8px 12px' }}>Destinație</th>
            <th style={{ padding: '8px 12px' }}>Ora site</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => {
            const linked = m.crm_route_id ? crmMap.get(m.crm_route_id) : null;
            return (
              <tr key={m.trip_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 12px', color: '#999' }}>{i + 1}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'monospace', fontSize: 15 }}>
                  {fmtTime(m.departure_time)}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <select
                    value={m.crm_route_id ?? ''}
                    onChange={(e) => handleChange(m.trip_id, e.target.value)}
                    disabled={saving === m.trip_id}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      background: m.crm_route_id ? '#fff' : '#fff3cd',
                      minWidth: 280,
                    }}
                  >
                    <option value="">— Fără legătură —</option>
                    {crmRoutes.map(r => {
                      const inUse = usedCrmIds.has(r.id) && r.id !== m.crm_route_id;
                      return (
                        <option key={r.id} value={r.id} disabled={inUse}>
                          {`#${r.id} ${fmtCrmTime(r.time_chisinau)} → ${r.dest_to_ro}`}
                          {inUse ? ' (folosit)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {saving === m.trip_id && <span style={{ marginLeft: 8, color: '#999' }}>...</span>}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {linked?.dest_to_ro || <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                  {linked ? fmtCrmTime(linked.time_chisinau) : <span style={{ color: '#ccc' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
