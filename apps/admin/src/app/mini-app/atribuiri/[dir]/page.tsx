'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { C, ready, api, chisinauDay, STATUS_BADGE, type AtribuireView } from '../ui';
import VehiclePicker from '../VehiclePicker';

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
            <button
              onClick={() => setPicker(r)}
              style={{
                flexShrink: 0, padding: '10px 14px', borderRadius: 10, fontSize: 16, fontWeight: 700,
                fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
                border: `2px solid ${r.vehicle_id ? C.border : C.warn}`,
                background: r.vehicle_id ? C.panel2 : '#fff8ec', color: r.vehicle_id ? C.text : C.warn,
              }}
            >
              {r.plate ?? (r.vehicle_id ? '…' : '+ mașină')}
            </button>
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
