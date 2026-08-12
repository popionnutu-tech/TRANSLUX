'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { C, ready, api, chisinauDay, shortName, STATUS_BADGE, type AtribuireView } from '../ui';
import VehiclePicker from '../VehiclePicker';
import SoferPicker from '../SoferPicker';
import { weekDates } from '@/lib/atribuiri/saptamana';

// Ecranul critic de viteză: lista curselor direcției cu chip-ul mașinii —
// un tap deschide picker-ul, un tap în picker salvează (optimist).

function DirectieInner() {
  const params = useParams<{ dir: string }>();
  const search = useSearchParams();
  const dir = decodeURIComponent(params.dir);
  const date = search.get('date') ?? chisinauDay(0);

  // săptămâna ISO a zilei afișate — pentru «Aplică și pe alte zile?»
  const saptamana = weekDates(date);
  const ZI = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];

  const [rows, setRows] = useState<AtribuireView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [picker, setPicker] = useState<AtribuireView | null>(null);
  const [soferPicker, setSoferPicker] = useState<AtribuireView | null>(null);
  const [foaieRow, setFoaieRow] = useState<AtribuireView | null>(null);
  const [foaieVal, setFoaieVal] = useState('');
  const [foaieErr, setFoaieErr] = useState<string | null>(null);
  const [multiZi, setMultiZi] = useState<{ row: AtribuireView; vehicleId?: string | null; driverId?: string | null } | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [multiErr, setMultiErr] = useState<string | null>(null);

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
    setActErr(null);
    // optimist: chip-ul se schimbă imediat, revert la eroare
    const prev = rows;
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, vehicle_id: vehicleId, plate: null } : r)));
    const resp = await api('/atribuie', { method: 'POST', body: JSON.stringify({ rowId: row.id, vehicleId }) })
      .catch(() => null);
    if (!resp) { setRows(prev); setActErr('Rețea indisponibilă.'); return; }
    if (!resp.ok) {
      setRows(prev);
      setActErr(((await resp.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Eroare');
      return;
    }
    load();
    // panoul «Aplică și pe alte zile?» doar la atribuire efectivă de mașină —
    // niciodată la eliminare (vehicleId null ar propaga ștergerea pe alte zile)
    if (row.route_kind === 'uzina' && vehicleId) { setMultiZi({ row, vehicleId }); setMultiSel([]); setMultiErr(null); }
  }

  async function pickSofer(row: AtribuireView, driverId: string | null) {
    setSoferPicker(null);
    setActErr(null);
    const prev = rows;
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, driver_id: driverId, driver_name: null } : r)));
    const resp = await api('/sofer', { method: 'POST', body: JSON.stringify({ rowId: row.id, driverId }) })
      .catch(() => null);
    if (!resp) { setRows(prev); setActErr('Rețea indisponibilă.'); return; }
    if (!resp.ok) {
      setRows(prev);
      setActErr(((await resp.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Eroare');
      return;
    }
    load();
    // doar dacă rândul are deja mașină — fără mașină, atribuie-multi ar șterge
    // atribuirile existente pe zilele selectate (vehicleId null → wipe).
    // vehicleId omis (F4): nu suprascrie tăcut mașina din alte zile — atinge doar șoferul.
    if (row.route_kind === 'uzina' && row.vehicle_id) { setMultiZi({ row, driverId }); setMultiSel([]); setMultiErr(null); }
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

  async function aplicaMultiZi() {
    if (!multiZi || !multiSel.length) return;
    setMultiErr(null);
    const resp = await api('/atribuie-multi', {
      method: 'POST',
      body: JSON.stringify({
        factoryRouteId: multiZi.row.factory_route_id, shiftNumber: multiZi.row.shift_number,
        dates: multiSel, vehicleId: multiZi.vehicleId, driverId: multiZi.driverId,
      }),
    }).catch(() => null);
    if (!resp) { setMultiErr('Rețea indisponibilă.'); return; }
    if (!resp.ok) { setMultiErr(((await resp.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Eroare'); return; }
    const updated = ((await resp.json().catch(() => null)) as { updated?: number } | null)?.updated ?? 0;
    if (!updated) { setMultiErr('Nicio zi actualizată (rutele nu există pe zilele alese?).'); return; }
    setMultiZi(null);
    setMultiSel([]);
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
      {actErr && <div style={{ color: C.bad, padding: 12 }}>{actErr}</div>}
      {!rows && !err && <div style={{ color: C.muted, padding: 12 }}>Se încarcă…</div>}

      {rows?.map((r) => {
        const badge = STATUS_BADGE[r.status];
        return (
          <div
            key={r.id}
            style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10,
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
            {multiZi?.row.id === r.id && (
              <div style={{ flexBasis: '100%', background: '#eff6ff', borderRadius: 9, padding: 8, marginTop: 6 }}>
                <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600, marginBottom: 6 }}>Aplică și pe alte zile?</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {saptamana.filter((d) => d !== date).map((d) => {
                    const on = multiSel.includes(d);
                    return (
                      <button key={d}
                        onClick={() => setMultiSel((s) => (on ? s.filter((x) => x !== d) : [...s, d]))}
                        style={{
                          width: 30, padding: '5px 0', borderRadius: 7, fontSize: 11, border: 'none', cursor: 'pointer',
                          background: on ? '#2563eb' : '#dbeafe', color: on ? '#fff' : '#1d4ed8', fontWeight: on ? 700 : 400,
                        }}>{ZI[saptamana.indexOf(d)]}</button>
                    );
                  })}
                  <button onClick={aplicaMultiZi} disabled={!multiSel.length}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, border: 'none',
                      cursor: multiSel.length ? 'pointer' : 'default',
                      background: multiSel.length ? '#2563eb' : '#dbeafe', color: multiSel.length ? '#fff' : '#93b3ed',
                    }}>Aplică</button>
                  <button onClick={() => setMultiZi(null)}
                    style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11, border: 'none', background: 'transparent', color: '#1d4ed8', cursor: 'pointer' }}>✕</button>
                </div>
                {multiErr && <div style={{ color: C.bad, fontSize: 11, marginTop: 6 }}>{multiErr}</div>}
              </div>
            )}
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
          allowRemove={soferPicker.route_kind === 'uzina' && !soferPicker.vehicle_id}
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
