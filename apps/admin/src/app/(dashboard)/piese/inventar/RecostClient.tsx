'use client';

import { useState } from 'react';
import SearchSelect from '@/components/SearchSelect';
import { searchParts } from '../search-parts';
import { loadPartStock, recostPartAction } from './actions';

interface Opt { id: number; label: string }

// „Revizuire cost" (2B) — corectează costul mediu al unei piese într-un depozit, PĂSTRÂND cantitatea.
// Pentru cazul „am pus cost greșit la inventar/recepție". Server: RPC piese_recost (scoate la cost vechi +
// readu la cost nou, net qty 0). Doar rolurile care scriu (PART_WRITE_ROLES) + depozitul lor (gardat pe server).
export default function RecostClient({ warehouses }: { warehouses: Opt[] }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [partId, setPartId] = useState<number | ''>('');
  const [partLabel, setPartLabel] = useState('');
  const [cur, setCur] = useState<{ qty: number; avgCost: number } | null>(null);
  const [newCost, setNewCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);

  async function refreshStock(wid: number, pid: number) {
    try { const s = await loadPartStock(wid, pid); setCur({ qty: s.qty, avgCost: s.avgCost }); }
    catch { setCur(null); }
  }
  async function pickPart(o: Opt | null) {
    setMsg(null); setNewCost(''); setCur(null);
    setPartId(o ? o.id : ''); setPartLabel(o?.label || '');
    if (o && warehouseId) await refreshStock(warehouseId, o.id);
  }
  async function onWarehouse(id: number) {
    setWarehouseId(id); setMsg(null); setCur(null);
    if (partId) await refreshStock(id, Number(partId));
  }
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      if (!partId) throw new Error('Alege o piesă.');
      if (newCost.trim() === '' || !(Number(newCost) >= 0)) throw new Error('Introdu costul nou (≥ 0).');
      const res = await recostPartAction(warehouseId, Number(partId), Number(newCost));
      setMsg({ t: 'ok', m: `Cost revizuit: ${res.qty} buc · ${res.oldAvg.toFixed(2)} → ${res.newCost.toFixed(2)} lei/buc. Cantitatea a rămas neschimbată.` });
      setCur({ qty: res.qty, avgCost: res.newCost }); setNewCost('');
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Revizuire cost</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Corectează <strong>costul mediu</strong> al unei piese într-un depozit — <strong>cantitatea rămâne neschimbată</strong>.
        Folosește-l când costul a fost pus greșit la inventar/recepție.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="form-row"><label>Depozit</label>
          <select value={warehouseId} onChange={(e) => onWarehouse(Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 260 }}><label>Piesă</label>
          <SearchSelect searchFn={searchParts} value={partId} selectedLabel={partLabel} onSelect={pickPart} placeholder="— caută piesa —" />
        </div>
      </div>

      {partId !== '' && cur && (cur.qty > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 10 }}>
            Stoc curent: <strong>{cur.qty}</strong> · cost mediu curent: <strong>{cur.avgCost.toFixed(2)} lei/buc</strong> · valoare: <strong>{(cur.qty * cur.avgCost).toFixed(2)} lei</strong>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="form-row"><label>Cost nou (lei/buc)</label>
              <input type="number" min={0} step="0.01" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="ex: 125.50" />
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Se aplică…' : 'Revizuiește costul'}</button>
          </div>
        </div>
      ) : (
        <div className="alert warn" style={{ marginTop: 12 }}>Piesa nu are stoc pozitiv în acest depozit — nu se poate revizui costul.</div>
      ))}

      {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12 }}>{msg.m}</div>}
    </div>
  );
}
