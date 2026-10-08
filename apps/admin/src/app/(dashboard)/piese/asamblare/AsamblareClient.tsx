'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SearchSelect from '@/components/SearchSelect';
import { searchParts } from '../search-parts';
import { trimiteAsamblare } from './actions';

type Opt = { id: number; label: string };
type Linie = { part_id: number | ''; label?: string; qty: number };

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AsamblareClient({ warehouses, mechanics }: { warehouses: Opt[]; mechanics: Opt[] }) {
  const router = useRouter();
  const [whSursa, setWhSursa] = useState<number | ''>(warehouses[0]?.id ?? '');
  const [whDest, setWhDest] = useState<number | ''>(warehouses[0]?.id ?? '');
  const [produsId, setProdusId] = useState<number | ''>('');
  const [produsLabel, setProdusLabel] = useState('');
  const [produsQty, setProdusQty] = useState(1);
  const [mechanicId, setMechanicId] = useState<number | ''>('');
  const [manopera, setManopera] = useState('');
  const [note, setNote] = useState('');
  const [linii, setLinii] = useState<Linie[]>([{ part_id: '', qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gata, setGata] = useState<string | null>(null);

  const setLinie = (i: number, patch: Partial<Linie>) =>
    setLinii((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const completate = linii.filter((l) => l.part_id && Number(l.qty) > 0);
  const potTrimite = !busy && produsId !== '' && whSursa !== '' && whDest !== '' && completate.length > 0;

  async function trimite() {
    if (!potTrimite) return;
    setBusy(true); setErr(null); setGata(null);
    try {
      const r = await trimiteAsamblare({
        whSursa: Number(whSursa), whDest: Number(whDest),
        produsId: Number(produsId), produsQty: Number(produsQty) || 1,
        mechanicId: mechanicId === '' ? null : Number(mechanicId),
        manopera, note,
        componente: completate.map((l) => ({ part_id: Number(l.part_id), qty: Number(l.qty) })),
      });
      setGata(`Asamblare #${r.doc_id}: componente ${lei(r.cost_componente)} lei + manoperă ${lei(r.manopera)} lei = `
        + `${lei(r.cost_total)} lei. Costul unei bucăți: ${lei(r.cost_unitar)} lei.`);
      setProdusId(''); setProdusLabel(''); setProdusQty(1); setManopera(''); setNote('');
      setLinii([{ part_id: '', qty: 1 }]);
      router.refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Asamblare nouă</h2>

      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="form-row" style={{ minWidth: 190 }}>
          <label>Componentele se iau din</label>
          <select value={whSursa} onChange={(e) => setWhSursa(e.target.value === '' ? '' : Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ minWidth: 190 }}>
          <label>Produsul intră în</label>
          {/* Poate fi același depozit sau altul — în cazul real al Marianei chiar diferă: piesele din
              magazin, motorul reparat la Briceni. */}
          <select value={whDest} onChange={(e) => setWhDest(e.target.value === '' ? '' : Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 260 }}>
          <label>Piesa care rezultă</label>
          <SearchSelect searchFn={searchParts} value={produsId} selectedLabel={produsLabel}
            onSelect={(o) => { setProdusId(o ? o.id : ''); setProdusLabel(o?.label ?? ''); }}
            placeholder="— caută piesa care iese —" />
        </div>
        <div className="form-row" style={{ width: 110 }}>
          <label>Câte bucăți</label>
          <input type="number" min={1} step="any" value={produsQty}
            onChange={(e) => setProdusQty(Number(e.target.value))} />
        </div>
      </div>

      <table className="has-combo" style={{ marginTop: 12 }}>
        <thead><tr><th>Componentă</th><th style={{ width: 110 }}>Cantitate</th><th style={{ width: 60 }}></th></tr></thead>
        <tbody>
          {linii.map((l, i) => (
            <tr key={i}>
              <td>
                <SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.label}
                  onSelect={(o) => setLinie(i, { part_id: o ? o.id : '', label: o?.label })}
                  placeholder="— caută piesa consumată —" />
              </td>
              <td><input type="number" min={0} step="any" value={l.qty}
                onChange={(e) => setLinie(i, { qty: Number(e.target.value) })} /></td>
              <td>
                {linii.length > 1 && (
                  <button type="button" className="btn" style={{ padding: '2px 8px' }} title="Șterge rândul"
                    onClick={() => setLinii((ls) => ls.filter((_, j) => j !== i))}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" style={{ marginTop: 8 }}
        onClick={() => setLinii((ls) => [...ls, { part_id: '', qty: 1 }])}>+ Adaugă componentă</button>

      <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <div className="form-row" style={{ minWidth: 190 }}>
          <label>Lăcătuș <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(opțional)</span></label>
          <select value={mechanicId} onChange={(e) => setMechanicId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">—</option>
            {mechanics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ width: 140 }}>
          <label>Manoperă, lei</label>
          {/* Manopera NU e marfă: nu are stoc, dar intră în costul produsului. De aceea e o sumă pe
              document, nu o linie în tabel. */}
          <input type="number" min={0} step="0.01" value={manopera}
            onChange={(e) => setManopera(e.target.value)} placeholder="0" style={{ textAlign: 'right' }} />
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 220 }}>
          <label>Comentariu</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: reparație motor OM906" />
        </div>
      </div>

      {err && <div className="alert danger" style={{ marginTop: 12 }}>{err}</div>}
      {gata && <div className="alert ok" style={{ marginTop: 12 }}>{gata}</div>}

      <button className="btn btn-primary btn-lg" style={{ marginTop: 14 }} disabled={!potTrimite} onClick={trimite}>
        {busy ? 'Se salvează…' : 'Asamblează'}
      </button>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        Componentele ies pe FIFO din depozitul-sursă, cu costurile lor reale. Produsul intră cu suma lor
        plus manopera. La asamblare nu se poate lucra peste stoc.
      </p>
    </div>
  );
}
