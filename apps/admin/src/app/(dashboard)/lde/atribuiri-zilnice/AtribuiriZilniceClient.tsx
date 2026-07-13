'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import DirectionChips from '@/components/DirectionChips';
import { saveManagerDirections, addManager, removeManager, type AtribuiriAdminData } from './actions';

export default function AtribuiriZilniceClient({ data }: { data: AtribuiriAdminData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [candidat, setCandidat] = useState('');
  const [busy, setBusy] = useState(false);

  function onDateChange(value: string) {
    if (!value) return;
    startTransition(() => router.push(`/lde/atribuiri-zilnice?date=${value}`));
  }

  async function onAddManager() {
    if (!candidat) return;
    setBusy(true);
    try { await addManager(candidat); setCandidat(''); router.refresh(); } finally { setBusy(false); }
  }

  async function onRemoveManager(id: string) {
    setBusy(true);
    try { await removeManager(id); router.refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Atribuiri zilnice — manageri &amp; status</h1>
        <p className="text-sm text-muted-foreground">
          Managerii introduc atribuirile în Telegram Mini App «Atribuiri»; GPS-ul confirmă a doua zi.
        </p>
      </div>

      <Card style={{ marginBottom: '1rem' }}>
        <CardHeader className="pb-2"><CardTitle>Manageri și direcțiile lor</CardTitle></CardHeader>
        <CardContent>
          {data.manageri.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Niciun manager încă — alege un utilizator Telegram mai jos și apasă «Adaugă manager».
            </p>
          )}
          {data.manageri.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border, #eee)', flexWrap: 'wrap' }}>
              <span style={{ minWidth: 160, fontWeight: 600 }}>
                {m.label}{!m.active && <span style={{ color: 'var(--danger, #ef4444)', fontSize: 12 }}> · inactiv</span>}
              </span>
              <DirectionChips
                value={m.directions}
                options={data.optiuni}
                onSave={(dirs) => saveManagerDirections(m.id, dirs)}
              />
              <button
                onClick={() => onRemoveManager(m.id)}
                disabled={busy}
                style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border, #ddd)', background: 'transparent', color: 'var(--danger, #c0392b)' }}
              >scoate</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <select
              value={candidat}
              onChange={(e) => setCandidat(e.target.value)}
              disabled={busy}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid var(--border, #ddd)', minWidth: 220 }}
            >
              <option value="">— alege utilizator Telegram —</option>
              {data.candidati.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button
              onClick={onAddManager}
              disabled={!candidat || busy}
              className="btn btn-primary"
              style={{ padding: '0.4rem 0.9rem', borderRadius: 6, cursor: 'pointer', border: 'none', background: '#9B1B30', color: '#fff', fontWeight: 600 }}
            >Adaugă manager</button>
            <span className="text-sm text-muted-foreground">Userul primește rolul MANAGER_LDE și vede Mini App-ul «Atribuiri».</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Status pe zi</CardTitle>
          <input
            type="date" value={data.date} disabled={isPending}
            onChange={(e) => onDateChange(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid var(--border, #ddd)' }}
          />
        </CardHeader>
        <CardContent>
          <div style={{ overflowX: 'auto' }}>
            <table className="pivot-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Direcția</th>
                  <th style={{ textAlign: 'right' }}>Curse</th>
                  <th style={{ textAlign: 'right' }}>Fără mașină</th>
                  <th style={{ textAlign: 'right' }}>Modificate</th>
                  <th style={{ textAlign: 'right' }}>Confirmate</th>
                  <th style={{ textAlign: 'right' }}>Nepotriviri</th>
                  <th style={{ textAlign: 'right' }}>Fără GPS</th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((r) => (
                  <tr key={r.direction}>
                    <td>{r.label}</td>
                    <td style={{ textAlign: 'right' }}>{r.total}</td>
                    <td style={{ textAlign: 'right', color: r.fara_masina ? 'var(--warning, #c07a12)' : undefined }}>{r.fara_masina || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.modificate || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.confirmate ? 'var(--success, #1a8a4a)' : undefined }}>{r.confirmate || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.nepotriviri ? 'var(--danger, #ef4444)' : undefined }}>{r.nepotriviri || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.fara_gps || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
