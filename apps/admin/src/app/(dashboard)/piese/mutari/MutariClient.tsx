'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitTransfer, receiveTransfer } from './actions';

interface Opt { id: number; label: string }
interface Line { part_id: number | ''; qty: number }
interface Transit { id: number; from_name: string; to_name: string; line_count: number }

export default function MutariClient({ warehouses, parts, transit }: { warehouses: Opt[]; parts: Opt[]; transit: Transit[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(warehouses[0]?.id || 0);
  const [to, setTo] = useState(warehouses[1]?.id || 0);
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function send() {
    setBusy(true); setMsg(null);
    try { await submitTransfer({ from_warehouse_id: from, to_warehouse_id: to, lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty })) }); setMsg({ t: 'ok', m: 'Mutare trimisă. Acum e „pe drum" — de confirmat la primire.' }); setLines([{ part_id: '', qty: 1 }]); router.refresh(); }
    catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }
  async function receive(id: number) {
    setBusy(true); setMsg(null);
    try { await receiveTransfer(id); setMsg({ t: 'ok', m: 'Mutare primită. Stocul a intrat în depozitul destinație.' }); router.refresh(); }
    catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      {msg && <div className={`alert ${msg.t}`}>{msg.m}</div>}
      <div className="card">
        <h2>„Pe drum" — de confirmat la primire</h2>
        {transit.length === 0 ? <div className="empty">Nicio mutare în așteptare.</div> : (
          <table>
            <thead><tr><th>De la</th><th>La</th><th className="num">Poziții</th><th></th></tr></thead>
            <tbody>
              {transit.map((t) => (
                <tr key={t.id}><td>{t.from_name}</td><td>{t.to_name}</td><td className="num">{t.line_count}</td><td><button className="btn btn-primary" disabled={busy} onClick={() => receive(t.id)} style={{ padding: '6px 14px' }}>Confirmă primirea</button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Trimite o mutare nouă</h2>
        <div className="row">
          <div className="form-row"><label>De la depozit</label><select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          <div className="form-row"><label>Către depozit</label><select value={to} onChange={(e) => setTo(Number(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
        </div>
        <table>
          <thead><tr><th>Piesă</th><th style={{ width: 140 }}>Cantitate</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><select value={l.part_id} onChange={(e) => setLine(i, { part_id: e.target.value ? Number(e.target.value) : '' })}><option value="">— alege piesa —</option>{parts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></td>
                <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                <td>{lines.length > 1 && <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setLines((ls) => [...ls, { part_id: '', qty: 1 }])} style={{ marginTop: 10 }}>+ Adaugă poziție</button>
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={send}>Trimite mutarea</button>
      </div>
    </>
  );
}
