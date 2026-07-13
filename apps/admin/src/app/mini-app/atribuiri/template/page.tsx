'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { C, ready, api } from '../ui';
import VehiclePicker from '../VehiclePicker';

// Editorul șablonului săptămânal: uzină → rute×schimburi × Luni…Duminică.
// Celulă = chip mașină; tap = picker. Afectează doar zilele ne-materializate.

interface Uzina { id: string; label: string }
interface GridRow {
  factory_route_id: string;
  shift_number: number;
  route_label: string;
  cells: Record<number, { vehicle_id: string; plate: string } | null>;
}

const ZILE = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];

export default function TemplatePage() {
  const [uzine, setUzine] = useState<Uzina[] | null>(null);
  const [uzina, setUzina] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridRow[] | null>(null);
  const [cell, setCell] = useState<{ row: GridRow; weekday: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { ready(); }, []);

  useEffect(() => {
    api('/template').then(async (r) => {
      if (!r.ok) { setErr('Acces doar pentru manageri.'); return; }
      const j = await r.json();
      setUzine(j.uzine as Uzina[]);
      if ((j.uzine as Uzina[]).length) setUzina((j.uzine as Uzina[])[0].id);
    }).catch(() => setErr('Rețea indisponibilă.'));
  }, []);

  const load = useCallback(() => {
    if (!uzina) return;
    setGrid(null);
    api(`/template?uzina=${encodeURIComponent(uzina)}`).then(async (r) => {
      if (r.ok) setGrid(((await r.json()).grid as GridRow[]));
    }).catch(() => { /* rămâne loader */ });
  }, [uzina]);

  useEffect(load, [load]);

  async function pick(vehicleId: string | null) {
    if (!cell) return;
    const { row, weekday } = cell;
    setCell(null);
    await api('/template', {
      method: 'POST',
      body: JSON.stringify({ factoryRouteId: row.factory_route_id, shiftNumber: row.shift_number, weekday, vehicleId }),
    }).catch(() => null);
    load();
  }

  if (err) return <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>{err}</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Link href="/mini-app/atribuiri" style={{ textDecoration: 'none', color: C.accent, fontSize: 22 }}>‹</Link>
        <h1 style={{ fontSize: 18, margin: 0 }}>Șablon săptămânal</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {uzine?.map((u) => (
          <button
            key={u.id} onClick={() => setUzina(u.id)}
            style={{
              padding: '7px 12px', borderRadius: 16, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${uzina === u.id ? C.accent : C.border}`,
              background: uzina === u.id ? C.accent : C.panel, color: uzina === u.id ? '#fff' : C.text,
            }}
          >{u.label}</button>
        ))}
      </div>

      {!grid && uzina && <div style={{ color: C.muted, padding: 12 }}>Se încarcă…</div>}
      {grid && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, color: C.muted, fontWeight: 600 }}>Cursa</th>
                {ZILE.map((z) => <th key={z} style={{ padding: 4, color: C.muted, fontWeight: 600 }}>{z}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => (
                <tr key={`${row.factory_route_id}:${row.shift_number}`} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 4px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {row.route_label}
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
                    <td key={wd} style={{ padding: 2, textAlign: 'center' }}>
                      <button
                        onClick={() => setCell({ row, weekday: wd })}
                        style={{
                          padding: '4px 5px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'ui-monospace, monospace', minWidth: 44,
                          border: `1px solid ${row.cells[wd] ? C.border : '#eee2d9'}`,
                          background: row.cells[wd] ? C.panel : '#fdf9f3',
                          color: row.cells[wd] ? C.text : C.muted,
                        }}
                      >{row.cells[wd]?.plate ?? '—'}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cell && uzina && (
        <VehiclePicker
          direction={uzina}
          defaultVehicleId={cell.row.cells[cell.weekday]?.vehicle_id ?? null}
          currentVehicleId={cell.row.cells[cell.weekday]?.vehicle_id ?? null}
          onPick={pick}
          onClose={() => setCell(null)}
        />
      )}
    </div>
  );
}
