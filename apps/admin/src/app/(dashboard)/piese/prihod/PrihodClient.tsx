'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitReceipt } from './actions';
import { receiptLinesSum, countableLines, totalMatches } from '@/lib/piese-receipt';
import { loadPart } from '../part-actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';
import PartForm, { type PartFormValues } from '@/components/PartForm';
import { suggestPartLocation, savePartLocation } from '../part-actions';
import { LOCATION_EXAMPLE, LOCATION_FORMAT, locationError } from '@/lib/piese-location';

interface Opt { id: number; label: string }
interface Line { part_id: number | ''; part_label?: string; qty: number; unit_cost: number; sum: number }

const r2 = (n: number) => Math.round(n * 100) / 100;     // rotunjire la 2 zecimale (lei/bani)
const r4 = (n: number) => Math.round(n * 10000) / 10000; // preț unitar derivat din sumă: 4 zecimale, ca qty×preț ≈ suma introdusă exact
const blankLine = (): Line => ({ part_id: '', qty: 1, unit_cost: 0, sum: 0 });

export default function PrihodClient({ warehouses, suppliers, groups }: { warehouses: Opt[]; suppliers: Opt[]; groups: Opt[] }) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const warehouseLabel = warehouses.find((w) => w.id === warehouseId)?.label || 'depozit';
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [note, setNote] = useState(''); // comentariu la factură (se salvează pe document)
  const [invoiceTotal, setInvoiceTotal] = useState(''); // suma de control de pe factura furnizorului (migr. 288)
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const [newPartFor, setNewPartFor] = useState<number | null>(null); // indexul poziției care adaugă o piesă nouă
  // Locația piesei noi: se propune după grupă (unde stau deja surorile ei), dar rămâne editabilă.
  const [newLoc, setNewLoc] = useState('');
  const [locHint, setLocHint] = useState<string | null>(null);
  const [locErrMsg, setLocErrMsg] = useState('');
  // Contor de cereri: dacă utilizatorul schimbă grupa de două ori, răspunsul mai vechi nu are voie să
  // suprascrie sugestia celei noi.
  const sugSeq = useRef(0);

  function closeNewPart() { setNewPartFor(null); setNewLoc(''); setLocHint(null); setLocErrMsg(''); }

  async function askSuggestion(gid: number) {
    const seq = ++sugSeq.current;
    const sug = await suggestPartLocation(warehouseId, gid).catch(() => null);
    if (seq !== sugSeq.current) return; // a venit prea târziu — grupa s-a schimbat între timp
    setLocHint(sug);
    setNewLoc((cur) => (cur.trim() === '' && sug ? sug : cur));
  }
  const [editPart, setEditPart] = useState<{ index: number; initial: PartFormValues } | null>(null); // editare piesă chiar din recepție
  const [editBusy, setEditBusy] = useState<number | null>(null); // indexul rândului care încarcă piesa pentru editare

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Copiază rândul i cu toate datele (piesă, cantitate, preț, sumă) și îl inserează imediat dedesubt.
  const copyLine = (i: number) => setLines((ls) => { const next = [...ls]; next.splice(i + 1, 0, { ...ls[i] }); return next; });
  // Însumăm DOAR liniile pe care le trimitem serverului, rotunjite pe linie — sursă unică (piese-receipt.ts),
  // ca ecranul să nu poată arăta „se potrivește" pentru o sumă pe care serverul o respinge.
  const total = receiptLinesSum(countableLines(lines).map((l) => ({ qty: l.qty, unit_cost: l.unit_cost })));
  // Suma de control: diferența se arată LIVE, cât încă se poate corecta. Serverul o reimpune la salvare.
  const declared = invoiceTotal.trim() === '' ? null : Number(invoiceTotal);
  const totalOk = totalMatches(declared, countableLines(lines).map((l) => ({ qty: l.qty, unit_cost: l.unit_cost })));
  const totalDiff = declared != null && Number.isFinite(declared) ? total - declared : 0;

  // Deschide formularul de editare pentru piesa deja aleasă pe rândul i (corectezi denumire/cod/etc. fără să pleci în Catalog).
  async function openEditPart(i: number, partId: number) {
    setEditBusy(i);
    try {
      const p = await loadPart(partId);
      if (!p) { alert('Piesa nu a fost găsită.'); return; }
      setEditPart({ index: i, initial: {
        id: Number(p.id), group_id: p.group_id as number | string | undefined,
        name_long: (p.name_long as string) ?? '', name_ro: (p.name_ro as string) ?? '',
        manufacturer: (p.manufacturer as string) ?? '', model: (p.model as string) ?? '',
        article_code: (p.article_code as string) ?? '', oem_code: (p.oem_code as string) ?? '',
        // TOATE codurile piesei, nu doar cel de pe etichetă: altfel deschiderea unei piese cu două
        // coduri și salvarea ei l-ar fi șters tăcut pe al doilea.
        barcodes: (p.barcodes as string[]) ?? [], unit: (p.unit as string) ?? 'buc', is_for_sale: !!p.is_for_sale,
      } });
    } catch { alert('Nu am putut încărca piesa pentru editare. Reîncearcă.'); }
    finally { setEditBusy(null); }
  }

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const r = await submitReceipt({
        warehouse_id: warehouseId, supplier_id: supplierId ? Number(supplierId) : null, invoice_series: series, invoice_number: number, note,
        invoice_total: declared,
        lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty, unit_cost: l.unit_cost })),
      });
      setMsg({ t: 'ok', m: `Prihod #${r.docId} înregistrat. Stocul a crescut.` });
      // setInvoiceTotal: fără el, totalul facturii precedente ar rămâne în câmp și ar bloca următoarea recepție.
      setLines([blankLine()]); setSeries(''); setNumber(''); setNote(''); setInvoiceTotal('');
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
        <div className="form-row"><label>Total factură (control)</label><input type="number" min={0} step="0.01" value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} placeholder="opțional" style={{ textAlign: 'right' }} /></div>
        <div className="form-row" style={{ flex: 1, minWidth: 220 }}><label>Comentariu la factură</label><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="observații (opțional)" /></div>
      </div>
      <p className="muted" style={{ marginTop: 4, marginBottom: 8 }}>Completează fie <strong>Prețul unitar</strong>, fie <strong>Suma</strong> pe rând — celălalt se calculează automat (sumă ÷ cantitate = preț unitar).</p>
      <table>
        <thead><tr><th>Piesă</th><th style={{ width: 110 }}>Cant.</th><th style={{ width: 140 }}>Preț unitar</th><th style={{ width: 130 }}>Sumă</th><th style={{ width: 84 }}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label} onSelect={(o) => setLine(i, { part_id: o ? o.id : '', part_label: o?.label })} placeholder="— caută piesa (denumire, cod, articol) —" /></div>
                  {l.part_id !== '' && <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', whiteSpace: 'nowrap' }} disabled={editBusy === i} onClick={() => openEditPart(i, Number(l.part_id))} title="Corectează denumirea / codul de bare / datele piesei alese, direct din recepție">{editBusy === i ? '…' : '✎ Editează'}</button>}
                  <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => { setNewPartFor(i); if (groups[0]) askSuggestion(Number(groups[0].id)); }} title="Adaugă o piesă care nu există încă în catalog">+ nouă</button>
                </div>
              </td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => { const qty = Number(e.target.value); setLine(i, { qty, sum: r2(qty * l.unit_cost) }); }} /></td>
              <td><input type="number" min={0} step="0.0001" value={l.unit_cost || ''} onChange={(e) => { const uc = Number(e.target.value); setLine(i, { unit_cost: uc, sum: r2(l.qty * uc) }); }} placeholder="preț" /></td>
              <td><input type="number" min={0} step="0.01" value={l.sum || ''} onChange={(e) => { const sum = Number(e.target.value); setLine(i, { sum, unit_cost: l.qty > 0 ? r4(sum / l.qty) : 0 }); }} placeholder="sumă" style={{ textAlign: 'right' }} /></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn-outline" onClick={() => copyLine(i)} style={{ padding: '4px 9px' }} title="Copiază rândul (aceeași piesă mai jos) și modifică doar ce ai nevoie">⧉</button>
                  {lines.length > 1 && <button type="button" className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 9px' }} title="Șterge rândul">×</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button className="btn" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Adaugă poziție</button>
        <strong>Total: {total.toFixed(2)} lei</strong>
        {declared != null && Number.isFinite(declared) && (
          totalOk
            ? <span className="badge ok" style={{ marginLeft: 10 }}>✓ se potrivește cu factura</span>
            : <span className="badge warn" style={{ marginLeft: 10 }}>
                {totalDiff > 0 ? 'peste factură cu ' : 'sub factură cu '}{Math.abs(totalDiff).toFixed(2)} lei
              </span>
        )}
      </div>
      {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12 }}>{msg.m}</div>}
      {/* Butonul se blochează cât suma nu se potrivește — serverul refuză oricum, dar aici se vede DE CE. */}
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy || !totalOk} onClick={submit}>{busy ? 'Se înregistrează…' : 'Confirmă prihodul'}</button>
      {!totalOk && <p className="muted" style={{ textAlign: 'center', marginTop: 8, marginBottom: 0 }}>Suma liniilor nu coincide cu totalul facturii. Verifică o cantitate sau un preț, ori golește câmpul de control.</p>}

      {newPartFor !== null && (
        <div onClick={closeNewPart} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 900, width: '100%', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Piesă nouă în catalog</h2>
            <p className="muted" style={{ marginTop: -6 }}>Se adaugă în catalog cu <strong>stoc 0</strong> și se completează automat pe poziția curentă. Cantitatea și costul le pui în tabelul de prihod.</p>
            <PartForm
              groups={groups}
              onGroupChange={askSuggestion}
              disabled={!!locationError(newLoc)}
              onSaved={async (p) => {
                const idx = newPartFor;
                const loc = newLoc.trim();
                if (idx !== null) setLine(idx, { part_id: p.id, part_label: p.label });
                // Locația se scrie DUPĂ piesă (are nevoie de part_id). Piesa e deja în catalog și pusă pe rând,
                // deci un eșec aici nu trebuie să piardă recepția — dar TREBUIE spus, altfel omul nu află
                // niciodată că locația n-a intrat și că trebuie pusă din Catalog.
                if (loc) {
                  try { await savePartLocation(p.id, warehouseId, { location_label: loc }); }
                  catch (e: any) { setMsg({ t: 'danger', m: `Piesa a fost creată, dar locația nu s-a salvat: ${e?.message || 'eroare'}. Pune-o din Catalog.` }); }
                }
                closeNewPart();
              }}
              onCancel={closeNewPart}
            >
              <div className="form-group" style={{ marginBottom: 0, minWidth: 170 }}>
                <label>Locație în {warehouseLabel}</label>
                <input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder={LOCATION_EXAMPLE}
                  style={locationError(newLoc) ? { borderColor: 'var(--danger, #c0392b)' } : undefined} />
                {locationError(newLoc)
                  ? <div style={{ fontSize: 11, color: 'var(--danger, #c0392b)' }}>{locationError(newLoc)} — corectează sau golește</div>
                  : locHint
                    ? <div className="muted" style={{ fontSize: 11 }}>grupa stă pe rândul {locHint} — completează polița și celula</div>
                    : <div className="muted" style={{ fontSize: 11 }}>{LOCATION_FORMAT}, opțional</div>}
              </div>
            </PartForm>
          </div>
        </div>
      )}

      {editPart && (
        <div onClick={() => setEditPart(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 900, width: '100%', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Editează piesa</h2>
            <p className="muted" style={{ marginTop: -6 }}>Corectezi denumirea, codul de bare sau alte date. Modificarea se salvează în <strong>catalog</strong> și se actualizează pe rândul de recepție. Nu schimbă cantitatea/costul din recepție.</p>
            <PartForm
              groups={groups}
              initial={editPart.initial}
              onSaved={(p) => { setLine(editPart.index, { part_label: p.label }); setEditPart(null); }}
              onCancel={() => setEditPart(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
