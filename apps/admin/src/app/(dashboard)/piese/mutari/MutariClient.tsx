'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitTransfer, receiveTransfer, loadTransferLines } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';

interface Opt { id: number; label: string }
interface Line { part_id: number | ''; part_label?: string; qty: number }
interface Transit { id: number; from_name: string; to_name: string; line_count: number }

// `warehouses` = toate (pentru „Către"); `fromWarehouses` = doar depozitul contului legat (pentru „De la"). Egale la ADMIN/cont extins.
type TLine = { partId: number; name: string; article: string | null; qty: number };
type TBody = { rows: TLine[]; truncated: boolean };

export default function MutariClient({ warehouses, fromWarehouses, transit }: { warehouses: Opt[]; fromWarehouses: Opt[]; transit: Transit[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(fromWarehouses[0]?.id || 0);
  const [to, setTo] = useState(warehouses.find((w) => w.id !== (fromWarehouses[0]?.id || 0))?.id || 0);
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1 }]);
  const [busy, setBusy] = useState(false);
  // Poziţiile mutărilor „pe drum", încărcate la cerere (o mutare are rar mai mult de câteva rânduri).
  const [openId, setOpenId] = useState<number | null>(null);
  const [tLines, setTLines] = useState<Record<number, TBody | 'loading' | 'error'>>({});
  async function toggleTransit(id: number) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!tLines[id] || tLines[id] === 'error') {
      setTLines((m) => ({ ...m, [id]: 'loading' }));
      try {
        const rows = await loadTransferLines(id);
        setTLines((m) => ({ ...m, [id]: rows }));
      } catch {
        // Stare explicită de eroare: ștergerea cheii ar fi lăsat rândul pe „Se încarcă…" la nesfârșit,
        // fiindcă „lipsă" și „în curs" arătau la fel.
        setTLines((m) => ({ ...m, [id]: 'error' }));
      }
    }
  }

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
                <Fragment key={t.id}>
                  <tr onClick={() => toggleTransit(t.id)} style={{ cursor: 'pointer' }} title="Apasă ca să vezi ce piese conține">
                    <td>{t.from_name}</td><td>{t.to_name}</td>
                    <td className="num">{openId === t.id ? '▾' : '▸'} {t.line_count}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-primary" disabled={busy} onClick={() => receive(t.id)} style={{ padding: '6px 14px' }}>Confirmă primirea</button>
                    </td>
                  </tr>
                  {openId === t.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <div style={{ padding: '10px 14px', borderLeft: '4px solid var(--accent, #0d5c4d)' }}>
                          {tLines[t.id] === 'loading' && <span className="muted">Se încarcă…</span>}
                          {tLines[t.id] === 'error' && <span className="muted">Nu am putut încărca poziţiile. Apasă din nou.</span>}
                          {typeof tLines[t.id] === 'object' && ((tLines[t.id] as TBody).rows.length === 0
                            ? <span className="muted">Fără poziții.</span>
                            : (
                              <table>
                                <thead><tr><th>Piesă</th><th className="num">Cantitate</th></tr></thead>
                                <tbody>
                                  {(tLines[t.id] as TBody).rows.map((l, i) => (
                                    <tr key={`${l.partId}-${i}`}>
                                      <td>{l.name}{l.article && <span className="muted"> · {l.article}</span>}</td>
                                      <td className="num">{l.qty}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Trimite o mutare nouă</h2>
        <div className="row">
          <div className="form-row"><label>De la depozit</label><select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{fromWarehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
          <div className="form-row"><label>Către depozit</label><select value={to} onChange={(e) => setTo(Number(e.target.value))}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>
        </div>
        <table>
          <thead><tr><th>Piesă</th><th style={{ width: 140 }}>Cantitate</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label} onSelect={(o) => setLine(i, { part_id: o ? o.id : '', part_label: o?.label })} placeholder="— caută piesa —" /></td>
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
