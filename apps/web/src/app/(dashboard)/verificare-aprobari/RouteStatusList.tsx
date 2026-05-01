import type { RouteStatus } from './actions';

const STATUS_LABEL: Record<RouteStatus['status'], { text: string; bg: string; color: string }> = {
  pending: { text: 'În așteptare', bg: '#fff7e6', color: '#9B6B00' },
  approved: { text: 'Verificată', bg: '#eef9ee', color: '#1f7a3a' },
  rejected: { text: 'Respinsă', bg: '#fdeeee', color: '#9B1B30' },
  never: { text: 'Neverificată', bg: '#f5f5f5', color: '#666' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' });
}

export default function RouteStatusList({ statuses }: { statuses: RouteStatus[] }) {
  if (statuses.length === 0) {
    return (
      <div style={{ padding: '14px 16px', background: '#fafafa', borderRadius: 10, color: '#666', fontSize: 13 }}>
        Nicio rută activă.
      </div>
    );
  }

  const order: Record<RouteStatus['status'], number> = { pending: 0, never: 1, rejected: 2, approved: 3 };
  const sorted = [...statuses].sort((a, b) => order[a.status] - order[b.status] || a.crm_route_id - b.crm_route_id);

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
      {sorted.map((r) => {
        const lbl = STATUS_LABEL[r.status];
        const time = r.status === 'approved' ? formatDate(r.last_decided_at)
          : r.status === 'rejected' ? formatDate(r.last_decided_at)
          : r.status === 'pending' ? formatDate(r.last_pending_at)
          : null;
        return (
          <li
            key={r.crm_route_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 8,
              fontSize: 13,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 600, color: '#222', minWidth: 220, flex: 1 }}>{r.route_name}</span>
            <span style={{ color: '#666', fontSize: 12, minWidth: 130 }}>
              {r.time_nord || '—'}{r.time_chisinau ? ` · ${r.time_chisinau}` : ''}
            </span>
            <span
              style={{
                padding: '3px 8px',
                background: lbl.bg,
                color: lbl.color,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                minWidth: 90,
                textAlign: 'center',
              }}
            >
              {lbl.text}
            </span>
            <span style={{ color: '#888', fontSize: 11, minWidth: 140 }}>
              {time || ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
