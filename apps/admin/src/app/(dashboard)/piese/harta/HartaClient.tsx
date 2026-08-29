'use client';

import { useState } from 'react';
import PieseDepotMap from '@/components/PieseDepotMap';
import { locate, locateGroup } from './actions';
import { formatLocation } from '@/lib/piese-location';

export default function HartaClient({ warehouseId, layout, groups }: { warehouseId: number; layout: any; groups: { id: number; label: string }[] }) {
  const [q, setQ] = useState('');
  const [hl, setHl] = useState<{ section: string; rack: string } | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'warn' | 'danger'; m: string } | null>(null);
  // Evidențierea unei GRUPE întregi: „unde sunt filtrele", fără să caute piesă cu piesă (cererea lui Eduard).
  const [groupId, setGroupId] = useState<number | ''>('');
  const [groupHl, setGroupHl] = useState<{ section: string; rack: string }[]>([]);

  async function findGroup(gid: number | '') {
    setGroupId(gid);
    setHl(null);
    if (!gid) { setGroupHl([]); setMsg(null); return; }
    const spots = await locateGroup(warehouseId, Number(gid));
    setGroupHl(spots);
    const label = groups.find((g) => g.id === Number(gid))?.label || '';
    setMsg(spots.length
      ? { t: 'ok', m: `${label}: ${spots.length === 1 ? 'un rând' : `${spots.length} rânduri`} — ${spots.map((s) => `${s.section}-${s.rack}`).join(', ')}` }
      : { t: 'warn', m: `${label}: nicio piesă amplasată în acest depozit` });
  }

  async function find(code: string) {
    const r = await locate(warehouseId, code);
    setGroupHl([]); setGroupId(''); // căutarea de piesă înlocuiește evidențierea de grupă
    if (r.found && r.placement) { setHl({ section: r.placement.section, rack: r.placement.rack }); setMsg({ t: 'ok', m: `${r.label} → ${formatLocation(r.placement.label)}` }); }
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
          <div className="form-row" style={{ minWidth: 190 }}>
            <label>…sau arată o grupă întreagă</label>
            <select value={groupId} onChange={(e) => findGroup(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— alege grupa —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.m}</div>}
      </div>
      <div className="card"><PieseDepotMap layout={layout} highlight={hl} highlightRacks={groupHl} /></div>
    </>
  );
}
