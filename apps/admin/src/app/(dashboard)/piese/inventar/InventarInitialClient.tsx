'use client';

import { useState, useRef } from 'react';
import { saveInitialInventory, loadLayout } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';
import PartForm from '@/components/PartForm';
import PieseDepotMap from '@/components/PieseDepotMap';

interface Opt { id: number; label: string }
interface Row { part_id: number | ''; part_label?: string; qty: number; cost: number; location: string }

const emptyRow = (): Row => ({ part_id: '', qty: 1, cost: 0, location: '' });

// „Inventar de la zero" — pornirea unui depozit gol (pilot Marcel la MAGAZIN). Calchiat pe PrihodClient:
// rânduri [caută/scanează piesă | cantitate | locație] + „+ nouă" (PartForm inline) + harta rafturilor live.
// Scanerul USB merge din oficiu: tastează în SearchSelect → searchParts caută pe barcode/articol/oem → Enter.
export default function InventarInitialClient({ warehouses, groups, initialLayout }: {
  warehouses: Opt[]; groups: Opt[]; initialLayout: any;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || 0);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [layout, setLayout] = useState<any>(initialLayout);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'danger'; m: string } | null>(null);
  const [newPartFor, setNewPartFor] = useState<number | null>(null); // indexul poziției care adaugă o piesă nouă
  const [focusIdx, setFocusIdx] = useState<number | null>(null);      // rândul de focusat (nou adăugat) pentru scanare rapidă
  const idemRef = useRef('');                                         // cheie de idempotență a recepției cu cost — stabilă pe retry, resetată la succes

  const setRow = (i: number, patch: Partial<Row>) => setRows((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // Adaugă un rând nou care MOȘTENEȘTE locația ultimului rând (numeri un raft întreg fără s-o re-scrii) și-l focusează.
  function addRow() {
    setRows((ls) => [...ls, { part_id: '', qty: 1, cost: 0, location: ls[ls.length - 1]?.location || '' }]);
    setFocusIdx(rows.length); // noul index = lungimea curentă (înainte de adăugare)
  }

  // Selectarea unei piese: dacă e pe ultimul rând, adaugă automat un rând nou (cu locația moștenită) și-l focusează,
  // ca scanarea/căutarea să curgă piesă după piesă fără să apeși „+ Adaugă poziție".
  function handlePick(i: number, o: { id: number; label: string } | null) {
    setRows((ls) => {
      const next: Row[] = ls.map((l, j) => (j === i ? { ...l, part_id: o ? o.id : '', part_label: o?.label } : l));
      if (o && i === ls.length - 1) next.push({ part_id: '', qty: 1, cost: 0, location: ls[i].location || '' });
      return next;
    });
    if (o && i === rows.length - 1) setFocusIdx(rows.length);
  }

  async function onWarehouse(id: number) {
    setWarehouseId(id);
    try { setLayout(await loadLayout(id)); } catch { setLayout(null); }
  }

  // O piesă apare o singură dată în foaie (UNIQUE part_id+warehouse). Evidențiem duplicatele înainte de salvare.
  const dupIds = (() => {
    const seen = new Set<number>(); const dup = new Set<number>();
    for (const l of rows) { const p = Number(l.part_id); if (!p) continue; if (seen.has(p)) dup.add(p); else seen.add(p); }
    return dup;
  })();

  const filled = rows.filter((l) => l.part_id && l.qty > 0);
  const placedCount = filled.filter((l) => l.location.trim()).length;

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      if (dupIds.size) throw new Error('Ai aceeași piesă pe mai multe rânduri — las-o o singură dată.');
      const payload = filled.map((l) => ({ part_id: Number(l.part_id), counted_qty: l.qty, location_label: l.location.trim(), unit_cost: l.cost > 0 ? l.cost : 0 }));
      if (!payload.length) throw new Error('Adaugă cel puțin o piesă cu cantitate > 0.');
      // Cheie de idempotență generată o singură dată pe „intenția de salvare"; se păstrează pe retry (ca o
      // recepție deja comisă la o pană de rețea să nu se dubleze) și se resetează abia după succes.
      if (!idemRef.current) idemRef.current = crypto.randomUUID();
      const res = await saveInitialInventory(warehouseId, payload, idemRef.current);
      setLayout(res.layout); // harta proaspătă vine din server action
      const costNote = res.alreadyReceived ? ' (recepția cu cost era deja înregistrată — nu s-a dublat)' : (res.received ? ` (${res.received} cu cost, ca recepție)` : '');
      setMsg({ t: 'ok', m: `Salvat: ${res.saved} piese pe stoc${costNote} · ${res.placed} locații amplasate.` });
      setRows([emptyRow()]); setFocusIdx(null); idemRef.current = ''; // lot nou → cheie nouă
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h2>Inventar inițial — pornește depozitul de la zero</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Scanează sau caută piesa, pune <strong>cantitatea faptică</strong> și <strong>locația</strong> (format <code>SECȚIE-RAFT-POLIȚĂ</code>, ex. <code>A-12-3</code>).
          Locația se <strong>păstrează pe rândul următor</strong> — numeri un raft întreg fără s-o re-scrii. <strong>Costul e opțional</strong>: dacă îl completezi, piesa intră ca recepție (valoare corectă) — <strong>introdu piesa cu cost o singură dată</strong>; dacă îl lași gol, intră cu cost 0 (îl pui mai târziu din Prihod / Revizuire cost).
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="form-row"><label>Depozit</label>
            <select value={warehouseId} onChange={(e) => onWarehouse(Number(e.target.value))}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead><tr><th>Piesă</th><th style={{ width: 90 }}>Cant.</th><th style={{ width: 130 }}>Cost achiziție</th><th style={{ width: 180 }}>Locație</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {rows.map((l, i) => {
              const dup = !!l.part_id && dupIds.has(Number(l.part_id));
              return (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label}
                          onSelect={(o) => handlePick(i, o)} autoFocus={focusIdx === i}
                          placeholder="— scanează / caută piesa —" />
                      </div>
                      <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setNewPartFor(i)} title="Adaugă o piesă care nu există încă în catalog">+ nouă</button>
                    </div>
                    {dup && <span className="badge warn" style={{ marginTop: 4, display: 'inline-block' }}>piesă repetată</span>}
                  </td>
                  <td><input type="number" min={1} value={l.qty} onChange={(e) => setRow(i, { qty: Number(e.target.value) })} /></td>
                  <td><input type="number" min={0} step="0.01" value={l.cost || ''} onChange={(e) => setRow(i, { cost: Number(e.target.value) })} placeholder="opțional" /></td>
                  <td><input value={l.location} onChange={(e) => setRow(i, { location: e.target.value })} placeholder="A-12-3" /></td>
                  <td>{rows.length > 1 && <button className="btn" onClick={() => { setRows((ls) => ls.filter((_, j) => j !== i)); setFocusIdx(null); }} style={{ padding: '4px 10px' }}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button className="btn" onClick={addRow}>+ Adaugă poziție</button>
          <span className="muted">{filled.length} piese · {placedCount} cu locație</span>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12 }}>{msg.m}</div>}
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy || !warehouseId} onClick={submit}>
          {busy ? 'Se salvează…' : 'Salvează inventarul inițial'}
        </button>
      </div>

      {layout && (
        <div className="card">
          <h2>Harta depozitului <span className="muted" style={{ fontWeight: 400 }}>· {layout.totalTypes ?? 0} piese deja amplasate în acest depozit</span></h2>
          <PieseDepotMap layout={layout} />
        </div>
      )}

      {newPartFor !== null && (
        <div onClick={() => setNewPartFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 900, width: '100%', margin: 0 }}>
            <h2 style={{ marginTop: 0 }}>Piesă nouă în catalog</h2>
            <p className="muted" style={{ marginTop: -6 }}>Se adaugă în catalog cu <strong>stoc 0</strong> și se completează automat pe rândul curent. Cantitatea și locația le pui în tabel.</p>
            <PartForm
              groups={groups}
              onSaved={(p) => { setRow(newPartFor, { part_id: p.id, part_label: p.label }); setNewPartFor(null); }}
              onCancel={() => setNewPartFor(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
