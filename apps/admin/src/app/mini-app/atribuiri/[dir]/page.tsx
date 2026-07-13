'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { C, ready, api, chisinauDay, shortName, STATUS_BADGE, type AtribuireView } from '../ui';
import VehiclePicker from '../VehiclePicker';
import SoferPicker from '../SoferPicker';

// Ecranul critic de viteză: lista curselor direcției cu chip-ul mașinii —
// un tap deschide picker-ul, un tap în picker salvează (optimist).

function DirectieInner() {
  const params = useParams<{ dir: string }>();
  const search = useSearchParams();
  const dir = decodeURIComponent(params.dir);
  const date = search.get('date') ?? chisinauDay(0);

  const [rows, setRows] = useState<AtribuireView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState<AtribuireView | null>(null);
  const [soferPicker, setSoferPicker] = useState<AtribuireView | null>(null);
  const [foaieRow, setFoaieRow] = useState<AtribuireView | null>(null);
  const [foaieVal, setFoaieVal] = useState('');
  const [foaieErr, setFoaieErr] = useState<string | null>(null);

  useEffect(() => { ready(); }, []);

  const load = useCallback(() => {
    api(`/zi?date=${date}&dir=${encodeURIComponent(dir)}`).then(async (r) => {
      if (!r.ok) { setErr(r.status === 403 ? 'Direcție neautorizată.' : 'Eroare la încărcare.'); return; }
      setRows(((await r.json()).rows as AtribuireView[]));
    }).catch(() => setErr('Rețea indisponibilă.'));
  }, [date, dir]);

  useEffect(load, [load]);

  async function pick(row: AtribuireView, vehicleId: string | null) {
    setPicker(null);
    // optimist: chip-ul se schimbă imediat, revert la eroare
    const prev = rows;
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, vehicle_id: vehicleId, plate: null } : r)));
    const resp = await api('/atribuie', { method: 'POST', body: JSON.stringify({ rowId: row.id, vehicleId }) })
      .catch(() => null);
    if (!resp?.ok) { setRows(prev); return; }
    load();
  }

  async function pickSofer(row: AtribuireView, driverId: string | null) {
    setSoferPicker(null);
    const prev = rows;
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, driver_id: driverId, driver_name: null } : r)));
    const resp = await api('/sofer', { method: 'POST', body: JSON.stringify({ rowId: row.id, driverId }) })
      .catch(() => null);
    if (!resp?.ok) { setRows(prev); return; }
    load();
  }

  async function saveFoaie() {
    if (!foaieRow) return;
    setFoaieErr(null);
    const resp = await api('/foaie', { method: 'POST', body: JSON.stringify({ rowId: foaieRow.id, receiptNr: foaieVal }) })
      .catch(() => null);
    if (!resp) { setFoaieErr('Rețea indisponibilă.'); return; }
    if (!resp.ok) { setFoaieErr(((await resp.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Eroare'); return; }
    setFoaieRow(null);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Link href={`/mini-app/atribuiri`} style={{ textDecoration: 'none', color: C.accent, fontSize: 22 }}>‹</Link>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>{dir === 'interurban' ? 'Interurban' : dir === 'suburban' ? 'Suburban' : dir}</h1>
          <div style={{ fontSize: 13, color: C.muted }}>{date}</div>
        </div>
      </div>

      {err && <div style={{ color: C.bad, padding: 12 }}>{err}</div>}
      {!rows && !err && <div style={{ color: C.muted, padding: 12 }}>Se încarcă…</div>}

      {rows?.map((r) => {
        const badge = STATUS_BADGE[r.status];
        return (
          <div
            key={r.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              background: r.status === 'nepotrivire' ? '#fdf0ef' : C.panel,
              border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.route_label}
              </div>
              <div style={{ fontSize: 12, color: badge?.color ?? C.muted }}>
                {badge?.label ?? r.status}{r.verification_note ? ` · ${r.verification_note}` : ''}
              </div>
            </div>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPicker(r)}
                  style={{
                    padding: '8px 12px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                    fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
                    border: `2px solid ${r.vehicle_id ? C.border : C.warn}`,
                    background: r.vehicle_id ? C.panel2 : '#fff8ec', color: r.vehicle_id ? C.text : C.warn,
                  }}
                >
                  {r.plate ?? (r.vehicle_id ? '…' : '+ mașină')}
                </button>
                {r.route_kind !== 'uzina' && (
                  <button
                    onClick={() => { setFoaieRow(r); setFoaieVal(r.foaie ?? ''); setFoaieErr(null); }}
                    style={{
                      padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'ui-monospace, monospace',
                      border: `1px dashed ${r.foaie ? C.border : C.muted}`,
                      background: C.panel, color: r.foaie ? C.text : C.muted,
                    }}
                  >{r.foaie ? `#${r.foaie}` : '+ foaie'}</button>
                )}
              </div>
              <button
                onClick={() => setSoferPicker(r)}
                style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${r.driver_id ? C.border : '#eee2d9'}`,
                  background: C.panel, color: r.driver_id ? C.muted : C.warn,
                }}
              >
                {r.driver_name ? shortName(r.driver_name) : (r.driver_id ? '…' : '+ șofer')}
              </button>
            </div>
          </div>
        );
      })}

      {picker && (
        <VehiclePicker
          direction={dir}
          defaultVehicleId={picker.template_vehicle_id}
          currentVehicleId={picker.vehicle_id}
          onPick={(vid) => pick(picker, vid)}
          onClose={() => setPicker(null)}
        />
      )}
      {soferPicker && (
        <SoferPicker
          direction={dir}
          currentDriverId={soferPicker.driver_id}
          allowRemove={soferPicker.route_kind === 'uzina'}
          onPick={(did) => pickSofer(soferPicker, did)}
          onClose={() => setSoferPicker(null)}
        />
      )}
      {foaieRow && (
        <div
          onClick={() => setFoaieRow(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: C.bg, width: '100%', borderRadius: '16px 16px 0 0', padding: '14px 14px 24px' }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Foaia de parcurs · {foaieRow.route_label}
            </div>
            <input
              inputMode="numeric"
              placeholder="nr. foii (gol = șterge)"
              value={foaieVal}
              onChange={(e) => setFoaieVal(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 16,
                border: `1px solid ${C.border}`, background: C.panel, boxSizing: 'border-box', marginBottom: 8,
              }}
            />
            {foaieErr && <div style={{ color: C.bad, fontSize: 13, marginBottom: 8 }}>{foaieErr}</div>}
            <button
              onClick={saveFoaie}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: C.accent, color: '#fff',
              }}
            >Salvează</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DirectiePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center', color: '#8a7f86' }}>Se încarcă…</div>}>
      <DirectieInner />
    </Suspense>
  );
}
