'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitReceipt } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';
import PartForm from '@/components/PartForm';

interface Opt { id: number; label: string }
interface Line { part_id: number | ''; part_label?: string; qty: number; unit_cost: number }

export default function PrihodClient({ warehouses, suppliers, groups }: { warehouses: Opt[]; suppliers: Opt[]; groups: Opt[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1, unit_cost: 0 }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const [newPartFor, setNewPartFor] = useState<number | null>(null); // indexul poziției care adaugă o piesă nouă

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const r = await submitReceipt({
        warehouse_id: warehouseId, supplier_id: supplierId ? Number(supplierId) : null, invoice_series: series, invoice_number: number,
        lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty, unit_cost: l.unit_cost })),
      });
      setMsg({ t: 'ok', m: `Prihod #${r.docId} înregistrat. Stocul a crescut.` });
      setLines([{ part_id: '', qty: 1, unit_cost: 0 }]); setSeries(''); setNumber('');
      router.refresh();
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Recepție marfă (накладная)</h2>
      <div className="row">
        <div className="form-row"><label>Depozit</label><select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
        <div className="form-row"><label>Furnizor</label><SearchSelect options={suppliers} value={supplierId} onSelect={(o) => setSupplierId(o ? o.id : '')} placeholder="— caută furnizor —" /></div>
        <div className="form-row"><label>Serie</label><input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="AA" /></div>
        <div className="form-row"><label>Număr</label><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123456" /></div>
      </div>
      <table>
        <thead><tr><th>Piesă</th><th style={{ width: 110 }}>Cant.</th><th style={{ width: 140 }}>Preț unitar</th><th className="num" style={{ width: 110 }}>Sumă</th><th style={{ width: 36 }}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label} onSelect={(o) => setLine(i, { part_id: o ? o.id : '', part_label: o?.label })} placeholder="— caută piesa (denumire, cod, articol) —" /></div>
                  <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setNewPartFor(i)} title="Adaugă o piesă care nu există încă în catalog">+ nouă</button>
                </div>
              </td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td><input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: Number(e.target.value) })} /></td>
              <td className="num">{(l.qty * l.unit_cost).toFixed(2)}</td>
              <td>{lines.length > 1 && <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button className="btn" onClick={() => setLines((ls) => [...ls, { part_id: '', qty: 1, unit_cost: 0 }])}>+ Adaugă poziție</button>
        <strong>Total: {total.toFixed(2)} lei</strong>
      </div>
      {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12 }}>{msg.m}</div>}
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? 'Se înregistrează…' : 'Confirmă prihodul'}</button>
    </div>
  );
}
