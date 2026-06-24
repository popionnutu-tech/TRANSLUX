'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitSale } from './actions';

interface PartOpt { id: number; label: string; price: number }
interface Opt { id: number; label: string }
interface Line { part_id: number | ''; qty: number; unit_price: number }

export default function MagazinClient({ shopId, clients, parts }: { shopId: number; clients: Opt[]; parts: PartOpt[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<number | ''>('');
  const [series, setSeries] = useState('MG');
  const [number, setNumber] = useState('');
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1, unit_price: 0 }]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ docId: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const onPart = (i: number, pid: number) => { const p = parts.find((x) => x.id === pid); setLine(i, { part_id: pid, unit_price: p?.price || 0 }); };
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  async function submit() {
    setErr(null); setBusy(true); setReceipt(null);
    try {
      const r = await submitSale({ warehouse_id: shopId, client_id: clientId ? Number(clientId) : null, invoice_series: series, invoice_number: number, lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty, unit_price: l.unit_price })) });
      setReceipt({ docId: r.docId, total: r.total });
      setLines([{ part_id: '', qty: 1, unit_price: 0 }]); setNumber('');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Vânzare către client</h2>
      <div className="row">
        <div className="form-row"><label>Client</label><select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}><option value="">— client ocazional —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div className="form-row"><label>Serie</label><input value={series} onChange={(e) => setSeries(e.target.value)} /></div>
        <div className="form-row"><label>Număr</label><input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <table>
        <thead><tr><th>Piesă</th><th style={{ width: 100 }}>Cant.</th><th style={{ width: 140 }}>Preț vânzare</th><th className="num" style={{ width: 110 }}>Sumă</th><th style={{ width: 36 }}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><select value={l.part_id} onChange={(e) => onPart(i, Number(e.target.value))}><option value="">— alege piesa —</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td><input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} /></td>
              <td className="num">{(l.qty * l.unit_price).toFixed(2)}</td>
              <td>{lines.length > 1 && <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button className="btn" onClick={() => setLines((ls) => [...ls, { part_id: '', qty: 1, unit_price: 0 }])}>+ Adaugă poziție</button>
        <strong>Total: {total.toFixed(2)} lei</strong>
      </div>
      {err && <div className="alert danger" style={{ marginTop: 12 }}>{err}</div>}
      {receipt && <div className="alert ok" style={{ marginTop: 12 }}>Чек #{receipt.docId} emis. Total {receipt.total.toFixed(2)} lei. (factura fiscală: vezi tab e-Factura)</div>}
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? 'Se emite…' : 'Emite factură + чек'}</button>
    </div>
  );
}
