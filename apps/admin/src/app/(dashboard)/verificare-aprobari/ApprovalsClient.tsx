'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveSubmission, rejectSubmission, type PendingSubmission } from './actions';

export default function ApprovalsClient({ submissions }: { submissions: PendingSubmission[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (submissions.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#666', background: '#fafafa', borderRadius: 12 }}>
        Nicio verificare în așteptare.
      </div>
    );
  }

  const onApprove = (id: string) => {
    setErr(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await approveSubmission(id);
      setBusyId(null);
      if (!r.ok) setErr(r.error || 'Eroare.');
      else router.refresh();
    });
  };
  const onReject = (id: string) => {
    if (!confirm('Sigur respingeți această verificare? Modificările propuse nu vor fi aplicate.')) return;
    setErr(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await rejectSubmission(id);
      setBusyId(null);
      if (!r.ok) setErr(r.error || 'Eroare.');
      else router.refresh();
    });
  };

  return (
    <div>
      {err && <div style={{ color: '#9B1B30', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
        {submissions.map((s) => {
          const turChanges = s.changes.filter((c) => c.direction === 'tur');
          const returChanges = s.changes.filter((c) => c.direction === 'retur');
          const totalChanges = s.changes.length + (s.retur_change_proposed ? 1 : 0);
          return (
            <li
              key={s.id}
              style={{
                background: '#fff',
                border: '1px solid #eee',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#222' }}>
                    {s.route_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    Trimis: {new Date(s.created_at).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' })}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {totalChanges === 0 ? (
                    <span style={{ color: '#1f7a3a', fontWeight: 600 }}>Toate orele confirmate corecte</span>
                  ) : (
                    <span>{totalChanges} modificare(i) propusă(e)</span>
                  )}
                </div>
              </div>

              {!s.retur_same && returChanges.length === 0 && totalChanges > 0 && !s.retur_change_proposed && (
                <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>
                  Operatorul a verificat și cursa de retur — nu a propus schimbări la retur.
                </div>
              )}
              {s.retur_same && (
                <div style={{ fontSize: 12, color: '#777', marginBottom: 8 }}>
                  Operatorul a confirmat că retur-ul merge la fel.
                </div>
              )}

              {s.retur_swap && (
                <div
                  style={{
                    background: '#fff7e6',
                    border: '1px solid #ffd9a3',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 10,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#9B1B30', marginBottom: 4 }}>
                    Schimbare slot retur propusă
                  </div>
                  {s.retur_swap.proposed_retur_disabled ? (
                    <div>Marchează această rută ca <strong>fără retur</strong> — slot-ul retur propriu rămâne liber.</div>
                  ) : (
                    <>
                      <div>
                        Folosește slot-ul retur al rutei{' '}
                        <strong>{s.retur_swap.proposed_route_name || `#${s.retur_swap.proposed_retur_uses_route_id}`}</strong>
                        {s.retur_swap.proposed_time ? ` (${s.retur_swap.proposed_time})` : ''}.
                      </div>
                      {s.retur_swap.current_claimer_route_id &&
                        s.retur_swap.current_claimer_route_id !== s.crm_route_id && (
                          <div style={{ marginTop: 4, color: '#555' }}>
                            La aprobare, ruta <strong>{s.retur_swap.current_claimer_route_name}</strong>{' '}
                            pierde retur-ul și rămâne neperechiată.
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}

              {turChanges.length > 0 && (
                <ChangeBlock title="Cursa 1 (Nord → Chișinău)" changes={turChanges} />
              )}
              {returChanges.length > 0 && (
                <ChangeBlock
                  title="Cursa 2 (Chișinău → Nord)"
                  subtitle={s.time_chisinau ? `Pornire din Chișinău: ${s.time_chisinau.split(' - ')[0]}` : null}
                  changes={returChanges}
                />
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => onApprove(s.id)}
                  disabled={isPending && busyId === s.id}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#1f7a3a',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {busyId === s.id && isPending ? '...' : totalChanges > 0 ? 'Aprobă și aplică' : 'Confirmă (fără schimbări)'}
                </button>
                <button
                  onClick={() => onReject(s.id)}
                  disabled={isPending && busyId === s.id}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#9B1B30',
                    border: '1px solid #9B1B30',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Respinge
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChangeBlock({
  title,
  subtitle,
  changes,
}: {
  title: string;
  subtitle?: string | null;
  changes: { stop_name: string; old_time: string | null; new_time: string }[];
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: subtitle ? 2 : 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{subtitle}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
        {changes.map((c, i) => (
          <li
            key={i}
            style={{
              background: '#fff7e6',
              border: '1px solid #ffd9a3',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              display: 'flex',
              gap: 12,
              alignItems: 'baseline',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1, minWidth: 120 }}>{c.stop_name}</span>
            <span style={{ color: '#888', textDecoration: 'line-through' }}>
              {c.old_time || '—'}
            </span>
            <span style={{ color: '#9B1B30', fontWeight: 700 }}>→ {c.new_time}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
