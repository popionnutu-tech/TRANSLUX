'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { C, ready, api, chisinauDay, type AtribuireView } from '../ui';
import VehiclePicker from '../VehiclePicker';

// Landing-ul push-ului de nepotrivire (?date=&dir=): per rând «Corectează»
// (picker → modificat_reactiv) sau «A fost OK» (→ confirmat_manual).

function VerificaInner() {
  const search = useSearchParams();
  const date = search.get('date') ?? chisinauDay(-1);
  const dirFilter = search.get('dir');

  const [rows, setRows] = useState<AtribuireView[] | null>(null);
  const [picker, setPicker] = useState<AtribuireView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { ready(); }, []);

  const load = useCallback(() => {
    const dirQ = dirFilter ? `&dir=${encodeURIComponent(dirFilter)}` : '';
    api(`/zi?date=${date}${dirQ}`).then(async (r) => {
      if (!r.ok) { setErr('Acces doar pentru manageri.'); return; }
      const all = (await r.json()).rows as AtribuireView[];
      setRows(all.filter((x) => x.status === 'nepotrivire' || x.status === 'fara_date_gps'));
    }).catch(() => setErr('Rețea indisponibilă.'));
  }, [date, dirFilter]);

  useEffect(load, [load]);

  async function corecteaza(row: AtribuireView, vehicleId: string | null) {
    setPicker(null);
    await api('/atribuie', { method: 'POST', body: JSON.stringify({ rowId: row.id, vehicleId }) }).catch(() => null);
    load();
  }
  async function aFostOk(row: AtribuireView) {
    setRows((rs) => (rs ?? []).filter((r) => r.id !== row.id));
    await api('/confirma', { method: 'POST', body: JSON.stringify({ rowId: row.id }) }).catch(() => null);
    load();
  }

  if (err) return <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>{err}</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Link href="/mini-app/atribuiri" style={{ textDecoration: 'none', color: C.accent, fontSize: 22 }}>‹</Link>
        <h1 style={{ fontSize: 18, margin: 0 }}>Verificare {date}</h1>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px 32px' }}>
        GPS-ul nu a confirmat aceste curse — corectează mașina reală sau confirmă că a fost ok.
      </p>

      {!rows && <div style={{ color: C.muted, padding: 12 }}>Se încarcă…</div>}
      {rows && !rows.length && (
        <div style={{ padding: 24, textAlign: 'center', color: C.ok, fontSize: 15 }}>
          ✓ Nimic de verificat — toate cursele sunt confirmate.
        </div>
      )}

      {rows?.map((r) => (
        <div
          key={r.id}
          style={{ background: '#fdf0ef', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>{r.direction} · {r.route_label}</div>
          <div style={{ fontSize: 13, color: C.muted, margin: '2px 0 10px' }}>
            {r.plate ? `atribuită: ${r.plate}` : 'fără mașină atribuită'}
            {r.verification_note ? ` · ${r.verification_note}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPicker(r)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: C.accent, color: '#fff',
              }}
            >Corectează</button>
            <button
              onClick={() => aFostOk(r)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${C.ok}`, background: C.panel, color: C.ok,
              }}
            >A fost OK</button>
          </div>
        </div>
      ))}

      {picker && (
        <VehiclePicker
          direction={picker.direction}
          defaultVehicleId={picker.template_vehicle_id}
          currentVehicleId={picker.vehicle_id}
          onPick={(vid) => corecteaza(picker, vid)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

export default function VerificaPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center', color: '#8a7f86' }}>Se încarcă…</div>}>
      <VerificaInner />
    </Suspense>
  );
}
