'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSheet, saveInventory } from './actions';
import PieseDepotMap from '@/components/PieseDepotMap';

interface Opt { id: number; label: string }
interface Row { part_id: number; label: string; current: number; counted: number; section: string; rack: string }

export default function InventarClient({ warehouses }: { warehouses: Opt[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [rows, setRows] = useState<Row[]>([]);
  const [layout, setLayout] = useState<any>(null);
  const [section, setSection] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);

  async function load() {
    setBusy(true); setMsg(null);
    const sheet = await loadSheet(warehouseId);
    setRows(sheet.rows.map((s: any) => ({ ...s, counted: s.current })));
    setLayout(sheet.layout); setSection(''); setLoaded(true); setBusy(false);
  }
  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const counts = rows.filter((r) => r.counted !== r.current).map((r) => ({ part_id: r.part_id, counted_qty: r.counted }));
      if (!counts.length) { setMsg({ t: 'ok', m: 'Nicio diferență — totul se potrivește.' }); setBusy(false); return; }
      const res = await saveInventory(warehouseId, counts);
      setMsg({ t: 'ok', m: `Inventariere salvată: ${res.diffs} diferențe corectate (ca mișcări, fără ștergeri).` });
      router.refresh(); await load();
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  const sections: string[] = Array.from(new Set(rows.map((r) => r.section))).sort();
  const visible = section ? rows.filter((r) => r.section === section) : rows;
  const diffCount = rows.filter((r) => r.counted !== r.current).length;

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="form-row"><label>Depozit de numărat</label><select value={warehouseId} onChange={(e) => { setWarehouseId(Number(e.target.value)); setLoaded(false); }}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          <button className="btn btn-primary" disabled={busy} onClick={load}>Deschide foaia de numărare</button>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12, marginBottom: 0 }}>{msg.m}</div>}
      </div>
      {loaded && layout && (
        <>
          <div className="card">
            <h2>Alege secția de numărat azi</h2>
            <div className="pill-row" style={{ marginBottom: 14 }}>
              <button className={`btn${section === '' ? ' btn-primary' : ''}`} onClick={() => setSection('')} style={{ padding: '7px 14px' }}>Tot depozitul</button>
              {sections.map((s) => <button key={s} className={`btn${section === s ? ' btn-primary' : ''}`} onClick={() => setSection(s)} style={{ padding: '7px 14px' }}>Secția {s}</button>)}
            </div>
            <PieseDepotMap layout={layout} highlightSection={section || null} />
          </div>
          <div className="card">
            <h2>{section ? `Foaie — Secția ${section}` : 'Foaie — tot depozitul'} <span className="muted" style={{ fontWeight: 400 }}>({visible.length} poziții)</span></h2>
            <table>
              <thead><tr><th>Raft</th><th>Piesă</th><th className="num">În program</th><th className="num" style={{ width: 150 }}>Numărat faptic</th><th className="num">Diferență</th></tr></thead>
              <tbody>
                {visible.map((r) => {
                  const idx = rows.indexOf(r); const d = r.counted - r.current;
                  return (
                    <tr key={r.part_id}>
                      <td><span className="badge gray">{r.section}-{r.rack}</span></td>
                      <td>{r.label}</td>
                      <td className="num">{r.current}</td>
                      <td className="num"><input type="number" value={r.counted} onChange={(e) => setRows((rs) => rs.map((x, j) => j === idx ? { ...x, counted: Number(e.target.value) } : x))} style={{ textAlign: 'right' }} /></td>
                      <td className="num">{d === 0 ? <span className="muted">0</span> : <span className={`badge ${d > 0 ? 'info' : 'warn'}`}>{d > 0 ? '+' : ''}{d}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>Salvează inventarierea ({diffCount} diferențe în tot depozitul)</button>
          </div>
        </>
      )}
    </>
  );
}
