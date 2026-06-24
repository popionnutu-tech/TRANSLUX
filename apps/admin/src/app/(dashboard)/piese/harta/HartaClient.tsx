'use client';

import { useState } from 'react';
import PieseDepotMap from '@/components/PieseDepotMap';
import { locate } from './actions';

export default function HartaClient({ warehouseId, layout }: { warehouseId: number; layout: any }) {
  const [q, setQ] = useState('');
  const [hl, setHl] = useState<{ section: string; rack: string } | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'warn' | 'danger'; m: string } | null>(null);

  async function find(code: string) {
    const r = await locate(warehouseId, code);
    if (r.found && r.placement) { setHl({ section: r.placement.section, rack: r.placement.rack }); setMsg({ t: 'ok', m: `${r.label} → Secția ${r.placement.section}, raft ${r.placement.rack}, poliță ${r.placement.shelf || '—'}` }); }
    else if (r.found) { setHl(null); setMsg({ t: 'warn', m: `${r.label}: nu are locație în acest depozit` }); }
    else { setHl(null); setMsg({ t: 'danger', m: `Nu am găsit piesa: ${code}` }); }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="form-row" style={{ flex: 2 }}>
            <label>Caută sau scanează piesa → unde se află pe raft</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) find(q.trim()); } }} placeholder="штрихкод / articul / denumire…" />
          </div>
          <button className="btn btn-primary" onClick={() => q.trim() && find(q.trim())}>Găsește pe hartă</button>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.m}</div>}
      </div>
      <div className="card"><PieseDepotMap layout={layout} highlight={hl} /></div>
    </>
  );
}
