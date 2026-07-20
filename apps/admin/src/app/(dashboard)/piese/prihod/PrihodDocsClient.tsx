'use client';

import { Fragment, useState, useTransition } from 'react';
import { listReceiptDocs, loadReceiptLines } from './actions';

export type ReceiptDoc = {
  id: number; createdAt: string; warehouseId: number;
  series: string | null; number: string | null; supplier: string | null;
  positions: number; total: number; creator: string | null;
};
type Line = { partId: number; name: string; article: string | null; qty: number; unitCost: number; total: number };
type Opt = { id: number; label: string };

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const dt = (s: string) => s ? new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const docLabel = (d: ReceiptDoc) => [d.series, d.number].filter(Boolean).join(' ') || '—';

// Tab „Documente" din Prihod: jurnalul recepțiilor. Filtru pe depozit (adminul; contul legat vede doar depozitul lui)
// + perioadă. Click pe un rând → liniile documentului (piesă, cantitate, cost). Fără migrație — citește piese_stock_documents.
export default function PrihodDocsClient({ warehouses, initialDocs }: { warehouses: Opt[]; initialDocs: ReceiptDoc[] }) {
  const [docs, setDocs] = useState<ReceiptDoc[]>(initialDocs);
  const [wh, setWh] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<number, Line[] | 'loading'>>({});
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const showDepot = warehouses.length > 1; // contul legat are un singur depozit → nu are ce filtra
  const whName = (id: number) => warehouses.find((w) => w.id === id)?.label || '—';

  function run() {
    setErr(''); setExpanded(null);
    start(async () => {
      try { setDocs(await listReceiptDocs({ warehouseId: wh === '' ? null : Number(wh), from: from || null, to: to || null })); }
      catch (e: any) { setErr(e?.message || 'Eroare la încărcare'); }
    });
  }

  async function toggle(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!lines[id]) {
      setLines((m) => ({ ...m, [id]: 'loading' }));
      try { const data = await loadReceiptLines(id); setLines((m) => ({ ...m, [id]: data })); }
      catch { setLines((m) => { const c = { ...m }; delete c[id]; return c; }); setErr('Nu am putut încărca liniile documentului.'); }
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
        {showDepot && (
          <div className="form-row" style={{ minWidth: 170 }}>
            <label>Depozit</label>
            <select value={wh} onChange={(e) => setWh(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— toate —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
        )}
        <div className="form-row"><label>De la</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-row"><label>Până la</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={run} disabled={pending}>{pending ? 'Caut…' : 'Filtrează'}</button>
        <span className="muted">{docs.length >= 200 ? 'primele 200 documente (restrânge perioada)' : `${docs.length} documente`}</span>
      </div>

      {err && <div className="alert danger" style={{ marginTop: 12 }}>{err}</div>}

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Data</th><th>Furnizor</th><th>Serie/Nr</th>{showDepot && <th>Depozit</th>}
            <th className="num">Poziții</th><th className="num">Total</th><th>Cine</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <Fragment key={d.id}>
              <tr onClick={() => toggle(d.id)} style={{ cursor: 'pointer', background: expanded === d.id ? 'var(--hover, #f6f7f9)' : undefined }}>
                <td className="muted">{dt(d.createdAt)}</td>
                <td><strong>{d.supplier || '—'}</strong></td>
                <td className="muted">{docLabel(d)}</td>
                {showDepot && <td className="muted">{whName(d.warehouseId)}</td>}
                <td className="num">{d.positions}</td>
                <td className="num"><strong>{lei(d.total)}</strong></td>
                <td className="muted">{d.creator || '—'}</td>
              </tr>
              {expanded === d.id && (
                <tr key={`${d.id}-lines`}>
                  <td colSpan={showDepot ? 7 : 6} style={{ padding: 0 }}>
                    <div style={{ padding: '10px 14px', borderLeft: '4px solid var(--ok, #16a34a)' }}>
                      {lines[d.id] === 'loading' || !lines[d.id]
                        ? <span className="muted">Se încarcă…</span>
                        : (lines[d.id] as Line[]).length === 0
                          ? <span className="muted">Fără linii.</span>
                          : (
                            <table>
                              <thead><tr><th>Piesă</th><th>Articul</th><th className="num">Cant.</th><th className="num">Cost unit.</th><th className="num">Total</th></tr></thead>
                              <tbody>
                                {(lines[d.id] as Line[]).map((l) => (
                                  <tr key={l.partId}>
                                    <td>{l.name}</td>
                                    <td className="muted" style={{ fontSize: 12 }}>{l.article || '—'}</td>
                                    <td className="num">{l.qty}</td>
                                    <td className="num">{lei(l.unitCost)}</td>
                                    <td className="num">{lei(l.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {docs.length === 0 && <tr><td colSpan={showDepot ? 7 : 6} className="muted">Niciun document de prihod pentru filtrul ales.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
