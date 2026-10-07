'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitSale, incarcaCec } from './actions';
import CecModal, { type Cec } from './CecModal';
import SearchSelect from '@/components/SearchSelect';

interface PartOpt { id: number; label: string; price: number; search?: string }
interface Opt { id: number; label: string }
interface Line { part_id: number | ''; qty: number; unit_price: number }
type Shortage = { part_id: number; name: string; cerut: number; stoc: number; disponibil: number; lipsa: number };

export default function MagazinClient({ shopId, clients, parts, canOverrideStock }: { shopId: number; clients: Opt[]; parts: PartOpt[]; canOverrideStock: boolean }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<number | ''>('');
  // Rândul tocmai adăugat primește cursorul, ca omul să scrie mai departe fără să ia mâna de pe
  // tastatură. Cerut de Eduard pentru TOATE ecranele: „раз добавил строку курсор чтоб автоматически
  // был в поле выбора позиции. Это во всех разделах не только в приходе."
  // Marcajul se șterge după focus (`onFocused`) fiindcă rândurile au `key={i}`: la o inserție în mijloc
  // (butonul de copiere a rândului) un indice rămas în urmă ar duce cursorul pe rândul greșit.
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [series, setSeries] = useState('MG');
  const [number, setNumber] = useState('');
  const [lines, setLines] = useState<Line[]>([{ part_id: '', qty: 1, unit_price: 0 }]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ docId: number; total: number; rest: number | null; plata?: string } | null>(null);
  // Cecul se cere DUPĂ vânzare, la apăsare — nu odată cu ea: dacă citirea lui ar cădea, vânzarea e deja
  // scrisă și nu are voie să pară eșuată. Clientul primește bonul la o a doua apăsare, nu marfa înapoi.
  const [cec, setCec] = useState<Cec | null>(null);
  const [cecBusy, setCecBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Lipsa la vânzare (migr. 379). Până acum magazinul putea vinde marfă inexistentă fără ca nimeni să afle.
  const [short, setShort] = useState<Shortage[] | null>(null);
  // Casa de marcat cere modul de plată la închiderea bonului, iar numerarul și cardul sunt totaluri
  // SEPARATE pe raportul Z. Fără ele, raportul nostru de zi n-ar putea fi pus alături de banda fiscală.
  const [plata, setPlata] = useState<'NUMERAR' | 'CARD' | 'TRANSFER'>('NUMERAR');
  const [incasat, setIncasat] = useState('');

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const onPart = (i: number, pid: number) => { const p = parts.find((x) => x.id === pid); setLine(i, { part_id: pid, unit_price: p?.price || 0 }); };
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  async function submit(allowShort = false) {
    setErr(null); setBusy(true); setReceipt(null);
    try {
      const r = await submitSale({ warehouse_id: shopId, client_id: clientId ? Number(clientId) : null, invoice_series: series, invoice_number: number, lines: lines.filter((l) => l.part_id).map((l) => ({ part_id: Number(l.part_id), qty: l.qty, unit_price: l.unit_price })), allow_short: allowShort, plata, incasat: plata === 'NUMERAR' && incasat ? Number(incasat) : null });
      if (!r.ok) {
        // Nu s-a vândut nimic — baza a anulat tot. Omul vede ce lipsește și decide.
        if (!r.shortages.length) { setErr('Stocul s-a schimbat între timp. Încearcă din nou.'); return; }
        setShort(r.shortages as Shortage[]);
        return;
      }
      setShort(null);
      setReceipt({ docId: r.docId!, total: r.total!, rest: r.rest ?? null, plata: r.plata });
      setLines([{ part_id: '', qty: 1, unit_price: 0 }]); setNumber(''); setIncasat('');
      router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2>Vânzare către client</h2>
      <div className="row">
        <div className="form-row"><label>Client</label><SearchSelect options={clients} value={clientId} onSelect={(o) => setClientId(o ? o.id : '')} placeholder="— client ocazional —" /></div>
        <div className="form-row"><label>Serie</label><input value={series} onChange={(e) => setSeries(e.target.value)} /></div>
        <div className="form-row"><label>Număr</label><input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <table className="has-combo">
        <thead><tr><th>Piesă</th><th style={{ width: 100 }}>Cant.</th><th style={{ width: 140 }}>Preț vânzare</th><th className="num" style={{ width: 110 }}>Sumă</th><th style={{ width: 36 }}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><SearchSelect options={parts} value={l.part_id} onSelect={(o) => { if (o) onPart(i, o.id); else setLine(i, { part_id: '', unit_price: 0 }); }} placeholder="— caută piesa —" autoFocus={focusIdx === i} onFocused={() => setFocusIdx(null)} /></td>
              <td><input type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              {/* Prețul de vânzare e număr ÎNTREG (regula Marianei, 06.10). Pasul de 1 și rotunjirea la
                  scriere țin ecranul în acord cu baza, care rotunjește oricum — altfel omul ar vedea
                  1763,49 pe ecran și 1763 pe bon. */}
              <td><input type="number" min={0} step={1} value={l.unit_price}
                onChange={(e) => setLine(i, { unit_price: Math.round(Number(e.target.value) || 0) })} /></td>
              <td className="num">{(l.qty * l.unit_price).toFixed(2)}</td>
              <td>{lines.length > 1 && <button className="btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <button className="btn" onClick={() => { setLines((ls) => [...ls, { part_id: '', qty: 1, unit_price: 0 }]); setFocusIdx(lines.length); }}>+ Adaugă poziție</button>
        <strong>Total: {total.toFixed(2)} lei</strong>
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: 'flex-end', gap: 12 }}>
        <div className="form-row" style={{ minWidth: 150 }}>
          <label>Plata</label>
          <select value={plata} onChange={(e) => setPlata(e.target.value as typeof plata)}>
            <option value="NUMERAR">Numerar</option>
            <option value="CARD">Card</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </div>
        {/* Suma primită are rost doar la numerar: la card se încasează exact, iar un câmp care cere
            „cât ai primit" ar fi o întrebare fără răspuns. */}
        {plata === 'NUMERAR' && (
          <>
            <div className="form-row" style={{ minWidth: 150 }}>
              <label>Primit de la client</label>
              <input type="number" min={0} step="0.01" value={incasat} placeholder={total.toFixed(2)}
                onChange={(e) => setIncasat(e.target.value)} />
            </div>
            <div style={{ paddingBottom: 6 }}>
              {incasat !== '' && (Number(incasat) < total
                ? <span style={{ color: 'var(--danger, #c0392b)' }}>lipsesc {(total - Number(incasat)).toFixed(2)} lei</span>
                : <strong style={{ fontSize: 18 }}>Rest: {(Number(incasat) - total).toFixed(2)} lei</strong>)}
            </div>
          </>
        )}
      </div>
      {short && (
        <div className="alert warn" style={{ marginTop: 12 }}>
          <strong>Nu ajunge marfa în magazin.</strong> Nu s-a vândut nimic.
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Piesa</th><th style={{ width: 90 }}>Ceri</th><th style={{ width: 90 }}>Pe stoc</th><th style={{ width: 90 }}>Lipsesc</th></tr></thead>
            <tbody>
              {short.map((x) => (
                <tr key={x.part_id}><td>{x.name}</td><td>{x.cerut}</td><td>{x.stoc}</td>
                  <td><span className="badge warn">{x.lipsa}</span></td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12 }}>
            {canOverrideStock
              ? 'Dacă marfa e fizic pe raft și doar recepția n-a fost introdusă, poți vinde — dar magazinul rămâne pe minus până la o inventariere.'
              : 'Verifică raftul. Dacă marfa e acolo, trebuie întâi introdusă recepția — sau cheamă gestionarul.'}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setShort(null)} disabled={busy} autoFocus>Închide și verific</button>
            {canOverrideStock ? (
              <button className="btn btn-primary" onClick={() => { setShort(null); submit(true); }} disabled={busy}>
                Vând oricum
              </button>
            ) : (
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                Doar gestionarul sau administratorul poate vinde peste stoc.
              </span>
            )}
          </div>
        </div>
      )}

      {err && <div className="alert danger" style={{ marginTop: 12 }}>{err}</div>}
      {receipt && (
        <div className="alert ok" style={{ marginTop: 12 }}>
          Чек #{receipt.docId} emis. Total {receipt.total.toFixed(2)} lei
          {receipt.plata === 'NUMERAR' && receipt.rest != null && <> · <strong>rest {receipt.rest.toFixed(2)} lei</strong></>}
          . (factura fiscală: vezi tab e-Factura)
          <button className="btn btn-primary" style={{ marginLeft: 10, padding: '3px 12px' }} disabled={cecBusy}
            onClick={async () => {
              setCecBusy(true); setErr(null);
              try { setCec(await incarcaCec(receipt.docId) as unknown as Cec); }
              catch (e: any) { setErr(e.message); }
              finally { setCecBusy(false); }
            }}>
            {cecBusy ? 'Se pregătește…' : '🧾 Tipărește cecul'}
          </button>
        </div>
      )}
      {cec && <CecModal cec={cec} onClose={() => setCec(null)} />}
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => submit()}>{busy ? 'Se emite…' : 'Emite factură + чек'}</button>
    </div>
  );
}
