'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkIssue, submitIssue } from './actions';

interface Opt { id: number; label: string }

export default function RashodClient({ warehouses, vehicles, parts, mechanics, reasons }: {
  warehouses: Opt[]; vehicles: (Opt & { km: number })[]; parts: Opt[]; mechanics: Opt[]; reasons: Opt[];
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [partId, setPartId] = useState<number | ''>('');
  const [qty, setQty] = useState(1);
  const [mechanicId, setMechanicId] = useState<number | ''>('');
  const [reasonId, setReasonId] = useState<number | ''>('');
  const [info, setInfo] = useState<{ stock: number; alert: { level: string; messages: string[] } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const km = vehicles.find((v) => v.id === Number(vehicleId))?.km;

  useEffect(() => {
    if (!partId || !warehouseId) { setInfo(null); return; }
    let cancelled = false;
    checkIssue(warehouseId, vehicleId ? Number(vehicleId) : null, Number(partId)).then((r) => { if (!cancelled) setInfo(r); });
    return () => { cancelled = true; };
  }, [partId, vehicleId, warehouseId]);

  async function submit() {
    setErr(null); setDone(null); setBusy(true);
    try {
      const r = await submitIssue({ warehouse_id: warehouseId, vehicle_id: vehicleId ? Number(vehicleId) : null, mechanic_id: mechanicId ? Number(mechanicId) : null, breakdown_reason_id: reasonId ? Number(reasonId) : null, part_id: Number(partId), qty });
      setDone(r.shortages.length ? 'Înregistrat, atenție: ' + r.shortages.join('; ') : 'Rashod înregistrat. Stocul s-a actualizat.');
      setPartId(''); setQty(1); setInfo(null);
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h2>Eliberare piesă pe mașină</h2>
      <div className="row">
        <div className="form-row"><label>Depozit</label><select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
        <div className="form-row"><label>Mașina</label><select value={vehicleId} onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : '')}><option value="">— alege mașina —</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></div>
      </div>
      <div className="form-row"><label>Piesa</label><select value={partId} onChange={(e) => setPartId(e.target.value ? Number(e.target.value) : '')}><option value="">— alege piesa —</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>

      {info && (
        <>
          <div className={`alert ${info.stock <= 0 ? 'danger' : 'info'}`}>Stoc în acest depozit: <strong>{info.stock}</strong>{info.stock <= 0 ? ' — atenție, stoc epuizat!' : ''}</div>
          {info.alert && info.alert.messages.map((m, i) => (
            <div key={i} className={`alert ${info.alert!.level === 'warn' ? 'warn' : info.alert!.level === 'info' ? 'info' : 'ok'}`}>{m}</div>
          ))}
        </>
      )}

      <div className="row">
        <div className="form-row"><label>Cantitate</label><input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
        <div className="form-row"><label>Km mașină — din GPS</label><input type="text" readOnly disabled value={km ? km.toLocaleString('ro-RO') + ' km' : '— alege mașina —'} title="Kilometrajul vine din softul GPS, nu se introduce manual" /></div>
      </div>
      <div className="row">
        <div className="form-row"><label>Mecanic / lăcătuș</label><select value={mechanicId} onChange={(e) => setMechanicId(e.target.value ? Number(e.target.value) : '')}><option value="">—</option>{mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
        <div className="form-row"><label>Cauza defecțiunii</label><select value={reasonId} onChange={(e) => setReasonId(e.target.value ? Number(e.target.value) : '')}><option value="">—</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      </div>

      {err && <div className="alert danger">{err}</div>}
      {done && <div className="alert ok">{done}</div>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !partId} onClick={submit}>{busy ? 'Se înregistrează…' : 'Înregistrează rashod'}</button>
    </div>
  );
}
