'use client';

import { useEffect, useState } from 'react';
import SearchSelect from '@/components/SearchSelect';
import { searchParts } from '../search-parts';
import { loadReceiptForEdit, saveReceiptHeader, saveReceiptLines } from './actions';
import { receiptLinesSum, countableLines, totalMatches } from '@/lib/piese-receipt';

type Opt = { id: number; label: string };
type Line = { part_id: number | ''; label?: string; qty: number; unit_cost: number };
type ConsumedBy = { docType: string; series: string | null; number: string | null; createdAt: string | null; qty: number };
type Fields = Record<string, string | number | boolean | null>;
type Hist = { at: string; action: string; who: string | null; before: Fields | null; after: Fields | null; notes: string | null; docId: number | null };

const FIELD_RO: Record<string, string> = {
  furnizor: 'furnizor', serie: 'serie', numar: 'număr', comentariu: 'comentariu',
  total_factura: 'total factură', pozitii: 'poziții', replaces_doc_id: 'corectat din documentul',
  rol: 'rol', edit_window_days: 'zile de corecție', sees_all_invoices: 'vede toate facturile', warehouse_id: 'depozit',
};
const val = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'da' : 'nu') : String(v));

// Diferența, din stările structurate. Nu dintr-o frază salvată în bază: aceea putea fi tăiată la plafon
// (pierzând tocmai schimbarea totalului) sau fabricată de un comentariu care conținea separatorii.
function renderDiff(h: Hist): string {
  const after = h.after || {};
  const before = h.before || {};
  const keys = Object.keys(after).filter((k) => k !== 'replaces_doc_id');
  if (!keys.length && before.replaces_doc_id != null) return `corectat din documentul #${before.replaces_doc_id}`;
  return keys.map((k) => {
    const label = FIELD_RO[k] || k;
    return k in before ? `${label}: ${val(before[k])} → ${val(after[k])}` : `${label}: ${val(after[k])}`;
  }).join('; ');
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const dt = (s: string | null) => s ? new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const ACTION_RO: Record<string, string> = { EDIT_HEADER: 'Antet modificat', EDIT_LINES: 'Poziții corectate', CREATE: 'Creat', EDIT: 'Corectat (sistem)' };
const docTypeRo = (t: string) => ({ SALE: 'Vânzare', ISSUE: 'Casare', TRANSFER: 'Mutare' } as Record<string, string>)[t] || t;

// Ecran de modificare a unei recepții (#1b). Antetul (furnizor/serie/număr/comentariu) se poate modifica cât timp
// utilizatorul are drept (ADMIN oricând; ceilalți doar documentele de azi). LINIILE se modifică DOAR dacă marfa nu
// a fost încă vândută/casată/mutată; altfel se arată pe ce document a plecat + rămâne editabil doar antetul.
// Gărzile reale (rol + depozit + zi + neconsumat) sunt reimpuse pe server la salvare.
export default function ReceiptEditModal({ docId, suppliers, onClose, onSaved }: {
  docId: number; suppliers: Opt[]; onClose: () => void; onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [note, setNote] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState(''); // suma de control (migr. 288) — se ÎNCARCĂ, ca salvarea să n-o șteargă
  const [lines, setLines] = useState<Line[]>([]);
  const [canEditLines, setCanEditLines] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [consumedBy, setConsumedBy] = useState<ConsumedBy[]>([]);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  // Istoricul modificărilor (migr. 291). Se încarcă odată cu documentul: dacă cineva a schimbat ceva
  // înainte, cel care deschide ecranul trebuie să vadă asta ÎNAINTE să schimbe și el.
  const [hist, setHist] = useState<Hist[] | null>([]); // null = urma n-a putut fi citită

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await loadReceiptForEdit(docId);
        if (!alive) return;
        setSupplierId(d.header.supplierId ?? '');
        setSeries(d.header.series || '');
        setNumber(d.header.number || '');
        setNote(d.header.note || '');
        setInvoiceTotal(d.header.invoiceTotal == null ? '' : String(d.header.invoiceTotal));
        setCreatedAt(d.header.createdAt);
        setLines(d.lines.map((l) => ({ part_id: l.part_id, label: l.label, qty: l.qty, unit_cost: l.unit_cost })));
        setCanEditLines(d.canEditLines);
        setCanEdit(d.canEdit);
        setConsumedBy(d.consumedBy || []);
        setHist(d.history as Hist[] | null);
      } catch (e: any) { if (alive) setErr(e?.message || 'Eroare la încărcare'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [docId]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const copyLine = (i: number) => setLines((ls) => { const next = [...ls]; next.splice(i + 1, 0, { ...ls[i] }); return next; });
  // ATENȚIE: însumăm DOAR liniile pe care le trimitem serverului (cu piesă aleasă și cantitate > 0) și
  // rotunjim pe linie — altfel ecranul ar arăta „se potrivește" pentru o sumă pe care serverul o respinge.
  const sentLines = countableLines(lines).map((l) => ({ qty: Number(l.qty), unit_cost: Number(l.unit_cost) }));
  const total = receiptLinesSum(sentLines);
  const declared = invoiceTotal.trim() === '' ? null : Number(invoiceTotal);
  const totalOk = totalMatches(declared, sentLines);
  const totalDiff = declared != null && Number.isFinite(declared) ? total - declared : 0;
  const supplierName = supplierId ? (suppliers.find((s) => s.id === supplierId)?.label || `#${supplierId}`) : '—';
  const readOnlyLines = !canEdit || !canEditLines;

  async function saveHeader() {
    setBusy(true); setMsg(null);
    try {
      await saveReceiptHeader(docId, { supplier_id: supplierId ? Number(supplierId) : null, series, number, note, invoice_total: invoiceTotal });
      onSaved(); onClose();
    } catch (e: any) { setMsg({ t: 'danger', m: e?.message || 'Eroare la salvare' }); } finally { setBusy(false); }
  }

  async function saveAll() {
    setBusy(true); setMsg(null);
    try {
      await saveReceiptLines(docId, {
        supplier_id: supplierId ? Number(supplierId) : null, series, number, note, invoice_total: invoiceTotal,
        lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) })),
      });
      onSaved(); onClose();
    } catch (e: any) { setMsg({ t: 'danger', m: e?.message || 'Eroare la salvare' }); } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', zIndex: 1100, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 920, width: '100%', margin: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Modifică recepția <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>#{docId} · {dt(createdAt)}</span></h2>
          <button className="btn btn-outline" onClick={onClose}>Închide</button>
        </div>

        {loading ? <p className="muted">Se încarcă…</p> : err ? <div className="alert danger">{err}</div> : (
          <>
            {!canEdit && (
              <div className="alert" style={{ marginBottom: 12 }}>Doar administratorul poate modifica documente din zile anterioare. Acest document este doar de vizualizat.</div>
            )}
            {canEdit && !canEditLines && (
              <div className="alert" style={{ marginBottom: 12 }}>
                <strong>Marfa din această recepție a fost deja folosită</strong> — nu se pot modifica liniile (cantități / prețuri / piese). Poți modifica doar antetul (furnizor / serie / număr / comentariu).
                {consumedBy.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {consumedBy.map((c, i) => (
                      <li key={i}>{docTypeRo(c.docType)} {[c.series, c.number].filter(Boolean).join(' ')} · {dt(c.createdAt)} · {r2(c.qty)} buc</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Antet */}
            <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="form-row" style={{ minWidth: 200 }}>
                <label>Furnizor</label>
                {canEdit ? <SearchSelect options={suppliers} value={supplierId} onSelect={(o) => setSupplierId(o ? o.id : '')} placeholder="— caută furnizor —" /> : <div>{supplierName}</div>}
              </div>
              <div className="form-row"><label>Serie</label>{canEdit ? <input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="AA" /> : <div>{series || '—'}</div>}</div>
              <div className="form-row"><label>Număr</label>{canEdit ? <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123456" /> : <div>{number || '—'}</div>}</div>
              <div className="form-row"><label>Total factură (control)</label>{canEdit ? <input type="number" min={0} step="0.01" value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} placeholder="opțional" style={{ textAlign: 'right' }} /> : <div>{invoiceTotal || '—'}</div>}</div>
              <div className="form-row" style={{ flex: 1, minWidth: 180 }}><label>Comentariu</label>{canEdit ? <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="observații la factură" /> : <div>{note || '—'}</div>}</div>
            </div>

            {/* Linii */}
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Piesă</th><th style={{ width: 96 }}>Cant.</th><th style={{ width: 130 }}>Preț unitar</th><th style={{ width: 110 }} className="num">Sumă</th>{!readOnlyLines && <th style={{ width: 80 }}></th>}</tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{readOnlyLines ? <span>{l.label || `#${l.part_id}`}</span> : <SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.label} onSelect={(o) => setLine(i, { part_id: o ? o.id : '', label: o?.label })} placeholder="— caută piesa —" />}</td>
                    <td>{readOnlyLines ? l.qty : <input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />}</td>
                    <td>{readOnlyLines ? r2(Number(l.unit_cost)).toFixed(2) : <input type="number" min={0} step="0.0001" value={l.unit_cost || ''} onChange={(e) => setLine(i, { unit_cost: Number(e.target.value) })} placeholder="preț" />}</td>
                    <td className="num">{r2(Number(l.qty) * Number(l.unit_cost)).toFixed(2)}</td>
                    {!readOnlyLines && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn btn-outline" style={{ padding: '4px 8px' }} onClick={() => copyLine(i)} title="Copiază rândul">⧉</button>
                          {lines.length > 1 && <button type="button" className="btn" style={{ padding: '4px 8px' }} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} title="Șterge rândul">×</button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={readOnlyLines ? 4 : 5} className="muted">Fără linii.</td></tr>}
              </tbody>
            </table>
            {!readOnlyLines && <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, { part_id: '', qty: 1, unit_cost: 0 }])}>+ Adaugă poziție</button>}
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <strong>Total: {total.toFixed(2)} lei</strong>
              {declared != null && Number.isFinite(declared) && (
                totalOk
                  ? <span className="badge ok" style={{ marginLeft: 10 }}>✓ se potrivește cu factura</span>
                  : <span className="badge warn" style={{ marginLeft: 10 }}>
                      {totalDiff > 0 ? 'peste factură cu ' : 'sub factură cu '}{Math.abs(totalDiff).toFixed(2)} lei
                    </span>
              )}
            </div>

            {hist === null && (
              <div className="alert warn" style={{ marginTop: 14 }}>Nu am putut citi istoricul modificărilor. Nu înseamnă că documentul n-a fost modificat.</div>
            )}
            {hist !== null && hist.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--pline, #eee)', paddingTop: 10 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>Modificări anterioare</h3>
                <table>
                  <thead><tr><th style={{ width: 130 }}>Când</th><th style={{ width: 150 }}>Cine</th><th>Ce</th></tr></thead>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i}>
                        <td className="muted">{dt(h.at)}</td>
                        <td>{h.who || <span className="muted">necunoscut</span>}</td>
                        <td className="muted">
                          {ACTION_RO[h.action] || h.action}
                          {renderDiff(h) ? ` — ${renderDiff(h)}` : ''}
                          {/* Urma poate veni de pe un document anterior din lanțul de corecții. */}
                          {h.docId != null && h.docId !== docId && <span className="muted"> (doc. #{h.docId})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!totalOk && <div className="alert warn" style={{ marginTop: 10 }}>Suma liniilor nu coincide cu totalul facturii. Corectează o cantitate sau un preț, ori golește câmpul de control.</div>}
            {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 10 }}>{msg.m}</div>}

            {canEdit && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                {readOnlyLines
                  ? <button className="btn btn-primary" disabled={busy || !totalOk} onClick={saveHeader}>{busy ? 'Se salvează…' : 'Salvează antetul'}</button>
                  : <button className="btn btn-primary" disabled={busy || !totalOk} onClick={saveAll}>{busy ? 'Se salvează…' : 'Salvează modificările'}</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
