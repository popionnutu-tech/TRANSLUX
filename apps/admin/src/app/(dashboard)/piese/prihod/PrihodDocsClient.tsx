'use client';

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { listReceiptDocs, loadReceiptLines } from './actions';
import ReceiptEditModal from './ReceiptEditModal';

export type ReceiptDoc = {
  id: number; createdAt: string; warehouseId: number;
  series: string | null; number: string | null; note: string | null; supplier: string | null;
  positions: number; total: number; creator: string | null;
  invoiceTotal: number | null; // suma de control declarată (migr. 288); null = introdusă fără verificare
};
type Line = { partId: number; name: string; article: string | null; qty: number; unitCost: number; total: number };
type Opt = { id: number; label: string };

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
const dt = (s: string) => s ? new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const docLabel = (d: ReceiptDoc) => [d.series, d.number].filter(Boolean).join(' ') || '—';

// Tab „Documente" din Prihod: jurnalul recepțiilor. Filtre pe depozit (adminul; contul legat vede doar depozitul lui),
// furnizor, perioadă + o căsuță de căutare rapidă pe serie/număr/comentariu (îngustare live + căutare pe server la
// „Filtrează", ca să găsești și facturi mai vechi de primele 200). Click pe un rând → liniile documentului.
export default function PrihodDocsClient({ warehouses, suppliers, initialDocs }: { warehouses: Opt[]; suppliers: Opt[]; initialDocs: ReceiptDoc[] }) {
  const [docs, setDocs] = useState<ReceiptDoc[]>(initialDocs);
  // Tab-ul rămâne montat (nu se re-montează la comutare) → re-sincronizează lista când server-ul aduce
  // documente proaspete (ex. după `router.refresh()` la o recepție nouă), altfel jurnalul ar rămâne învechit.
  useEffect(() => { setDocs(initialDocs); }, [initialDocs]);
  const [wh, setWh] = useState<number | ''>('');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [q, setQ] = useState(''); // căutare serie / număr / comentariu (îngustare live peste lista încărcată)
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<number, Line[] | 'loading'>>({});
  const [editId, setEditId] = useState<number | null>(null); // documentul deschis pentru modificare
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const showDepot = warehouses.length > 1; // contul legat are un singur depozit → nu are ce filtra
  const whName = (id: number) => warehouses.find((w) => w.id === id)?.label || '—';
  const cols = (showDepot ? 7 : 6) + 1; // +1 = coloana de acțiuni (Modifică)

  // Îngustare instant (client) pe serie / număr / comentariu, peste documentele deja încărcate — pentru feedback
  // pe măsură ce tastezi. „Filtrează" trimite același text la server, ca să caute și dincolo de primele 200.
  // ⚠️ Menține câmpurile aici SINCRONIZATE cu predicatul de căutare din receiptDocs (lib/piese.ts): series/number/note.
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return docs;
    return docs.filter((d) => [d.series, d.number, d.note].some((x) => (x || '').toLowerCase().includes(s)));
  }, [docs, q]);

  // Trimite filtrele la server. `searchVal` e explicit (nu citit din `q`) ca „✕" să poată reîncărca lista
  // completă (search=null) imediat, fără să aștepte actualizarea asincronă a state-ului q.
  function runWith(searchVal: string) {
    setErr(''); setExpanded(null);
    start(async () => {
      try {
        setDocs(await listReceiptDocs({
          warehouseId: wh === '' ? null : Number(wh),
          supplierId: supplierId === '' ? null : Number(supplierId),
          search: searchVal.trim() || null,
          from: from || null, to: to || null,
        }));
      } catch (e: any) { setErr(e?.message || 'Eroare la încărcare'); }
    });
  }
  const run = () => runWith(q);

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
          <div className="form-row" style={{ minWidth: 160 }}>
            <label>Depozit</label>
            <select value={wh} onChange={(e) => setWh(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— toate —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
        )}
        <div className="form-row" style={{ minWidth: 180 }}>
          <label>Furnizor</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— toți —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ minWidth: 190, flex: 1 }}>
          <label>Serie / Număr / comentariu</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="caută în serie / număr / comentariu" />
        </div>
        <div className="form-row"><label>De la</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="form-row"><label>Până la</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={run} disabled={pending}>{pending ? 'Caut…' : 'Filtrează'}</button>
        {q.trim() && <button className="btn btn-outline" onClick={() => { setQ(''); runWith(''); }} disabled={pending} title="Șterge căutarea și reîncarcă lista completă">✕</button>}
        <span className="muted">{shown.length} {shown.length === 1 ? 'document' : 'documente'}{docs.length >= 200 ? ' · primele 200, restrânge perioada' : ''}</span>
      </div>

      {err && <div className="alert danger" style={{ marginTop: 12 }}>{err}</div>}

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Data</th><th>Furnizor</th><th>Serie/Nr · comentariu</th>{showDepot && <th>Depozit</th>}
            <th className="num">Poziții</th><th className="num">Total</th><th>Cine</th><th></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <Fragment key={d.id}>
              <tr onClick={() => toggle(d.id)} style={{ cursor: 'pointer', background: expanded === d.id ? 'var(--hover, #f6f7f9)' : undefined }}>
                <td className="muted">{dt(d.createdAt)}</td>
                <td><strong>{d.supplier || '—'}</strong></td>
                <td className="muted">
                  {docLabel(d)}
                  {d.note && <div style={{ fontSize: 11, marginTop: 2, maxWidth: 260, whiteSpace: 'normal', color: 'var(--muted, #6b7280)' }} title={d.note}>💬 {d.note}</div>}
                </td>
                {showDepot && <td className="muted">{whName(d.warehouseId)}</td>}
                <td className="num">{d.positions}</td>
                <td className="num">
                  <strong>{lei(d.total)}</strong>
                  {/* Martorul sumei de control: fără el, verificarea de la introducere n-ar fi vizibilă nicăieri
                      ulterior — iar dispariția lui (document corectat cu câmpul golit) ar trece neobservată. */}
                  {d.invoiceTotal == null
                    ? <div className="muted" style={{ fontSize: 11 }}>fără control</div>
                    : Math.abs(d.total - d.invoiceTotal) <= 0.01
                      ? <div style={{ fontSize: 11, color: 'var(--ok, #16a34a)' }}>✓ verificat</div>
                      : <div style={{ fontSize: 11, color: 'var(--danger, #c0392b)' }}>≠ factura {lei(d.invoiceTotal)}</div>}
                </td>
                <td className="muted">{d.creator || '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-outline" style={{ padding: '2px 8px', whiteSpace: 'nowrap' }} onClick={() => setEditId(d.id)} title="Modifică documentul (antet și, dacă marfa nu e folosită, liniile)">✎ Modifică</button>
                </td>
              </tr>
              {expanded === d.id && (
                <tr key={`${d.id}-lines`}>
                  <td colSpan={cols} style={{ padding: 0 }}>
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
          {shown.length === 0 && <tr><td colSpan={cols} className="muted">{q.trim() ? 'Niciun document pentru căutarea rapidă. Apasă „Filtrează" ca să cauți și în arhivă.' : 'Niciun document de prihod pentru filtrul ales.'}</td></tr>}
        </tbody>
      </table>

      {editId != null && (
        <ReceiptEditModal
          docId={editId}
          suppliers={suppliers}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); setExpanded(null); setLines({}); run(); }}
        />
      )}
    </div>
  );
}
