'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSuburbanSchedule, saveSuburbanCycle, loadSuburbanEntries, finalizeSuburbanSession, type SuburbanSchedule, type TariffConfig, type DriverOption, type VehicleOption } from './actions';
import { saveSuburbanAuditCycle, loadSuburbanAuditEntries } from './auditActions';

interface Props {
  sessionId: string;
  crmRouteId: number;
  date: string;
  tariff: TariffConfig;
  canSeeSums: boolean;
  onSaved: (direction: 'tur' | 'retur') => void;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  mode?: 'normal' | 'audit';
  viewOnly?: boolean;
}

type CycleInputs = Record<number, { total: number; alighted: number }>; // key=stopOrder
type AllInputs = Record<number, CycleInputs>; // key=scheduleId
type AltAssignment = { driverId: string | null; vehicleId: string | null; show: boolean };

export default function SuburbanCountingForm({
  sessionId, crmRouteId, date, tariff, canSeeSums, onSaved, drivers, vehicles, mode = 'normal', viewOnly = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [tur, setTur] = useState<SuburbanSchedule[]>([]);
  const [retur, setRetur] = useState<SuburbanSchedule[]>([]);
  const [inputs, setInputs] = useState<AllInputs>({});
  const [altMap, setAltMap] = useState<Record<number, AltAssignment>>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      const { tur, retur } = await getSuburbanSchedule(crmRouteId, date);
      setTur(tur);
      setRetur(retur);
      const existing = mode === 'audit'
        ? await loadSuburbanAuditEntries(sessionId)
        : await loadSuburbanEntries(sessionId);
      const map: AllInputs = {};
      const alts: Record<number, AltAssignment> = {};
      const saved = new Set<number>();
      for (const e of existing) {
        if (!e.scheduleId) continue;
        if (!map[e.scheduleId]) map[e.scheduleId] = {};
        map[e.scheduleId][e.stopOrder] = { total: e.totalPassengers, alighted: e.alighted };
        saved.add(e.scheduleId);
        if (e.altDriverId || e.altVehicleId) {
          alts[e.scheduleId] = { driverId: e.altDriverId, vehicleId: e.altVehicleId, show: true };
        }
      }
      setInputs(map);
      setAltMap(alts);
      setSavedIds(saved);
      setLoading(false);
    })();
  }, [sessionId, crmRouteId, date, mode]);

  const setInput = useCallback((scheduleId: number, stopOrder: number, key: 'total' | 'alighted', value: number) => {
    setInputs(prev => ({
      ...prev,
      [scheduleId]: {
        ...(prev[scheduleId] || {}),
        [stopOrder]: {
          ...(prev[scheduleId]?.[stopOrder] || { total: 0, alighted: 0 }),
          [key]: value,
        },
      },
    }));
  }, []);

  function cycleTotal(sched: SuburbanSchedule): number {
    const cycle = inputs[sched.scheduleId] || {};
    const sortedStops = [...sched.stops].sort((a, b) => a.stopOrder - b.stopOrder);
    let total = 0;

    // TUR: la fiecare stație intermediară, nr = pasageri în autobuz plecând spre Briceni.
    // Venit per tronson = pasageri × km_tronson × rată.
    for (let i = 0; i < sortedStops.length - 1; i++) {
      const cur = sortedStops[i];
      const next = sortedStops[i + 1];
      const tronsonKm = Math.abs(next.kmFromStart - cur.kmFromStart);
      const tur = cycle[cur.stopOrder]?.total ?? 0;
      total += tur * tronsonKm * tariff.ratePerKmSuburban;
    }

    // RETUR: direcție inversă (Briceni → sat). La fiecare stație (exceptând prima),
    // nr = pasageri în autobuz plecând spre stația următoare (în direcția satului).
    for (let i = sortedStops.length - 1; i > 0; i--) {
      const cur = sortedStops[i];
      const prev = sortedStops[i - 1];
      const tronsonKm = Math.abs(cur.kmFromStart - prev.kmFromStart);
      const retur = cycle[cur.stopOrder]?.alighted ?? 0;
      total += retur * tronsonKm * tariff.ratePerKmSuburban;
    }

    return Math.round(total);
  }

  async function save(sched: SuburbanSchedule) {
    const entries = sched.stops.map(s => ({
      stopOrder: s.stopOrder,
      stopNameRo: s.nameRo,
      kmFromStart: s.kmFromStart,
      totalPassengers: inputs[sched.scheduleId]?.[s.stopOrder]?.total ?? 0,
      alighted: inputs[sched.scheduleId]?.[s.stopOrder]?.alighted ?? 0,
    }));
    const total = cycleTotal(sched);
    const alt = altMap[sched.scheduleId];
    const saveFn = mode === 'audit' ? saveSuburbanAuditCycle : saveSuburbanCycle;
    const { error } = await saveFn(
      sessionId, sched.scheduleId, sched.direction, sched.sequenceNo, entries, total,
      alt?.driverId || null, alt?.vehicleId || null,
    );
    if (error) {
      setSaveMsg(prev => ({ ...prev, [sched.scheduleId]: 'Eroare: ' + error }));
      return;
    }
    setSavedIds(prev => new Set(prev).add(sched.scheduleId));
    setSaveMsg(prev => ({ ...prev, [sched.scheduleId]: 'Salvat ✓' }));
    setTimeout(() => setSaveMsg(prev => { const n = { ...prev }; delete n[sched.scheduleId]; return n; }), 2000);
    onSaved(sched.direction);
  }

  // Enter/Space avansează la următorul input:
  // întâi toate TUR ale ciclului, apoi toate RETUR, apoi următorul ciclu.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const cur = e.currentTarget;
    const cycleId = Number(cur.dataset.cycleId);
    const dir = cur.dataset.dir as 'tur' | 'retur';
    const stopOrder = Number(cur.dataset.stopOrder);

    const allCycles = [...tur, ...retur];
    const cycleIdx = allCycles.findIndex(c => c.scheduleId === cycleId);
    if (cycleIdx < 0) return;
    const curCycle = allCycles[cycleIdx];
    const stops = [...curCycle.stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const stopIdx = stops.findIndex(s => s.stopOrder === stopOrder);

    let nextKey: string | null = null;
    if (dir === 'tur') {
      if (stopIdx < stops.length - 1) {
        nextKey = `${cycleId}-tur-${stops[stopIdx + 1].stopOrder}`;
      } else {
        nextKey = `${cycleId}-retur-${stops[0].stopOrder}`;
      }
    } else {
      if (stopIdx < stops.length - 1) {
        nextKey = `${cycleId}-retur-${stops[stopIdx + 1].stopOrder}`;
      } else if (cycleIdx < allCycles.length - 1) {
        const next = allCycles[cycleIdx + 1];
        const nextStops = [...next.stops].sort((a, b) => a.stopOrder - b.stopOrder);
        nextKey = `${next.scheduleId}-tur-${nextStops[0].stopOrder}`;
      }
    }

    if (nextKey) {
      const el = document.querySelector<HTMLInputElement>(`input[data-key="${nextKey}"]`);
      if (el) {
        el.focus();
        el.select();
      }
    }
  }

  if (loading) return <p className="text-muted">Se încarcă orarul…</p>;

  const renderCycle = (sched: SuburbanSchedule, headerColor: string) => {
    const done = savedIds.has(sched.scheduleId);
    const start = sched.stops[0];
    const end = sched.stops[sched.stops.length - 1];
    const total = canSeeSums ? cycleTotal(sched) : 0;
    const msg = saveMsg[sched.scheduleId];
    return (
      <div
        key={sched.scheduleId}
        className="card"
        style={{
          padding: 10,
          marginBottom: 10,
          borderLeft: `4px solid ${done ? 'var(--success, #0a7)' : headerColor}`,
          background: done ? 'rgba(0,170,90,0.04)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ color: headerColor }}>
            {sched.direction.toUpperCase()} — Cursa {sched.sequenceNo}
          </strong>
          <span style={{ fontSize: 13, color: '#555' }}>
            {start?.stopTime} {start?.nameRo} → {end?.nameRo} {end?.stopTime}
            {done && <span style={{ marginLeft: 8, color: 'var(--success, #0a7)' }}>✓ salvat</span>}
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {canSeeSums && <strong>{total} lei</strong>}
            {!viewOnly && <button className="btn btn-primary btn-sm" onClick={() => save(sched)}>Salvează</button>}
            {msg && <span style={{ fontSize: 12 }}>{msg}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
          {viewOnly ? (
            altMap[sched.scheduleId]?.driverId || altMap[sched.scheduleId]?.vehicleId ? (
              <span className="text-muted">
                Alt șofer/mașină: {drivers.find(d => d.id === altMap[sched.scheduleId]?.driverId)?.full_name || '—'}
                {' / '}
                {vehicles.find(v => v.id === altMap[sched.scheduleId]?.vehicleId)?.plate_number || '—'}
              </span>
            ) : null
          ) : altMap[sched.scheduleId]?.show ? (
            <>
              <span className="text-muted">Alt șofer/mașină:</span>
              <select
                value={altMap[sched.scheduleId]?.driverId || ''}
                onChange={e => setAltMap(prev => ({ ...prev, [sched.scheduleId]: { ...(prev[sched.scheduleId] || { show: true, driverId: null, vehicleId: null }), driverId: e.target.value || null, show: true } }))}
                style={{ fontSize: 12 }}
              >
                <option value="">— șofer —</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
              <select
                value={altMap[sched.scheduleId]?.vehicleId || ''}
                onChange={e => setAltMap(prev => ({ ...prev, [sched.scheduleId]: { ...(prev[sched.scheduleId] || { show: true, driverId: null, vehicleId: null }), vehicleId: e.target.value || null, show: true } }))}
                style={{ fontSize: 12 }}
              >
                <option value="">— mașină —</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
              </select>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setAltMap(prev => { const n = { ...prev }; delete n[sched.scheduleId]; return n; })}
              >
                Elimin
              </button>
            </>
          ) : (
            <button
              className="btn btn-outline btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => setAltMap(prev => ({ ...prev, [sched.scheduleId]: { driverId: null, vehicleId: null, show: true } }))}
            >
              + altă mașină/șofer pentru această cursă
            </button>
          )}
        </div>
        <table className="table" style={{ fontSize: 13, margin: 0 }}>
          <thead>
            <tr>
              <th>Stație</th>
              <th>Oră</th>
              <th>Km</th>
              <th title="Pasageri urcați din sat spre Briceni">TUR</th>
              <th title="Pasageri coborâți din Briceni spre sat">RETUR</th>
            </tr>
          </thead>
          <tbody>
            {sched.stops.map(s => (
              <tr key={s.stopId}>
                <td><strong>{s.nameRo}</strong></td>
                <td>{s.stopTime}</td>
                <td>{s.kmFromStart}</td>
                <td>
                  <input
                    data-key={`${sched.scheduleId}-tur-${s.stopOrder}`}
                    data-cycle-id={sched.scheduleId}
                    data-dir="tur"
                    data-stop-order={s.stopOrder}
                    type="number"
                    min={0}
                    value={inputs[sched.scheduleId]?.[s.stopOrder]?.total ?? ''}
                    onChange={e => setInput(sched.scheduleId, s.stopOrder, 'total', parseInt(e.target.value) || 0)}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.target.select()}
                    disabled={viewOnly}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    data-key={`${sched.scheduleId}-retur-${s.stopOrder}`}
                    data-cycle-id={sched.scheduleId}
                    data-dir="retur"
                    data-stop-order={s.stopOrder}
                    type="number"
                    min={0}
                    value={inputs[sched.scheduleId]?.[s.stopOrder]?.alighted ?? ''}
                    onChange={e => setInput(sched.scheduleId, s.stopOrder, 'alighted', parseInt(e.target.value) || 0)}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.target.select()}
                    disabled={viewOnly}
                    style={{ width: 70 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const grandTotal = canSeeSums ? [...tur, ...retur].reduce((s, sch) => s + cycleTotal(sch), 0) : 0;

  return (
    <div>
      {mode === 'audit' && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(155,27,48,0.12)',
          color: '#9B1B30',
          fontWeight: 600,
          marginBottom: 12,
          borderRadius: 6,
          border: '1px solid rgba(155,27,48,0.3)',
        }}>
          🔍 MOD AUDIT — numărare independentă
        </div>
      )}
      {canSeeSums && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div><span className="text-muted">Total zi:</span> <strong>{grandTotal} lei</strong></div>
          <div><span className="text-muted">Rata:</span> <strong>{tariff.ratePerKmSuburban} lei/km</strong></div>
          <div><span className="text-muted">Curse:</span> <strong>{tur.length + retur.length}</strong> ({savedIds.size} salvate)</div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>Enter/Space = următorul câmp</div>
        </div>
      )}

      {tur.length > 0 && (
        <>
          <h3 style={{ color: 'var(--primary, #9b1b30)', marginBottom: 6 }}>TUR ({tur.length})</h3>
          {tur.map(s => renderCycle(s, 'var(--primary, #9b1b30)'))}
        </>
      )}

      {retur.length > 0 && (
        <>
          <h3 style={{ color: '#1b6e9b', marginBottom: 6, marginTop: 12 }}>RETUR ({retur.length})</h3>
          {retur.map(s => renderCycle(s, '#1b6e9b'))}
        </>
      )}

      {tur.length === 0 && retur.length === 0 && (
        <p className="text-muted">Nu sunt curse pentru ziua selectată.</p>
      )}

      {mode === 'normal' && !viewOnly && (tur.length + retur.length) > 0 && (() => {
        const expected = tur.length + retur.length;
        const saved = savedIds.size;
        const allSaved = saved >= expected;
        const handleFinalize = async () => {
          if (!allSaved) {
            const missing = expected - saved;
            if (!confirm(`Mai sunt ${missing} ${missing === 1 ? 'cursă nesalvată' : 'curse nesalvate'}. Finalizezi ruta oricum?`)) return;
          }
          const { error } = await finalizeSuburbanSession(sessionId);
          if (error) {
            alert('Eroare la finalizare: ' + error);
            return;
          }
          onSaved('retur');
        };
        return (
          <div className="card" style={{ padding: 12, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: allSaved ? 'var(--success, #0a7)' : '#555' }}>
              {allSaved
                ? `✓ Toate cursele salvate (${saved}/${expected}) — ruta a fost deja marcată Finalizat.`
                : `${saved}/${expected} curse salvate.`}
            </div>
            <button
              className="btn btn-primary"
              onClick={handleFinalize}
              disabled={saved === 0}
              title={saved === 0 ? 'Salvează cel puțin o cursă întâi' : ''}
            >
              Finalizează ruta
            </button>
          </div>
        );
      })()}
    </div>
  );
}
