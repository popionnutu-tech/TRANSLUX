'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import SearchSelect from '@/components/SearchSelect';
import { searchUsedParts } from '../search-parts';
import { submitDonor, loadUsedHint } from './actions';

type Opt = { id: number; label: string };
type Line = { uid: string; part_id: number | ''; label?: string; qty: number; unit_cost: string; hint: number | null };

let seq = 0;
const blank = (): Line => ({ uid: `d${++seq}`, part_id: '', qty: 1, unit_cost: '', hint: null });

const lei = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DonorClient({ warehouses, vehicles, nrUzate }: { warehouses: Opt[]; vehicles: Opt[]; nrUzate: number }) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Lacăt sincron, ca la rashod: `busy` e stare, deci două clicuri în aceeași bătaie de ceas trec amândouă,
  // iar mișcările de stoc sunt append-only — o intrare dublată se corectează doar prin inventariere.
  const lock = useRef(false);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const filled = lines.filter((l) => l.part_id && l.qty > 0);
  const total = filled.reduce((s, l) => s + l.qty * (Number(l.unit_cost) || 0), 0);

  // Sugestia se cere DUPĂ alegerea piesei, nu la tastare: e o citire pe server, iar valoarea nu se schimbă
  // cât timp piesa rămâne aceeași. Nu se impune — se pune în câmp doar dacă omul n-a scris deja ceva.
  async function alegePiesa(i: number, o: { id: number; label: string } | null) {
    setLine(i, { part_id: o ? o.id : '', label: o?.label, hint: null });
    if (!o) return;
    try {
      const h = await loadUsedHint(o.id);
      setLines((ls) => ls.map((l, j) =>
        j === i && l.part_id === o.id ? { ...l, hint: h, unit_cost: l.unit_cost || (h == null ? '' : String(h)) } : l));
    } catch { /* sugestia e un ajutor, nu o condiție — dacă nu vine, omul scrie suma */ }
  }

  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setErr(null); setDone(null);
    try {
      const r = await submitDonor({
        warehouse_id: warehouseId,
        vehicle_id: vehicleId ? Number(vehicleId) : null,
        note,
        lines: filled.map((l) => ({ part_id: Number(l.part_id), qty: l.qty, unit_cost: Number(l.unit_cost) || 0 })),
      });
      setDone(`Înregistrat: ${r.lines} ${r.lines === 1 ? 'poziție' : 'poziții'}, ${lei(r.total)} lei. Piesele sunt pe stoc.`);
      setLines([blank()]); setNote(''); setVehicleId('');
    } catch (e: any) { setErr(e.message); }
    finally { lock.current = false; setBusy(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h2>Intrare piese б/у</h2>

      {/* Fără nicio piesă marcată б/у, ecranul n-are ce primi. Un „Nimic găsit" la căutare n-ar fi explicat
          de ce — omul ar fi crezut că e o defecțiune, nu că lipsește un pas dinainte. */}
      {nrUzate === 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          <strong>Nu există încă nicio piesă б/у în catalog.</strong> Piesa uzată e un articol separat, cu
          prețul ei. Deschide <Link href="/piese/catalog">Catalogul</Link>, adaugă piesa (sau copiaz-o de la
          cea nouă), bifează <em>„Piesă б/у"</em> și alege căreia îi corespunde. Abia apoi apare aici.
        </div>
      )}

      <div className="row">
        <div className="form-row"><label>Depozit</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>
        <div className="form-row"><label>De pe mașina</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— nu se știe —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ flex: 1, minWidth: 220 }}><label>Notă</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. autobuz casat, dezmembrat 12.09" />
        </div>
      </div>

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Piesa б/у</th>
            <th style={{ width: 110 }}>Cantitate</th>
            <th style={{ width: 160 }}>Valoare / buc</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.uid}>
              <td>
                <SearchSelect searchFn={searchUsedParts} value={l.part_id} selectedLabel={l.label}
                  onSelect={(o) => alegePiesa(i, o)}
                  placeholder="— caută piesa б/у —"
                  autoFocus={focusUid === l.uid} onFocused={() => setFocusUid(null)} />
                {l.part_id !== '' && l.hint == null && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    Nu pot propune o valoare — piesa n-are legătură cu una nouă, sau aceea n-a fost niciodată
                    cumpărată. Scrie suma.
                  </div>
                )}
              </td>
              <td><input type="number" min={1} step="any" value={l.qty}
                onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
              <td>
                <input type="number" min={0} step="any" value={l.unit_cost}
                  onChange={(e) => setLine(i, { unit_cost: e.target.value })} placeholder="0" />
                {l.hint != null && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    propus: {lei(l.hint)} lei{' '}
                    {Number(l.unit_cost) !== l.hint && (
                      <button type="button" className="btn" style={{ padding: '0 6px', fontSize: 11 }}
                        onClick={() => setLine(i, { unit_cost: String(l.hint) })}>pune</button>
                    )}
                  </div>
                )}
              </td>
              <td>
                {lines.length > 1 && (
                  <button type="button" className="btn" style={{ padding: '4px 8px' }}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} title="Șterge rândul">×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="btn" style={{ marginTop: 8 }}
        onClick={() => { const b = blank(); setLines((ls) => [...ls, b]); setFocusUid(b.uid); }}>
        + Adaugă poziție
      </button>

      <div className="row" style={{ marginTop: 12, alignItems: 'center', gap: 12 }}>
        <div><strong>Total: {lei(total)} lei</strong></div>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !filled.length}>
          {busy ? 'Se înregistrează…' : `Înregistrează (${filled.length})`}
        </button>
      </div>

      {err && <div className="alert error" style={{ marginTop: 10 }}>{err}</div>}
      {done && <div className="alert ok" style={{ marginTop: 10 }}>{done}</div>}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Aici intră <strong>numai</strong> piese marcate б/у în <Link href="/piese/catalog">Catalog</Link>. Una nouă se înregistrează prin Prihod,
        cu factură și furnizor. Valoarea propusă e costul mediu al piesei noi corespunzătoare, înmulțit cu
        procentul grupei — o sugestie, nu o regulă: o piesă de pe un autobuz casat poate fi ca nouă sau bună
        de aruncat, iar diferența n-o știe programul.
      </p>
    </div>
  );
}
