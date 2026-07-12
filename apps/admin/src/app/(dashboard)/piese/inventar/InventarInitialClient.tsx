'use client';

import { useState } from 'react';
import { saveInitialInventory, loadLayout } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';
import PartForm from '@/components/PartForm';
import PieseDepotMap from '@/components/PieseDepotMap';

interface Opt { id: number; label: string }
interface Row { part_id: number | ''; part_label?: string; qty: number; location: string }

const emptyRow = (): Row => ({ part_id: '', qty: 1, location: '' });

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

  const setRow = (i: number, patch: Partial<Row>) => setRows((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

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
      const payload = filled.map((l) => ({ part_id: Number(l.part_id), counted_qty: l.qty, location_label: l.location.trim() }));
      if (!payload.length) throw new Error('Adaugă cel puțin o piesă cu cantitate > 0.');
      const res = await saveInitialInventory(warehouseId, payload);
      setLayout(res.layout); // harta proaspătă vine din server action — fără router.refresh redundant
      if (res.locationError) {
        // Succes parțial: stocul e salvat, dar locațiile nu s-au fixat. Păstrăm rândurile ca să reîncerce amplasarea.
        setMsg({ t: 'danger', m: `Stocul s-a salvat (${res.saved} piese), dar locațiile nu s-au fixat: ${res.locationError}. Reîncearcă salvarea.` });
      } else {
        setMsg({ t: 'ok', m: `Salvat: ${res.saved} piese pe stoc · ${res.placed} locații amplasate.` });
        setRows([emptyRow()]);
      }
    } catch (e: any) { setMsg({ t: 'danger', m: e.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h2>Inventar inițial — pornește depozitul de la zero</h2>
        <p className="muted" style={{ marginTop: -6 }}>
          Scanează sau caută piesa, pune <strong>cantitatea faptică</strong> și <strong>locația</strong> (format <code>SECȚIE-RAFT-POLIȚĂ</code>, ex. <code>A-12-3</code>).
          Piesa nouă intră pe stoc cu cost 0 — costul real vine din Prihod (recepție).
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="form-row"><label>Depozit</label>
            <select value={warehouseId} onChange={(e) => onWarehouse(Number(e.target.value))}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead><tr><th>Piesă</th><th style={{ width: 110 }}>Cant.</th><th style={{ width: 200 }}>Locație</th><th style={{ width: 36 }}></th></tr></thead>
          <tbody>
            {rows.map((l, i) => {
              const dup = !!l.part_id && dupIds.has(Number(l.part_id));
              return (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <SearchSelect searchFn={searchParts} value={l.part_id} selectedLabel={l.part_label}
                          onSelect={(o) => setRow(i, { part_id: o ? o.id : '', part_label: o?.label })}
                          placeholder="— scanează / caută piesa —" />
                      </div>
                      <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => setNewPartFor(i)} title="Adaugă o piesă care nu există încă în catalog">+ nouă</button>
                    </div>
                    {dup && <span className="badge warn" style={{ marginTop: 4, display: 'inline-block' }}>piesă repetată</span>}
                  </td>
                  <td><input type="number" min={1} value={l.qty} onChange={(e) => setRow(i, { qty: Number(e.target.value) })} /></td>
                  <td><input value={l.location} onChange={(e) => setRow(i, { location: e.target.value })} placeholder="A-12-3" /></td>
                  <td>{rows.length > 1 && <button className="btn" onClick={() => setRows((ls) => ls.filter((_, j) => j !== i))} style={{ padding: '4px 10px' }}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button className="btn" onClick={() => setRows((ls) => [...ls, emptyRow()])}>+ Adaugă poziție</button>
          <span className="muted">{filled.length} piese · {placedCount} cu locație</span>
        </div>
        {msg && <div className={`alert ${msg.t}`} style={{ marginTop: 12 }}>{msg.m}</div>}
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy || !warehouseId} onClick={submit}>
          {busy ? 'Se salvează…' : 'Salvează inventarul inițial'}
        </button>
      </div>

      {layout && (
        <div className="card">
          <h2>Harta depozitului <span className="muted" style={{ fontWeight: 400 }}>· se construiește pe măsură ce amplasezi piesele</span></h2>
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
